import { Registry } from "../../plugin-system/registry.js";
import DOMPurify from "dompurify";
import { ReaderService } from "./reader-service.js";
import { Modals } from "../../components/modals.js";
import { State } from "../../core/state.js";
import { Utils } from "../../core/utils.js";
import { DB } from "../../core/db.js";
import { Events } from "../../core/events.js";

export const ReaderView = {
  _scrollHandler: null,
  _lastScrollContainer: null,
  _resizeObserver: null,

  setupListeners: function () {
    window.closeModal = () => {
      this.closeModal();
    };

    window.addEventListener("popstate", (event) => {
      const modal = document.getElementById("read-modal");
      if (
        modal &&
        modal.classList.contains("open") &&
        (!event.state || !event.state.readingView)
      ) {
        this.closeModal(true); // true = skip history back
      }
    });

    document
      .getElementById("btn-toggle-favorite")
      ?.addEventListener("click", () => {
        this.toggleCurrentFavorite();
      });

    document
      .getElementById("btn-share-article")
      ?.addEventListener("click", () => {
        this.shareCurrentArticle();
      });

    // Listen for Article Read event to trigger animation
    Events.on(Events.ARTICLE_READ, (data) => {
      if (data.guid === State.currentArticleGuid) {
        const indicator = document.querySelector(".read-indicator");
        if (indicator) {
          indicator.classList.add("show");
          setTimeout(() => indicator.classList.remove("show"), 2500);
        }
      }
    });
  },

  openArticle: async function (articleInput) {
    State.currentArticleGuid = articleInput.guid;

    const modal = document.getElementById("read-modal");
    if (!modal) return;

    // Setup Read Indicator if missing
    if (!modal.querySelector(".read-indicator")) {
      const indicator = document.createElement("div");
      indicator.className = "read-indicator";
      indicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      modal.querySelector(".modal").appendChild(indicator);
    }

    let article = articleInput;
    try {
      const freshData = await DB.getArticle(articleInput.guid);
      if (freshData) {
        article = { ...articleInput, ...freshData };
      }
    } catch (e) {
      console.warn("Failed to fetch fresh article data", e);
    }

    // Initialize Service state
    ReaderService.resetState(article);

    history.pushState(
      { readingView: true, articleGuid: article.guid },
      "",
      "#article",
    );

    this.updateFavoriteButtonState(article.favorite);
    const scrollContainer = modal.querySelector(".reader-scroll-container");
    if (scrollContainer) scrollContainer.scrollTop = 0;

    // Render Reader Plugins (Header, Footer, Actions)
    this.renderPlugins(article);

    // --- Scroll Tracking Logic ---
    if (this._scrollHandler && this._lastScrollContainer) {
      this._lastScrollContainer.removeEventListener(
        "scroll",
        this._scrollHandler,
      );
    }

    this._lastScrollContainer = scrollContainer;

    // Debounce update to DB
    this._scrollHandler = Utils.throttle(() => {
      this._updateProgress(scrollContainer);
    }, 300);

    scrollContainer.addEventListener("scroll", this._scrollHandler);

    // Resize Observer for dynamic content (images loading, full content injection)
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
      this._applyRestoreScroll(); // Try restoring if pending
      this._updateProgress(scrollContainer);
    });

    const heroEl = document.getElementById("reader-hero");
    const titleEl = document.getElementById("reader-title");
    const feedTitleEl = document.getElementById("reader-feed-title");
    const dateEl = document.getElementById("reader-date");
    const contentEl = document.getElementById("reader-content");
    const linkEl = document.getElementById("btn-visit-website");

    if (heroEl) {
      if (article.image) {
        heroEl.style.backgroundImage = `url('${article.image}')`;
        heroEl.style.display = "block";
      } else {
        heroEl.style.display = "none";
      }
    }

    if (titleEl) titleEl.textContent = article.title;
    if (feedTitleEl) feedTitleEl.textContent = article.feedTitle;

    if (dateEl) {
      try {
        dateEl.textContent = Utils.formatRelativeTime(article.pubDate);
        const fullDate = Utils.formatFullDate(article.pubDate);
        dateEl.setAttribute("data-tooltip", fullDate);
        dateEl.style.cursor = "help";
      } catch (e) {
        dateEl.textContent = article.pubDate;
      }
    }

    if (contentEl) {
      contentEl.setAttribute("data-guid", article.guid);
      // Observe content element for size changes
      this._resizeObserver.observe(contentEl);

      // --- Media Player Injection ---
      let mediaHtml = "";
      if (article.mediaType === "audio" && article.mediaUrl) {
        mediaHtml = `
                <div class="media-player-container">
                    <audio controls style="width: 100%; margin-bottom: 16px; border-radius: 8px;">
                        <source src="${article.mediaUrl}" type="audio/mpeg">
                        Your browser does not support the audio element.
                    </audio>
                </div>`;
      } else if (article.mediaType === "youtube" && article.mediaUrl) {
        mediaHtml = `
                <div class="media-player-container" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin-bottom: 16px; border-radius: 12px;">
                    <iframe
                        src="https://www.youtube.com/embed/${article.mediaUrl}"
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen>
                    </iframe>
                </div>`;
      } else if (article.mediaType === "video" && article.mediaUrl) {
        mediaHtml = `
                <div class="media-player-container">
                    <video controls style="width: 100%; margin-bottom: 16px; border-radius: 12px;">
                        <source src="${article.mediaUrl}">
                        Your browser does not support the video element.
                    </video>
                </div>`;
      }

      if (article.fullContent) {
        // Sanitized full content
        contentEl.innerHTML =
          mediaHtml + DOMPurify.sanitize(article.fullContent);
        // Schedule restore after layout
        setTimeout(() => {
          this._applyRestoreScroll();
          this._updateProgress(scrollContainer);
        }, 100);
      } else {
        const baseContent =
          article.content || article.description || `<p>${article.snippet}</p>`;

        if (article.mediaType === "youtube") {
          contentEl.innerHTML = mediaHtml + DOMPurify.sanitize(baseContent);
          setTimeout(() => {
            this._applyRestoreScroll();
            this._updateProgress(scrollContainer);
          }, 100);
        } else {
          ReaderService.setLoadingContent(true); // Block progress updates
          const loadingHtml = `<div class="full-content-loader">Fetching full article content...</div>`;
          // Sanitized base content
          contentEl.innerHTML =
            mediaHtml + loadingHtml + DOMPurify.sanitize(baseContent);

          ReaderService.fetchFullArticle(article.link).then((fullHtml) => {
            const currentGuid = contentEl.getAttribute("data-guid");
            if (currentGuid !== article.guid) return;

            ReaderService.setLoadingContent(false); // Unblock progress updates

            if (fullHtml) {
              const oldText = article.content || article.snippet || "";
              const oldWc = Utils.countWords(oldText);
              const newWc = Utils.countWords(Utils.divToText(fullHtml));
              const diff = newWc - oldWc;

              article.fullContent = fullHtml;
              article.contentFetchFailed = false; // Reset failure flag in object
              ReaderService.setContentFetchFailed(false); // Reset local flag

              ReaderService.saveArticle(article).then(() => {
                if (diff !== 0 && article.feedId) {
                  return ReaderService.updateFeedReadStats(
                    article.feedId,
                    diff,
                  );
                }
              });

              // Sanitized full content
              contentEl.innerHTML = mediaHtml + DOMPurify.sanitize(fullHtml);
              Utils.showToast("Article optimized");
            } else {
              const loader = contentEl.querySelector(".full-content-loader");
              if (loader) {
                loader.innerHTML =
                  "Unable to fetch full content.<br>Showing summary only.";
                loader.style.color = "var(--text-muted)";
              }
              Utils.showToast("Could not retrieve full content");

              // Mark as failed in DB
              article.contentFetchFailed = true;
              ReaderService.setContentFetchFailed(true); // Set local flag

              ReaderService.saveArticle(article);
            }
            // Trigger restoration and check now that content is loaded
            setTimeout(() => {
              this._applyRestoreScroll();
              this._updateProgress(scrollContainer);
            }, 100);
          });
        }
      }
    }

    if (linkEl) linkEl.href = article.link;
    Modals.toggleModal("read-modal", true);
    document.body.classList.add("modal-open");

    // Initial check if content is already there and not loading
    setTimeout(() => {
      this._updateProgress(scrollContainer);
    }, 100);
  },

  _updateProgress: function (scrollContainer) {
    if (!scrollContainer) return;

    // Calculate dynamic threshold based on line height
    let threshold = 150; // Default fallback
    const contentEl = document.getElementById("reader-content");
    if (contentEl) {
      const style = window.getComputedStyle(contentEl);
      const lineHeight = parseFloat(style.lineHeight);
      if (!isNaN(lineHeight)) {
        // Threshold = 5 lines of text
        threshold = lineHeight * 5;
      }
    }

    // Ensure reasonable bounds (min 50px, max 400px)
    threshold = Math.max(50, Math.min(400, threshold));

    ReaderService.calculateProgress(
      scrollContainer.scrollTop,
      scrollContainer.scrollHeight,
      scrollContainer.clientHeight,
      threshold,
    );
  },

  _applyRestoreScroll: function () {
    const restoreProgress = ReaderService.getRestoreProgress();
    if (restoreProgress > 0 && this._lastScrollContainer) {
      const el = this._lastScrollContainer;
      // Only restore if we have scrollable content
      if (el.scrollHeight > el.clientHeight) {
        const target = restoreProgress * (el.scrollHeight - el.clientHeight);
        // If the target is significant, scroll to it
        if (target > 10) {
          el.scrollTop = target;
        }
        ReaderService.clearRestoreProgress(); // Clear flag so we don't jump again
      }
    }
  },

  closeModal: function (skipHistoryBack) {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    // Force final check before closing to capture end of read
    if (this._lastScrollContainer) {
      ReaderService.calculateProgress(
        this._lastScrollContainer.scrollTop,
        this._lastScrollContainer.scrollHeight,
        this._lastScrollContainer.clientHeight,
      );
    }

    if (this._scrollHandler && this._lastScrollContainer) {
      this._lastScrollContainer.removeEventListener(
        "scroll",
        this._scrollHandler,
      );
      this._scrollHandler = null;
    }
    this._lastScrollContainer = null;

    // Clear content to stop media playback
    const contentEl = document.getElementById("reader-content");
    if (contentEl) {
      contentEl.innerHTML = "";
    }

    if (!skipHistoryBack && history.state && history.state.readingView)
      history.back();
    else {
      Modals.toggleModal("read-modal", false);
      document.body.classList.remove("modal-open");
      State.currentArticleGuid = null;
      Events.emit(Events.ARTICLES_UPDATED);
    }
  },

  updateFavoriteButtonState: function (isFavorite) {
    const btn = document.getElementById("btn-toggle-favorite");
    if (!btn) return;
    const svg = btn.querySelector("svg");
    if (isFavorite) {
      btn.classList.add("active");
      svg.setAttribute("fill", "currentColor");
      svg.setAttribute("stroke", "none");
    } else {
      btn.classList.remove("active");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
    }
  },

  toggleCurrentFavorite: async function () {
    if (!State.currentArticleGuid) return;
    const newState = await ReaderService.toggleFavorite(
      State.currentArticleGuid,
    );
    this.updateFavoriteButtonState(newState);
    const msg = newState ? "Added to Favorites" : "Removed from Favorites";
    Utils.showToast(msg);
  },

  shareCurrentArticle: async function () {
    if (!State.currentArticleGuid) return;

    const article = await DB.getArticle(State.currentArticleGuid);
    if (!article) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.snippet || article.title,
          url: article.link,
        });
      } catch (err) {
        console.log("Share canceled or failed", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(article.link);
        Utils.showToast("Link copied to clipboard");
      } catch (err) {
        Utils.showToast("Failed to copy link");
      }
    }
  },

  renderPlugins: function (article) {
    // 1. Reader Header
    const headerContainer = document.getElementById("reader-plugin-header");
    if (headerContainer) {
      headerContainer.innerHTML = "";
      const headers = Registry.getExtensions("reader:header");
      headers.forEach((item) => {
        if (typeof item.render === "function") {
          const el = item.render(article);
          if (el) {
            if (typeof el === "string") {
              const div = document.createElement("div");
              div.innerHTML = DOMPurify.sanitize(el);
              headerContainer.appendChild(div);
            } else {
              headerContainer.appendChild(el);
            }
          }
        }
      });
    }

    // 2. Reader Footer
    const footerContainer = document.getElementById("reader-footer");
    if (footerContainer) {
      footerContainer.innerHTML = "";
      const footers = Registry.getExtensions("reader:footer");
      footers.forEach((item) => {
        if (typeof item.render === "function") {
          const el = item.render(article);
          if (el) {
            if (typeof el === "string") {
              const div = document.createElement("div");
              div.innerHTML = DOMPurify.sanitize(el);
              footerContainer.appendChild(div);
            } else {
              footerContainer.appendChild(el);
            }
          }
        }
      });
    }

    // 3. Reader Actions (Header Icons)
    const actionsContainer = document.getElementById(
      "reader-actions-container",
    );
    if (actionsContainer) {
      actionsContainer.innerHTML = "";
      const actions = Registry.getExtensions("reader:action");
      actions.forEach((action) => {
        const btn = document.createElement("button");
        btn.className = "icon-btn";
        btn.title = action.label || "";
        btn.innerHTML = DOMPurify.sanitize(action.icon || "");
        btn.onclick = () => {
          if (action.onClick) action.onClick(article);
        };
        actionsContainer.appendChild(btn);
      });
    }
  },
};
