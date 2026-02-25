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
    const loaderText = document.createElement("div");
    loaderText.className = "lazy-loader-text";
    loaderText.textContent = "Loading more...";
    sentinel.appendChild(loaderText);

    container.appendChild(sentinel);

    let renderedCount = 0;
    let observer = null;

    // Returns true if there are more items available
    const renderBatch = (count = batchSize) => {
      const batch = items.slice(renderedCount, renderedCount + count);
      if (batch.length === 0) {
        sentinel.classList.add("hidden");
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
        sentinel.classList.add("hidden");
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
      sentinel.classList.add("hidden");
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

  _createStatusIcon: function (type, extraClass = "") {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    if (type === "favorite") {
      svg.setAttribute("fill", "currentColor");
      svg.setAttribute("stroke", "none");
    } else {
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
    }
    svg.setAttribute("class", `status-icon-${type} ${extraClass}`);

    if (type === "favorite") {
      const poly = document.createElementNS(svgNS, "polygon");
      poly.setAttribute(
        "points",
        "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2",
      );
      svg.appendChild(poly);
    } else if (type === "podcast") {
      const path1 = document.createElementNS(svgNS, "path");
      path1.setAttribute(
        "d",
        "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z",
      );
      const path2 = document.createElementNS(svgNS, "path");
      path2.setAttribute("d", "M19 10v2a7 7 0 0 1-14 0v-2");
      const line1 = document.createElementNS(svgNS, "line");
      line1.setAttribute("x1", "12");
      line1.setAttribute("y1", "19");
      line1.setAttribute("x2", "12");
      line1.setAttribute("y2", "23");
      const line2 = document.createElementNS(svgNS, "line");
      line2.setAttribute("x1", "8");
      line2.setAttribute("y1", "23");
      line2.setAttribute("x2", "16");
      line2.setAttribute("y2", "23");
      svg.appendChild(path1);
      svg.appendChild(path2);
      svg.appendChild(line1);
      svg.appendChild(line2);
    } else if (type === "video") {
      const poly = document.createElementNS(svgNS, "polygon");
      poly.setAttribute("points", "23 7 16 12 23 17 23 7");
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", "1");
      rect.setAttribute("y", "5");
      rect.setAttribute("width", "15");
      rect.setAttribute("height", "14");
      rect.setAttribute("rx", "2");
      rect.setAttribute("ry", "2");
      svg.appendChild(poly);
      svg.appendChild(rect);
    } else if (type === "unavailable") {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute(
        "d",
        "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
      );
      const line1 = document.createElementNS(svgNS, "line");
      line1.setAttribute("x1", "12");
      line1.setAttribute("y1", "9");
      line1.setAttribute("x2", "12");
      line1.setAttribute("y2", "13");
      const line2 = document.createElementNS(svgNS, "line");
      line2.setAttribute("x1", "12");
      line2.setAttribute("y1", "17");
      line2.setAttribute("x2", "12.01");
      line2.setAttribute("y2", "17");
      svg.appendChild(path);
      svg.appendChild(line1);
      svg.appendChild(line2);
    } else if (type === "read") {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", "M22 11.08V12a10 10 0 1 1-5.93-9.14");
      const poly = document.createElementNS(svgNS, "polyline");
      poly.setAttribute("points", "22 4 12 14.01 9 11.01");
      svg.appendChild(path);
      svg.appendChild(poly);
    } else if (type === "offline") {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute(
        "d",
        "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
      );
      const poly = document.createElementNS(svgNS, "polyline");
      poly.setAttribute("points", "8 17 12 21 16 17");
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", "12");
      line.setAttribute("y1", "12");
      line.setAttribute("x2", "12");
      line.setAttribute("y2", "21");
      svg.appendChild(path);
      svg.appendChild(poly);
      svg.appendChild(line);
    }
    return svg;
  },

  _createProgressIcon: function (progress) {
    const r = 9;
    const c = 2 * Math.PI * r;
    const pct = progress;
    const offset = c * (1 - pct);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "3");
    svg.setAttribute("class", "status-icon-progress");

    const c1 = document.createElementNS(svgNS, "circle");
    c1.setAttribute("cx", "12");
    c1.setAttribute("cy", "12");
    c1.setAttribute("r", r);
    c1.setAttribute("stroke-opacity", "0.2");

    const c2 = document.createElementNS(svgNS, "circle");
    c2.setAttribute("cx", "12");
    c2.setAttribute("cy", "12");
    c2.setAttribute("r", r);
    c2.setAttribute("stroke-dasharray", c);
    c2.setAttribute("stroke-dashoffset", offset);

    svg.appendChild(c1);
    svg.appendChild(c2);
    return svg;
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

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

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

      const emptyState = document.createElement("div");
      emptyState.className = "empty-state-container";

      const h3 = document.createElement("h3");
      h3.textContent = title;

      const p = document.createElement("p");
      p.textContent = message;

      emptyState.appendChild(h3);
      emptyState.appendChild(p);

      list.appendChild(emptyState);
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

        const cardBody = document.createElement("div");
        cardBody.className = "card-body";

        // --- Dynamic Status Icon Logic ---
        let statusIconEl = null;
        let statusTitle = "";

        if (article.favorite) {
          statusIconEl = this._createStatusIcon(
            "favorite",
            "status-icon-favorite",
          );
          statusTitle = "Favorited";
        } else if (article.mediaType === "audio") {
          statusIconEl = this._createStatusIcon(
            "podcast",
            "status-icon-podcast",
          );
          statusTitle = "Podcast";
        } else if (
          article.mediaType === "youtube" ||
          article.mediaType === "video"
        ) {
          statusIconEl = this._createStatusIcon("video", "status-icon-video");
          statusTitle = "Video";
        } else if (article.contentFetchFailed && !article.fullContent) {
          statusIconEl = this._createStatusIcon(
            "unavailable",
            "status-icon-unavailable",
          );
          statusTitle = "Content Unavailable";
        } else if (isRead) {
          statusIconEl = this._createStatusIcon("read", "status-icon-read");
          statusTitle = "Read";
        } else if (article.readingProgress > 0) {
          statusIconEl = this._createProgressIcon(article.readingProgress);
          statusTitle = "In Progress";
        } else if (article.fullContent) {
          statusIconEl = this._createStatusIcon(
            "offline",
            "status-icon-offline",
          );
          statusTitle = "Offline Available";
        }

        // Plugin Indicators
        // (Logic moved to cardMetaRight construction)

        // Discard structures
        const isDiscarded = !!article.discarded;
        const actionLabel = isDiscarded ? "Restore" : "Discard";

        const discardZone = document.createElement("div");
        discardZone.className = "discard-zone";
        discardZone.title = actionLabel;

        const discardOverlay = document.createElement("div");
        discardOverlay.className = "discard-overlay";

        const svgNS = "http://www.w3.org/2000/svg";
        const iconSvgEl = document.createElementNS(svgNS, "svg");
        iconSvgEl.setAttribute("class", "discard-icon-cross");
        iconSvgEl.setAttribute("viewBox", "0 0 24 24");
        iconSvgEl.setAttribute("fill", "none");
        iconSvgEl.setAttribute("stroke", "white");
        iconSvgEl.setAttribute("stroke-width", "2");
        iconSvgEl.setAttribute("stroke-linecap", "round");
        iconSvgEl.setAttribute("stroke-linejoin", "round");

        if (isDiscarded) {
          const path1 = document.createElementNS(svgNS, "path");
          path1.setAttribute("d", "M3 7v6h6");
          const path2 = document.createElementNS(svgNS, "path");
          path2.setAttribute("d", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13");
          iconSvgEl.appendChild(path1);
          iconSvgEl.appendChild(path2);
        } else {
          const line1 = document.createElementNS(svgNS, "line");
          line1.setAttribute("x1", "18");
          line1.setAttribute("y1", "6");
          line1.setAttribute("x2", "6");
          line1.setAttribute("y2", "18");
          const line2 = document.createElementNS(svgNS, "line");
          line2.setAttribute("x1", "6");
          line2.setAttribute("y1", "6");
          line2.setAttribute("x2", "18");
          line2.setAttribute("y2", "18");
          iconSvgEl.appendChild(line1);
          iconSvgEl.appendChild(line2);
        }

        discardOverlay.appendChild(iconSvgEl);
        discardOverlay.appendChild(document.createTextNode(actionLabel));

        const cardMeta = document.createElement("div");
        cardMeta.className = "card-meta";

        const feedTitleSpan = document.createElement("span");
        feedTitleSpan.className = "feed-title-span";
        if (article.feedColor) {
          feedTitleSpan.style.color = article.feedColor;
        }
        feedTitleSpan.textContent = article.feedTitle;

        const cardMetaRight = document.createElement("div");
        cardMetaRight.className = "card-meta-right";

        const dateSpan = document.createElement("span");
        dateSpan.className = "date-span";
        dateSpan.setAttribute("data-tooltip", fullDateStr);
        dateSpan.textContent = dateStr;

        cardMetaRight.appendChild(dateSpan);

        if (statusIconEl) {
          const statusDiv = document.createElement("div");
          statusDiv.className = "dynamic-status-icon";
          statusDiv.setAttribute("data-tooltip", statusTitle);
          statusDiv.appendChild(statusIconEl);
          cardMetaRight.appendChild(statusDiv);
        }

        if (pluginIndicators.length > 0) {
          pluginIndicators.forEach((ind) => {
            let content = "";
            if (typeof ind.render === "function") {
              const res = ind.render(article);
              content =
                res instanceof HTMLElement ? res.outerHTML : res || ind.icon;
            } else {
              content = ind.icon || "";
            }

            if (content) {
              const div = document.createElement("div");
              div.className = "plugin-indicator";
              if (ind.tooltip) div.setAttribute("data-tooltip", ind.tooltip);

              const parser = new DOMParser();
              const doc = parser.parseFromString(
                DOMPurify.sanitize(content),
                "text/html",
              );
              while (doc.body.firstChild) div.appendChild(doc.body.firstChild);

              cardMetaRight.appendChild(div);
            }
          });
        }

        cardMeta.appendChild(feedTitleSpan);
        cardMeta.appendChild(cardMetaRight);

        const cardTitle = document.createElement("h3");
        cardTitle.className = "card-title";
        cardTitle.textContent = article.title;

        cardBody.appendChild(cardMeta);
        cardBody.appendChild(cardTitle);

        if (article.feedTags && article.feedTags.length > 0) {
          const tagsDiv = document.createElement("div");
          tagsDiv.className = "card-tags";
          article.feedTags.forEach((tag) => {
            const span = document.createElement("span");
            span.className = "tag-pill";
            span.style.color = tag.color;
            span.style.backgroundColor = hexToRgba(tag.color, 0.15);
            span.style.borderColor = `${tag.color}40`;
            span.textContent = tag.name;
            tagsDiv.appendChild(span);
          });
          cardBody.appendChild(tagsDiv);
        }

        // Plugin Actions
        if (pluginActions.length > 0) {
          const actionsDiv = document.createElement("div");
          actionsDiv.className = "card-plugin-actions";

          pluginActions.forEach((action, idx) => {
            const btn = document.createElement("div");
            btn.className = "plugin-action-btn";
            btn.dataset.pluginIdx = idx;
            btn.title = action.label || "";

            const parser = new DOMParser();
            const doc = parser.parseFromString(
              DOMPurify.sanitize(action.icon),
              "text/html",
            );
            while (doc.body.firstChild) btn.appendChild(doc.body.firstChild);

            actionsDiv.appendChild(btn);
          });
          cardBody.appendChild(actionsDiv);
        }

        card.appendChild(discardZone);
        card.appendChild(discardOverlay);
        card.appendChild(cardBody);

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
