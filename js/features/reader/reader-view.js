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
    // Register default Highlight renderer
    Registry.registerSlot("cad:renderer", {
      type: "highlight",
      render: (content, data) => {
        // data.data could contain color or other info
        const color = data.data?.color || "#fde047"; // yellow-300 default
        const comment = data.data?.comment
          ? DOMPurify.sanitize(data.data.comment)
          : "";
        const safeComment = comment.replace(/"/g, "&quot;");
        const tooltipAttr = comment ? `data-tooltip="${safeComment}"` : "";
        const style = `background-color: ${color}80; border-bottom: 2px solid ${color}; color: inherit; padding: 0 2px; border-radius: 2px;`;
        return `<mark class="cad-highlight" style="${style}" data-cad-id="${data.id}" ${tooltipAttr}>${content}</mark>`;
      },
      shouldMerge: true,
      mergeStrategy: (overlapping, newCAD) => {
        const newData = { ...newCAD.data };
        let combinedComment = newData.comment || "";

        overlapping.forEach((c) => {
          if (c.data?.comment) {
            if (combinedComment) combinedComment += "\n";
            combinedComment += c.data.comment;
          }
        });

        if (combinedComment) newData.comment = combinedComment;
        return newData;
      },
    });

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

    // Selection Toolbar Logic
    document.addEventListener("selectionchange", () => {
      this._handleSelectionChange();
    });

    document
      .getElementById("btn-tool-highlight")
      ?.addEventListener("click", () => {
        this.createCADFromSelection("highlight", { color: "#fde047" });
      });

    document
      .getElementById("btn-tool-annotate")
      ?.addEventListener("click", async () => {
        // Check if we have a selection or if we are clicking on an existing highlight
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          // Capture range before modal opens (which might clear selection)
          const range = selection.getRangeAt(0).cloneRange();

          // New annotation on selection
          const comment = await Modals.showPrompt("Enter your annotation:");
          if (comment) {
            this.createCADFromSelection(
              "highlight",
              { color: "#fde047", comment: comment },
              range,
            );
          }
        } else {
          // Fallback for no selection (though toolbar shouldn't show)
          const comment = await Modals.showPrompt("Enter your annotation:");
          if (comment) {
            this.createCADFromSelection("highlight", {
              color: "#fde047",
              comment: comment,
            });
          }
        }
      });

    document.getElementById("btn-tool-clear")?.addEventListener("click", () => {
      this.clearCADsInSelection();
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
        const cleanContent = DOMPurify.sanitize(article.fullContent);
        contentEl.innerHTML =
          mediaHtml + this._renderContentWithCADs(cleanContent, article.cads);
        // Schedule restore after layout
        setTimeout(() => {
          this._applyRestoreScroll();
          this._updateProgress(scrollContainer);
        }, 100);
      } else {
        const baseContent =
          article.content || article.description || `<p>${article.snippet}</p>`;

        if (article.mediaType === "youtube") {
          const cleanContent = DOMPurify.sanitize(baseContent);
          contentEl.innerHTML =
            mediaHtml + this._renderContentWithCADs(cleanContent, article.cads);
          setTimeout(() => {
            this._applyRestoreScroll();
            this._updateProgress(scrollContainer);
          }, 100);
        } else {
          ReaderService.setLoadingContent(true); // Block progress updates
          const loadingHtml = `<div class="full-content-loader">Fetching full article content...</div>`;
          // Sanitized base content
          const cleanBase = DOMPurify.sanitize(baseContent);
          contentEl.innerHTML =
            mediaHtml +
            loadingHtml +
            this._renderContentWithCADs(cleanBase, article.cads);

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
              const cleanFull = DOMPurify.sanitize(fullHtml);
              contentEl.innerHTML =
                mediaHtml +
                this._renderContentWithCADs(cleanFull, article.cads);
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

  _handleSelectionChange: function () {
    const selection = window.getSelection();
    const toolbar = document.getElementById("selection-toolbar");
    if (!toolbar) return;

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      toolbar.style.display = "none";
      return;
    }

    const range = selection.getRangeAt(0);
    const contentEl = document.getElementById("reader-content");

    // Ensure selection is within reader content
    if (!contentEl || !contentEl.contains(range.commonAncestorContainer)) {
      toolbar.style.display = "none";
      return;
    }

    // Show toolbar
    const rect = range.getBoundingClientRect();
    toolbar.style.display = "flex";
    // Position above selection, centered
    const toolbarWidth = toolbar.offsetWidth || 200; // approximate if hidden
    const left = rect.left + rect.width / 2 - toolbarWidth / 2;
    const top = rect.top - 50; // 50px above

    toolbar.style.left = `${Math.max(10, Math.min(window.innerWidth - toolbarWidth - 10, left))}px`;
    toolbar.style.top = `${Math.max(10, top + window.scrollY)}px`;
    toolbar.style.position = "fixed";
    toolbar.style.top = `${Math.max(10, rect.top - 40)}px`;
  },

  _cleanCADsFromHTML: function (html) {
    const div = document.createElement("div");
    div.innerHTML = html;

    // Find all elements with data-cad-id
    const cadElements = div.querySelectorAll("[data-cad-id]");
    cadElements.forEach((el) => {
      // Unwrap: replace element with its children
      const parent = el.parentNode;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    });

    return div.innerHTML;
  },

  clearCADsInSelection: async function () {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return;

    const contentEl = document.getElementById("reader-content");
    if (!contentEl) return;

    // Find CADs that overlap with the selection
    const cadIdsToRemove = new Set();

    // Check if selection contains any highlight elements
    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const div = document.createElement("div");
    div.appendChild(fragment);

    const selectedHighlights = div.querySelectorAll("[data-cad-id]");
    selectedHighlights.forEach((el) =>
      cadIdsToRemove.add(el.getAttribute("data-cad-id")),
    );

    // Also check if the selection is INSIDE a highlight (collapsed or not fully selecting the highlight element)
    let parent = range.commonAncestorContainer;
    if (parent.nodeType === Node.TEXT_NODE) parent = parent.parentNode;
    if (parent.hasAttribute("data-cad-id")) {
      cadIdsToRemove.add(parent.getAttribute("data-cad-id"));
    }

    // Also check if the selection starts or ends inside a highlight
    let startParent = range.startContainer;
    if (startParent.nodeType === Node.TEXT_NODE)
      startParent = startParent.parentNode;
    if (startParent.hasAttribute("data-cad-id"))
      cadIdsToRemove.add(startParent.getAttribute("data-cad-id"));

    let endParent = range.endContainer;
    if (endParent.nodeType === Node.TEXT_NODE) endParent = endParent.parentNode;
    if (endParent.hasAttribute("data-cad-id"))
      cadIdsToRemove.add(endParent.getAttribute("data-cad-id"));

    if (cadIdsToRemove.size > 0) {
      const article = await DB.getArticle(State.currentArticleGuid);
      if (article && article.cads) {
        article.cads = article.cads.filter((c) => !cadIdsToRemove.has(c.id));
        await ReaderService.saveArticle(article);

        // Re-render
        const scrollTop = contentEl.parentElement.scrollTop;
        if (article.fullContent) {
          const cleanContent = DOMPurify.sanitize(article.fullContent);
          contentEl.innerHTML = this._renderContentWithCADs(
            cleanContent,
            article.cads,
          );
        } else {
          const base = article.content || article.description || "";
          const cleanBase = DOMPurify.sanitize(base);
          contentEl.innerHTML = this._renderContentWithCADs(
            cleanBase,
            article.cads,
          );
        }
        contentEl.parentElement.scrollTop = scrollTop;
        document.getElementById("selection-toolbar").style.display = "none";
        window.getSelection().removeAllRanges();
      }
    }
  },

  createCADFromSelection: async function (
    type,
    dataOrGenerator,
    providedRange,
  ) {
    let range = providedRange;

    if (!range) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
        return;
      range = selection.getRangeAt(0);
    }

    const contentEl = document.getElementById("reader-content");
    if (!contentEl) return;

    // 1. Create Markers to find approximate position
    const startMarker = document.createElement("span");
    startMarker.id = "cad-start-marker-" + Date.now();
    const endMarker = document.createElement("span");
    endMarker.id = "cad-end-marker-" + Date.now();

    // 2. Insert Markers
    const endRange = range.cloneRange();
    endRange.collapse(false);
    endRange.insertNode(endMarker);

    const startRange = range.cloneRange();
    startRange.collapse(true);
    startRange.insertNode(startMarker);

    // 3. Get HTML with markers
    let tempHTML = contentEl.innerHTML;

    // 4. Cleanup DOM immediately
    startMarker.remove();
    endMarker.remove();
    contentEl.normalize();

    // 5. Find offsets of markers
    const startTag = `<span id="${startMarker.id}"></span>`;
    const endTag = `<span id="${endMarker.id}"></span>`;

    const startIndex = tempHTML.indexOf(startTag);
    const endIndex = tempHTML.indexOf(endTag);

    if (startIndex === -1 || endIndex === -1) {
      console.error("Could not find markers in HTML");
      return;
    }

    // 6. Extract the selected content (with CAD tags potentially)
    const rawSelection = tempHTML.substring(
      startIndex + startTag.length,
      endIndex,
    );

    // 7. Clean CAD tags from selection to get the "target" content
    const cleanSelection = this._cleanCADsFromHTML(rawSelection);

    // 8. Get the original clean article content
    const article = await DB.getArticle(State.currentArticleGuid);
    if (!article) return;

    let cleanArticleHTML = "";
    if (article.fullContent) {
      cleanArticleHTML = DOMPurify.sanitize(article.fullContent);
    } else {
      const base = article.content || article.description || "";
      cleanArticleHTML = DOMPurify.sanitize(base);
    }

    // 9. Search for closest occurrence
    const indices = [];
    let pos = 0;
    while ((pos = cleanArticleHTML.indexOf(cleanSelection, pos)) !== -1) {
      indices.push(pos);
      pos += 1;
    }

    if (indices.length === 0) {
      console.warn(
        "Could not find selected content in original article. Selection:",
        cleanSelection,
      );
      Utils.showToast("Selection mismatch - cannot create annotation");
      return;
    }

    // Find closest index to startIndex
    const bestIndex = indices.reduce((prev, curr) => {
      return Math.abs(curr - startIndex) < Math.abs(prev - startIndex)
        ? curr
        : prev;
    });

    // 10. Generate Data
    let data = {};
    if (typeof dataOrGenerator === "function") {
      try {
        data = await dataOrGenerator(cleanSelection);
      } catch (e) {
        console.error("Error generating CAD data", e);
        Utils.showToast("Failed to generate annotation data");
        return;
      }
    } else {
      data = dataOrGenerator || {};
    }

    if (!data) return; // Generator might return null to cancel

    // 11. Create CAD
    const cad = {
      type: type,
      position: bestIndex,
      length: cleanSelection.length,
      originalContent: cleanSelection,
      data: data,
      created: Date.now(),
    };

    // 12. Save
    if (State.currentArticleGuid) {
      await ReaderService.addCAD(State.currentArticleGuid, cad);

      // 13. Re-render
      const scrollTop = contentEl.parentElement.scrollTop;
      const updatedArticle = await DB.getArticle(State.currentArticleGuid);

      if (updatedArticle.fullContent) {
        const cleanContent = DOMPurify.sanitize(updatedArticle.fullContent);
        contentEl.innerHTML = this._renderContentWithCADs(
          cleanContent,
          updatedArticle.cads,
        );
      } else {
        const base = updatedArticle.content || updatedArticle.description || "";
        const cleanBase = DOMPurify.sanitize(base);
        contentEl.innerHTML = this._renderContentWithCADs(
          cleanBase,
          updatedArticle.cads,
        );
      }

      contentEl.parentElement.scrollTop = scrollTop;
      document.getElementById("selection-toolbar").style.display = "none";
      window.getSelection().removeAllRanges();
    }
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

  _renderContentWithCADs: function (htmlContent, cads) {
    if (!cads || cads.length === 0) return htmlContent;

    // Sort CADs by position
    const sortedCADs = [...cads].sort((a, b) => a.position - b.position);

    let result = "";
    let lastIndex = 0;
    const orphaned = [];

    // Get renderers map
    const renderers = Registry.getExtensions("cad:renderer");
    const rendererMap = new Map();
    renderers.forEach((r) => {
      if (r.type && typeof r.render === "function") {
        rendererMap.set(r.type, r.render);
      }
    });

    for (const cad of sortedCADs) {
      // Check bounds and overlap
      if (cad.position < lastIndex) {
        orphaned.push({ ...cad, reason: "Overlap or Out of Order" });
        continue;
      }
      if (cad.position + cad.length > htmlContent.length) {
        orphaned.push({ ...cad, reason: "Out of Bounds" });
        continue;
      }

      // Validate content
      const targetContent = htmlContent.substring(
        cad.position,
        cad.position + cad.length,
      );
      if (targetContent !== cad.originalContent) {
        orphaned.push({ ...cad, reason: "Content Mismatch" });
        continue;
      }

      // Render
      const renderer = rendererMap.get(cad.type);
      if (renderer) {
        // Append text before this CAD
        result += htmlContent.substring(lastIndex, cad.position);
        // Append rendered CAD
        result += renderer(targetContent, cad);
        lastIndex = cad.position + cad.length;
      } else {
        orphaned.push({ ...cad, reason: `No renderer for type: ${cad.type}` });
      }
    }

    // Append remaining text
    result += htmlContent.substring(lastIndex);

    // Append Orphans
    if (orphaned.length > 0) {
      result += this._renderOrphanedCADs(orphaned);
    }

    return result;
  },

  _renderOrphanedCADs: function (orphans) {
    let html = `<div class="orphaned-cads-section" style="margin-top: 40px; padding: 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;">
            <h4 style="margin-top: 0; color: var(--text-muted);">Orphaned Annotations</h4>
            <p style="font-size: 0.9rem; color: var(--text-muted);">The following annotations could not be reattached to the text:</p>
            <ul style="list-style: none; padding: 0;">`;

    orphans.forEach((cad) => {
      html += `<li style="margin-bottom: 8px; font-size: 0.9rem; padding: 8px; background: var(--bg-main); border-radius: 4px;">
                <strong style="text-transform: uppercase; font-size: 0.75rem; color: var(--primary);">${cad.type}</strong>:
                <span style="font-style: italic;">"${DOMPurify.sanitize(cad.originalContent)}"</span>
                <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 8px;">(${cad.reason || "Unknown"})</span>
            </li>`;
    });

    html += `</ul></div>`;
    return html;
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
