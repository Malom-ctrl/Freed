import { DB } from "./db.js";
import { Service } from "./rss-service.js";
import { Tools } from "./tools.js";
import { Utils } from "./utils.js";
import { State } from "./state.js";
import { UI } from "./ui-renderer.js";
import DOMPurify from "dompurify";

export const Reader = {
  _scrollHandler: null,
  _lastScrollContainer: null,
  _resizeObserver: null,
  _currentMaxProgress: 0,
  _isLoadingContent: false,
  _contentFetchFailed: false,
  _restoreProgress: 0,

  _checkProgress: function (scrollContainer) {
    if (!State.currentArticleGuid || !scrollContainer) return;

    // Prevent premature read status if waiting for content or if content fetch failed
    if (this._isLoadingContent || this._contentFetchFailed) return;

    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;

    if (scrollHeight <= clientHeight) {
      // Only mark as read if content exists and is not loading
      if (scrollHeight > 0 && this._currentMaxProgress < 1) {
        this._currentMaxProgress = 1;
        DB.updateReadingProgress(State.currentArticleGuid, 1, true);
      }
      return;
    }

    let progress = scrollTop / (scrollHeight - clientHeight);

    // End detection: allow 20px buffer for bottom reached
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      progress = 1;
    }

    progress = Math.min(1, Math.max(0, progress));

    // Monotonic check: only update if progress increased
    if (progress > this._currentMaxProgress) {
      this._currentMaxProgress = progress;
      const isRead = progress > 0.95;
      DB.updateReadingProgress(
        State.currentArticleGuid,
        progress,
        isRead ? true : undefined,
      );
    }
  },

  _applyRestoreScroll: function () {
    if (this._restoreProgress > 0 && this._lastScrollContainer) {
      const el = this._lastScrollContainer;
      // Only restore if we have scrollable content
      if (el.scrollHeight > el.clientHeight) {
        const target =
          this._restoreProgress * (el.scrollHeight - el.clientHeight);
        // If the target is significant, scroll to it
        if (target > 10) {
          el.scrollTop = target;
        }
        this._restoreProgress = 0; // Clear flag so we don't jump again
      }
    }
  },

  openArticle: async function (articleInput, onRefreshNeeded) {
    State.currentArticleGuid = articleInput.guid;

    const modal = document.getElementById("read-modal");
    if (!modal) return;

    let article = articleInput;
    try {
      const freshData = await DB.getArticle(articleInput.guid);
      if (freshData) {
        article = { ...articleInput, ...freshData };
      }
    } catch (e) {
      console.warn("Failed to fetch fresh article data", e);
    }

    // Initialize state
    this._currentMaxProgress = article.readingProgress || 0;
    this._isLoadingContent = false;
    this._contentFetchFailed = !!article.contentFetchFailed;

    // Determine if we should restore position later
    // Don't restore for read or favorited articles (start from top)
    this._restoreProgress = 0;
    if (article.readingProgress > 0 && !article.read && !article.favorite) {
      this._restoreProgress = article.readingProgress;
    }

    history.pushState(
      { readingView: true, articleGuid: article.guid },
      "",
      "#article",
    );

    this.updateFavoriteButtonState(article.favorite);
    const scrollContainer = modal.querySelector(".reader-scroll-container");
    if (scrollContainer) scrollContainer.scrollTop = 0;

    // Render Reader Plugins (Header, Footer, Actions)
    if (UI.renderReaderPlugins) {
      UI.renderReaderPlugins(article);
    }

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
      this._checkProgress(scrollContainer);
    }, 300);

    scrollContainer.addEventListener("scroll", this._scrollHandler);

    // Resize Observer for dynamic content (images loading, full content injection)
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
      this._applyRestoreScroll(); // Try restoring if pending
      this._checkProgress(scrollContainer);
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

      if (article.fullContent) {
        // Sanitized full content
        contentEl.innerHTML = DOMPurify.sanitize(article.fullContent);
        // Schedule restore after layout
        setTimeout(() => {
          this._applyRestoreScroll();
          this._checkProgress(scrollContainer);
        }, 100);
      } else {
        this._isLoadingContent = true; // Block progress updates
        const baseContent =
          article.content || article.description || `<p>${article.snippet}</p>`;
        const loadingHtml = `<div class="full-content-loader">Fetching full article content...</div>`;
        // Sanitized base content
        contentEl.innerHTML = loadingHtml + DOMPurify.sanitize(baseContent);

        Service.fetchFullArticle(article.link).then((fullHtml) => {
          const currentGuid = contentEl.getAttribute("data-guid");
          if (currentGuid !== article.guid) return;

          this._isLoadingContent = false; // Unblock progress updates

          if (fullHtml) {
            const oldText = article.content || article.snippet || "";
            const oldWc = Utils.countWords(oldText);
            const newWc = Utils.countWords(Utils.divToText(fullHtml));
            const diff = newWc - oldWc;

            article.fullContent = fullHtml;
            article.contentFetchFailed = false; // Reset failure flag in object
            this._contentFetchFailed = false; // Reset local flag

            DB.saveArticles([article])
              .then(() => {
                if (diff !== 0 && article.feedId) {
                  return DB.updateFeedReadStats(article.feedId, diff);
                }
              })
              .then(() => {
                if (onRefreshNeeded) onRefreshNeeded();
              });

            // Sanitized full content
            contentEl.innerHTML = DOMPurify.sanitize(fullHtml);
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
            this._contentFetchFailed = true; // Set local flag

            DB.saveArticles([article]).then(() => {
              if (onRefreshNeeded) onRefreshNeeded();
            });
          }
          // Trigger restoration and check now that content is loaded
          setTimeout(() => {
            this._applyRestoreScroll();
            this._checkProgress(scrollContainer);
          }, 100);
        });
      }
    }

    if (linkEl) linkEl.href = article.link;
    UI.toggleModal("read-modal", true);
    document.body.classList.add("modal-open");

    // Initial check if content is already there and not loading
    if (!this._isLoadingContent) {
      setTimeout(() => this._checkProgress(scrollContainer), 100);
    }
  },

  updateFavoriteButtonState: function (isFavorite) {
    const btn = document.getElementById("btn-toggle-favorite");
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

  toggleCurrentFavorite: async function (onRefreshNeeded) {
    if (!State.currentArticleGuid) return;
    const newState = await DB.toggleFavorite(State.currentArticleGuid);
    this.updateFavoriteButtonState(newState);
    const msg = newState ? "Added to Favorites" : "Removed from Favorites";
    Utils.showToast(msg);
    if (onRefreshNeeded) onRefreshNeeded();
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

  closeModal: function () {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    // Force final check before closing to capture end of read
    if (this._lastScrollContainer) {
      this._checkProgress(this._lastScrollContainer);
    }

    if (this._scrollHandler && this._lastScrollContainer) {
      this._lastScrollContainer.removeEventListener(
        "scroll",
        this._scrollHandler,
      );
      this._scrollHandler = null;
    }
    this._lastScrollContainer = null;
    this._isLoadingContent = false;
    this._contentFetchFailed = false;
    this._restoreProgress = 0;

    if (history.state && history.state.readingView) history.back();
    else {
      UI.toggleModal("read-modal", false);
      document.body.classList.remove("modal-open");
      State.currentArticleGuid = null;
      window.dispatchEvent(new CustomEvent("freed:refresh-ui"));
    }
  },
};
