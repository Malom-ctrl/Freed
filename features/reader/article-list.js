import { Utils } from "../../core/utils.js";
import { Registry } from "../plugin-system/registry.js";
import DOMPurify from "dompurify";

export const ArticleList = {
  init: function () {},

  _activeLoader: null,

  _initLazyLoader: function ({
    container,
    items,
    renderItem,
    batchSize = 20,
    root = null,
    initialRenderCount = 0,
  }) {
    // Create Sentinel
    const sentinel = document.createElement("div");
    sentinel.className = "lazy-loader-sentinel";
    // Grid column span ensures it takes full width in grid layouts
    sentinel.style.gridColumn = "1 / -1";
    sentinel.style.width = "100%";
    sentinel.style.height = "20px";
    sentinel.style.padding = "20px 0";
    sentinel.style.display = "flex";
    sentinel.style.alignItems = "center";
    sentinel.style.justifyContent = "center";
    sentinel.innerHTML = `<div style="text-align:center; color:var(--text-muted); opacity:0.5;">Loading more...</div>`;

    container.appendChild(sentinel);

    let renderedCount = 0;
    let observer = null;

    // Returns true if there are more items available
    const renderBatch = (count = batchSize) => {
      const batch = items.slice(renderedCount, renderedCount + count);
      if (batch.length === 0) {
        sentinel.style.display = "none";
        return false;
      }

      const fragment = document.createDocumentFragment();
      batch.forEach((item) => {
        const el = renderItem(item);
        if (el) fragment.appendChild(el);
      });

      container.insertBefore(fragment, sentinel);
      renderedCount += batch.length;

      if (renderedCount >= items.length) {
        sentinel.style.display = "none";
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        return false;
      }
      return true;
    };

    // Recursively check if we need to load more (e.g. wide screens, fast scroll)
    const fillScreen = () => {
      if (renderedCount >= items.length) return;

      requestAnimationFrame(() => {
        if (!sentinel.isConnected) return;
        const sentinelRect = sentinel.getBoundingClientRect();
        let rootBottom = window.innerHeight;
        if (root) rootBottom = root.getBoundingClientRect().bottom;

        if (sentinelRect.top > rootBottom + 1000) return;

        const hasMore = renderBatch();
        if (hasMore) {
          fillScreen(); // Keep filling if we haven't pushed sentinel out yet
        }
      });
    };

    // Initial render
    const startCount = initialRenderCount > 0 ? initialRenderCount : batchSize;
    renderBatch(startCount);

    // Setup Observer
    if (renderedCount >= items.length) {
      sentinel.style.display = "none";
      return {
        observer: null,
        getRenderedCount: () => renderedCount,
        disconnect: () => {},
      };
    }

    observer = new IntersectionObserver(
      (entries) => {
        // If sentinel enters the viewport (or close to it)
        if (!entries.some((e) => e.isIntersecting)) return;

        const hasMore = renderBatch();
        if (hasMore) {
          // Ensure we filled enough space
          fillScreen();
        }
      },
      {
        root: root,
        threshold: 0,
        rootMargin: "0px 0px 1000px 0px", // Load 1000px ahead of scroll
      },
    );
    observer.observe(sentinel);

    // Trigger initial manual fill to handle empty/wide screens
    fillScreen();

    return {
      observer,
      getRenderedCount: () => renderedCount,
      disconnect: () => {
        if (observer) observer.disconnect();
      },
    };
  },

  render: function (
    articles,
    onOpen,
    showImages = true,
    onDiscard,
    onToggleFavorite,
  ) {
    const { formatRelativeTime, hexToRgba, formatFullDate } = Utils;
    const list = document.getElementById("article-list");
    if (!list) return;

    // State Preservation Logic
    let savedScrollTop = 0;
    let savedRenderedCount = 0;

    // If we are scrolling, assume we want to preserve state
    if (list.scrollTop > 0 && this._activeLoader) {
      savedScrollTop = list.scrollTop;
      savedRenderedCount = this._activeLoader.getRenderedCount();
    }

    // Cleanup previous loader
    if (this._activeLoader) {
      this._activeLoader.disconnect();
      this._activeLoader = null;
    }
    // Also cleanup legacy observer if it exists (for safety)
    if (this._articleObserver) {
      this._articleObserver.disconnect();
      this._articleObserver = null;
    }

    list.innerHTML = "";

    if (articles.length === 0) {
      const hasFilters =
        document.getElementById("filter-status")?.value !== "all" ||
        document.getElementById("filter-date")?.value !== "all" ||
        document.getElementById("filter-tag-input")?.value ||
        false;

      let message = "Syncing or add a new feed.";
      let title = "No articles found";

      if (hasFilters) {
        title = "No matches";
        message = "Try adjusting your filters.";
      }

      list.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding-top: 50px;">
            <h3>${title}</h3>
            <p>${message}</p>
            </div>`;
      return;
    }

    const pluginActions = Registry.getExtensions("card:action");
    const pluginIndicators = Registry.getExtensions("card:indicator");

    this._activeLoader = this._initLazyLoader({
      container: list,
      items: articles,
      batchSize: 20,
      root: list,
      initialRenderCount: savedRenderedCount,
      renderItem: (article) => {
        const dateStr = formatRelativeTime(article.pubDate);
        const fullDateStr = formatFullDate(article.pubDate);

        const isRead = article.readingProgress && article.readingProgress >= 1;
        const card = document.createElement("article");
        card.className = `card ${isRead ? "read" : ""} ${article.favorite ? "favorite" : ""}`;

        // Handle Image Background logic
        if (showImages && article.image) {
          card.classList.add("has-image");
          // Sanitize URL
          const cleanUrl = DOMPurify.sanitize(article.image).replace(
            /'/g,
            "%27",
          );
          card.style.setProperty("--card-bg", `url('${cleanUrl}')`);
        }

        const feedTitleStyle = article.feedColor
          ? `style="color: ${article.feedColor}"`
          : "";

        let tagsHtml = "";
        if (article.feedTags && article.feedTags.length > 0) {
          tagsHtml = `<div class="card-tags">`;
          article.feedTags.forEach((tag) => {
            let bg = hexToRgba(tag.color, 0.15);
            tagsHtml += `<span class="tag-pill" style="color: ${tag.color}; background-color: ${bg}; border: 1px solid ${tag.color}40;">${DOMPurify.sanitize(tag.name)}</span>`;
          });
          tagsHtml += `</div>`;
        }

        // --- Dynamic Status Icon Logic ---
        let statusIconContent = "";
        let statusTitle = "";

        if (article.favorite) {
          statusIconContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color:#f59e0b;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
          statusTitle = "Favorited";
        } else if (article.mediaType === "audio") {
          statusIconContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary);"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
          statusTitle = "Podcast";
        } else if (
          article.mediaType === "youtube" ||
          article.mediaType === "video"
        ) {
          statusIconContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#ef4444;"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
          statusTitle = "Video";
        } else if (article.contentFetchFailed && !article.fullContent) {
          statusIconContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#f59e0b;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
          statusTitle = "Content Unavailable";
        } else if (isRead) {
          statusIconContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
          statusTitle = "Read";
        } else if (article.readingProgress > 0) {
          const r = 9;
          const c = 2 * Math.PI * r;
          const pct = article.readingProgress;
          const offset = c * (1 - pct);
          statusIconContent = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="color:var(--primary); transform:rotate(-90deg);">
                        <circle cx="12" cy="12" r="${r}" stroke-opacity="0.2"></circle>
                        <circle cx="12" cy="12" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>
                        </svg>`;
          statusTitle = "In Progress";
        } else if (article.fullContent) {
          statusIconContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px; color: var(--text-muted); opacity: 0.7;"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line></svg>`;
          statusTitle = "Offline Available";
        }

        const statusHtml = statusIconContent
          ? `<div class="dynamic-status-icon" style="margin-left:8px; display:flex; align-items:center; cursor:pointer;" data-tooltip="${statusTitle}">${statusIconContent}</div>`
          : "";

        // Plugin Indicators
        let pluginIndicatorsHtml = "";
        if (pluginIndicators.length > 0) {
          pluginIndicators.forEach((ind) => {
            // Render logic: either icon string, html, or a render function returning string/html
            let content = "";
            if (typeof ind.render === "function") {
              const res = ind.render(article);
              content =
                res instanceof HTMLElement ? res.outerHTML : res || ind.icon;
            } else {
              content = ind.icon || "";
            }

            if (content) {
              const tooltip = ind.tooltip
                ? `data-tooltip="${DOMPurify.sanitize(ind.tooltip)}" style="cursor:help;"`
                : "";
              pluginIndicatorsHtml += `<div class="plugin-indicator" style="margin-left:6px; display:flex; align-items:center;" ${tooltip}>${DOMPurify.sanitize(content)}</div>`;
            }
          });
        }

        // Discard structures
        const isDiscarded = !!article.discarded;
        const actionLabel = isDiscarded ? "Restore" : "Discard";
        const iconSvg = isDiscarded
          ? `<svg class="discard-icon-cross" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>`
          : `<svg class="discard-icon-cross" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

        const discardZone = `<div class="discard-zone" title="${actionLabel}"></div>`;
        const discardOverlay = `<div class="discard-overlay">${iconSvg}${actionLabel}</div>`;

        let pluginActionsHtml = "";
        if (pluginActions.length > 0) {
          pluginActionsHtml = `<div class="card-plugin-actions" style="display:flex; gap:8px; margin-left:auto;">`;
          pluginActions.forEach((action, idx) => {
            pluginActionsHtml += `<div class="plugin-action-btn" data-plugin-idx="${idx}" title="${DOMPurify.sanitize(action.label)}" style="cursor:pointer; opacity:0.6;">${DOMPurify.sanitize(action.icon)}</div>`;
          });
          pluginActionsHtml += `</div>`;
        }

        card.innerHTML = DOMPurify.sanitize(`
                    ${discardZone}
                    ${discardOverlay}
                    <div class="card-body">
                        <div class="card-meta">
                            <span class="feed-title-span" ${feedTitleStyle}></span>
                            <div style="display:flex; align-items:center;">
                                <span class="date-span" data-tooltip="${fullDateStr}" style="cursor:help;"></span>
                                ${statusHtml}
                                ${pluginIndicatorsHtml}
                            </div>
                        </div>
                        <h3 class="card-title"></h3>
                        ${tagsHtml}
                        ${pluginActionsHtml}
                    </div>
                    `);

        // Set text content safely
        const feedTitleSpan = card.querySelector(".feed-title-span");
        if (feedTitleSpan) feedTitleSpan.textContent = article.feedTitle;

        const dateSpan = card.querySelector(".date-span");
        if (dateSpan) dateSpan.textContent = dateStr;

        const titleH3 = card.querySelector(".card-title");
        if (titleH3) titleH3.textContent = article.title;

        card.onclick = (e) => {
          if (
            e.target.closest(".discard-zone") ||
            e.target.closest(".discard-overlay")
          )
            return;
          if (e.target.closest(".dynamic-status-icon")) return;
          if (e.target.closest(".plugin-action-btn")) return;
          onOpen(article);
        };

        const statusBtn = card.querySelector(".dynamic-status-icon");
        if (statusBtn) {
          statusBtn.onclick = (e) => {
            e.stopPropagation();
            if (onToggleFavorite) onToggleFavorite(article);
          };
        }

        const pluginBtn = card.querySelector(".plugin-action-btn");
        if (pluginBtn) {
          pluginBtn.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(pluginBtn.dataset.pluginIdx);
            if (pluginActions[idx] && pluginActions[idx].onClick) {
              pluginActions[idx].onClick(article);
            }
          };
        }

        const zone = card.querySelector(".discard-zone");
        const overlay = card.querySelector(".discard-overlay");
        const discardHandler = (e) => {
          e.stopPropagation();
          e.preventDefault();
          onDiscard(article);
        };
        if (zone) zone.onclick = discardHandler;
        if (overlay) overlay.onclick = discardHandler;

        ArticleList.attachSwipeHandlers(card, () => onDiscard(article));
        return card;
      },
    });

    // Restore scroll position if applicable
    if (savedScrollTop > 0) {
      requestAnimationFrame(() => {
        list.scrollTop = savedScrollTop;
      });
    }
  },

  attachSwipeHandlers: function (card, onDiscard) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;
    const threshold = 100; // px to trigger discard

    card.addEventListener(
      "touchstart",
      (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        card.style.transition = "none"; // Remove transition for 1:1 movement
      },
      { passive: true },
    );

    card.addEventListener(
      "touchmove",
      (e) => {
        currentX = e.touches[0].clientX;
        const diffX = currentX - startX;
        const diffY = e.touches[0].clientY - startY;

        // Detect horizontal swipe intention vs vertical scroll
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
          isSwiping = true;
          card.style.transform = `translateX(${diffX}px)`;
          const opacity = Math.max(
            0.3,
            1 - Math.abs(diffX) / (window.innerWidth * 0.8),
          );
          card.style.opacity = opacity;
        }
      },
      { passive: true },
    );

    card.addEventListener("touchend", (e) => {
      if (!isSwiping) return;

      const diffX = currentX - startX;
      card.style.transition = "transform 0.3s ease, opacity 0.3s ease";

      if (Math.abs(diffX) > threshold) {
        // Swipe triggered
        const direction = diffX > 0 ? 1 : -1;
        card.style.transform = `translateX(${direction * window.innerWidth}px)`;
        card.style.opacity = "0";

        // Wait for animation then remove/callback
        setTimeout(() => {
          onDiscard();
        }, 300);
      } else {
        // Reset
        card.style.transform = "";
        card.style.opacity = "";
      }

      isSwiping = false;
    });
  },
};
