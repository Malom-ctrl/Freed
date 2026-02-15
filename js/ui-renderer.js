window.Freed = window.Freed || {};

window.Freed.UI = {
  renderFeedList: function (feeds, currentFeedId, onSwitch, onEdit, onStats) {
    const container = document.getElementById("feed-list-container");
    if (!container) return;
    container.innerHTML = "";

    feeds.forEach((feed) => {
      const div = document.createElement("div");
      const isActive = currentFeedId === feed.id;
      div.className = `nav-item ${isActive ? "active" : ""}`;

      // Apply dynamic active color if present
      if (isActive && feed.color) {
        div.style.color = feed.color;

        // Hex to RGBA for background opacity (10%)
        const hex = feed.color.replace("#", "");
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          div.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.1)`;
        }
      }

      const strokeColor = feed.color ? feed.color : "currentColor";

      // Choose icon based on feed type
      let iconSvg;
      if (feed.type === "web") {
        // Globe icon
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
      } else {
        // RSS icon
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle></svg>`;
      }

      // Stats Icon (Bar Chart)
      const statsIcon = `<div class="feed-btn-icon feed-stats-btn" title="Stats"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg></div>`;

      // Gear icon for settings
      const settingsIcon = `<div class="feed-btn-icon feed-settings-btn" title="Edit Feed"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></div>`;

      div.innerHTML = `
                <div class="nav-item-content" style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
                    ${iconSvg}
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${feed.title}</span>
                </div>
                <div style="display: flex; gap: 2px;">
                    ${statsIcon}
                    ${settingsIcon}
                </div>
            `;

      // Handle main click on the entire row
      div.onclick = (e) => {
        onSwitch(feed.id);
      };

      // Handle stats click
      div.querySelector(".feed-stats-btn").onclick = (e) => {
        e.stopPropagation();
        onStats(feed);
      };

      // Handle edit click
      div.querySelector(".feed-settings-btn").onclick = (e) => {
        e.stopPropagation();
        onEdit(feed);
      };

      container.appendChild(div);
    });

    const allBtn = document.querySelector('[data-id="all"]');
    if (allBtn) {
      if (currentFeedId === "all") allBtn.classList.add("active");
      else allBtn.classList.remove("active");
    }
  },

  renderStatsModal: function (feed) {
    const modal = document.getElementById("stats-modal");
    const content = document.getElementById("stats-modal-content");
    if (!modal || !content) return;

    const stats = feed.stats || {
      totalFetched: 0,
      read: 0,
      discarded: 0,
      favorited: 0,
      wordCountRead: 0,
      wordCountTranslated: 0,
    };

    const total = Math.max(stats.totalFetched, 1); // Avoid division by zero
    const readPct = Math.round((stats.read / total) * 100);
    const discardPct = Math.round((stats.discarded / total) * 100);
    const favPct = Math.round((stats.favorited / total) * 100);

    let transPct = 0;
    if (stats.wordCountRead > 0) {
      transPct = (
        (stats.wordCountTranslated / stats.wordCountRead) *
        100
      ).toFixed(1);
    }

    const makeBar = (label, value, totalVal, color) => {
      const pct = Math.min(100, Math.round((value / totalVal) * 100)) || 0;
      return `
            <div style="margin-bottom: 16px;">
                <div style="display:flex; justify-content:space-between; font-size: 0.9rem; margin-bottom: 6px;">
                    <span>${label}</span>
                    <span style="font-weight:600;">${value} <span style="font-weight:400;color:var(--text-muted);font-size:0.8em">(${pct}%)</span></span>
                </div>
                <div style="width:100%; height:8px; background:var(--border); border-radius:4px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:${color};"></div>
                </div>
            </div>`;
    };

    content.innerHTML = `
            <div style="text-align:center; padding-bottom:16px; border-bottom:1px solid var(--border); margin-bottom:20px;">
                <div style="font-size:3rem; font-weight:700; color:var(--text-main);">${stats.totalFetched}</div>
                <div style="color:var(--text-muted); font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em;">Total Articles Fetched</div>
            </div>

            ${makeBar("Read", stats.read, total, "#10b981")}
            ${makeBar("Discarded", stats.discarded, total, "#ef4444")}
            ${makeBar("Favorited", stats.favorited, total, "#f59e0b")}

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);">
                <div style="font-size: 0.9rem; margin-bottom: 6px; font-weight: 600;">Translation</div>
                <div style="display: flex; align-items: baseline; gap: 8px;">
                    <span style="font-size: 2rem; color: var(--primary);">${transPct}%</span>
                    <span style="color: var(--text-muted); font-size: 0.85rem;">of read words translated</span>
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
                   ${stats.wordCountTranslated.toLocaleString()} words translated / ${stats.wordCountRead.toLocaleString()} read
                </div>
            </div>
        `;

    document.getElementById("stats-modal-title").textContent =
      `${feed.title} Stats`;
    modal.classList.add("open");
  },

  renderArticles: function (
    articles,
    onOpen,
    showImages = true,
    onDiscard,
    onToggleFavorite,
  ) {
    const list = document.getElementById("article-list");
    if (!list) return;
    list.innerHTML = "";

    if (articles.length === 0) {
      // Check if we are filtering or just have no feeds
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

    articles.forEach((article) => {
      const dateStr = window.Freed.Utils.formatRelativeTime(article.pubDate);
      const dateObj = new Date(article.pubDate);
      const fullDateStr = dateObj.toLocaleString();

      const card = document.createElement("article");
      card.className = `card ${article.read ? "read" : ""} ${article.favorite ? "favorite" : ""}`;

      // Handle Image Background logic
      if (showImages && article.image) {
        card.classList.add("has-image");
        // Escape quotes for CSS url() safety
        const cleanUrl = article.image.replace(/'/g, "%27");
        card.style.setProperty("--card-bg", `url('${cleanUrl}')`);
      }

      // Apply feed color to the source name
      const feedTitleStyle = article.feedColor
        ? `style="color: ${article.feedColor}"`
        : "";

      // Generate Tags HTML
      let tagsHtml = "";
      if (article.feedTags && article.feedTags.length > 0) {
        tagsHtml = `<div class="card-tags">`;
        article.feedTags.forEach((tag) => {
          // Create simple hex-to-rgba for tag background
          let bg = tag.color; // fallback
          if (tag.color.startsWith("#") && tag.color.length === 7) {
            const r = parseInt(tag.color.substring(1, 3), 16);
            const g = parseInt(tag.color.substring(3, 5), 16);
            const b = parseInt(tag.color.substring(5, 7), 16);
            bg = `rgba(${r}, ${g}, ${b}, 0.15)`;
          }
          tagsHtml += `<span class="tag-pill" style="color: ${tag.color}; background-color: ${bg}; border: 1px solid ${tag.color}40;">${tag.name}</span>`;
        });
        tagsHtml += `</div>`;
      }

      // --- Dynamic Status Icon Logic ---
      let statusIconContent = "";
      let statusTitle = "";

      if (article.favorite) {
        // 1. Favorite - Star
        statusIconContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color:#f59e0b;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        statusTitle = "Favorited";
      } else if (article.contentFetchFailed && !article.fullContent) {
        // 2. Fetch Failed - Alert Triangle
        statusIconContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#f59e0b;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        statusTitle = "Content Unavailable";
      } else if (article.read) {
        // 3. Read - Checkmark in Circle
        statusIconContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        statusTitle = "Read";
      } else if (article.readingProgress > 0) {
        // 4. In Progress - Ring
        // SVG Dasharray circumference approx 56.5 (r=9)
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
        // 5. Fetched/Offline - Download Icon
        statusIconContent = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px; color: var(--text-muted); opacity: 0.7;"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line></svg>`;
        statusTitle = "Offline Available";
      } else {
        // 6. Unread & Unfetched - No Icon
        statusIconContent = "";
      }

      const statusHtml = statusIconContent
        ? `<div class="dynamic-status-icon" style="margin-left:8px; display:flex; align-items:center; cursor:pointer;" data-tooltip="${statusTitle}">${statusIconContent}</div>`
        : "";
      // ---------------------------------

      // Discard structures
      const isDiscarded = !!article.discarded;
      const actionLabel = isDiscarded ? "Restore" : "Discard";
      const iconSvg = isDiscarded
        ? `<svg class="discard-icon-cross" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>`
        : `<svg class="discard-icon-cross" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

      const discardZone = `<div class="discard-zone" title="${actionLabel}"></div>`;
      const discardOverlay = `
            <div class="discard-overlay">
                ${iconSvg}
                ${actionLabel}
            </div>`;

      card.innerHTML = `
            ${discardZone}
            ${discardOverlay}
            <div class="card-body">
                <div class="card-meta">
                    <span ${feedTitleStyle}>${article.feedTitle}</span>
                    <div style="display:flex; align-items:center;">
                        <span data-tooltip="${fullDateStr}" style="cursor:help;">${dateStr}</span>
                        ${statusHtml}
                    </div>
                </div>
                <h3 class="card-title">${article.title}</h3>
                ${tagsHtml}
            </div>
            `;

      // Click Handler (Main)
      card.onclick = (e) => {
        // Ignore clicks on the discard zone/overlay
        if (
          e.target.closest(".discard-zone") ||
          e.target.closest(".discard-overlay")
        )
          return;
        // Ignore click on status icon if we want it to be a dedicated toggle
        if (e.target.closest(".dynamic-status-icon")) return;
        onOpen(article);
      };

      // Status Icon Click Handler (Toggle Favorite)
      const statusBtn = card.querySelector(".dynamic-status-icon");
      if (statusBtn) {
        statusBtn.onclick = (e) => {
          e.stopPropagation();
          if (onToggleFavorite) onToggleFavorite(article);
        };
      }

      // Desktop Discard Handler
      const zone = card.querySelector(".discard-zone");
      const overlay = card.querySelector(".discard-overlay");

      const discardHandler = (e) => {
        e.stopPropagation();
        e.preventDefault();
        onDiscard(article);
      };

      if (zone) zone.onclick = discardHandler;
      if (overlay) overlay.onclick = discardHandler;

      // Mobile Swipe Logic
      this.attachSwipeHandlers(card, () => onDiscard(article));

      list.appendChild(card);
    });
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
          // We cannot preventDefault on passive listeners, but standard mobile behavior
          // usually locks scroll once a horizontal gesture is recognized.

          card.style.transform = `translateX(${diffX}px)`;

          // Visual feedback (opacity fade)
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

  showTooltip: function (el, text) {
    const tooltip = document.getElementById("global-tooltip");
    if (!tooltip || !text) return;

    tooltip.textContent = text;
    tooltip.classList.add("show");
    const rect = el.getBoundingClientRect();
    // Position tooltip above element
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
    // Center horizontally
    const left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
    // Ensure within viewport
    tooltip.style.left = `${Math.max(10, Math.min(window.innerWidth - tooltip.offsetWidth - 10, left))}px`;
  },

  hideTooltip: function () {
    const tooltip = document.getElementById("global-tooltip");
    if (tooltip) tooltip.classList.remove("show");
  },

  setupGlobalTooltip: function () {
    const tooltip = document.getElementById("global-tooltip");
    if (!tooltip) return;

    const show = (el, text) => this.showTooltip(el, text);
    const hide = () => this.hideTooltip();

    document.addEventListener("mouseover", (e) => {
      const target = e.target.closest("[data-tooltip]");
      if (target) {
        show(target, target.getAttribute("data-tooltip"));
      }
    });

    document.addEventListener("mouseout", (e) => {
      const target = e.target.closest("[data-tooltip]");
      if (target) {
        hide();
      }
    });
  },
};
