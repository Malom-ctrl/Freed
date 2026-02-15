window.Freed = window.Freed || {};

window.Freed.UI = {
  renderFeedList: function (feeds, currentFeedId, onSwitch, onEdit) {
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

      // Fallback to currentColor allows CSS color (text color) to take over,
      // useful for "no accent" state.
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

      // Gear icon for settings
      const settingsIcon = `<div class="feed-settings-btn" title="Edit Feed"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></div>`;

      div.innerHTML = `
                <div class="nav-item-content" style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
                    ${iconSvg}
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${feed.title}</span>
                </div>
                ${settingsIcon}
            `;

      // Handle main click on the entire row
      div.onclick = (e) => {
        onSwitch(feed.id);
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

  renderArticles: function (articles, onOpen, showImages = true, onDiscard) {
    const list = document.getElementById("article-list");
    if (!list) return;
    list.innerHTML = "";

    if (articles.length === 0) {
      // Check if we are filtering or just have no feeds
      const hasFilters =
        document.getElementById("filter-status")?.value !== "all" ||
        document.getElementById("filter-date")?.value !== "all" ||
        document.getElementById("filter-tag")?.value !== "all";

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
      const dateStr = new Date(article.pubDate).toLocaleDateString();
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

      // Offline Indicator
      let offlineIconHtml = "";
      if (article.fullContent) {
        offlineIconHtml = `<svg class="offline-icon" data-tooltip="Offline Available" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px; color: var(--text-muted); opacity: 0.7;"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line></svg>`;
      }

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
            <div class="card-fav-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </div>
            <div class="card-body">
                <div class="card-meta">
                    <span ${feedTitleStyle}>${article.feedTitle}</span>
                    <div style="display:flex; align-items:center;">
                        <span>${dateStr}</span>
                        ${offlineIconHtml}
                    </div>
                </div>
                <h3 class="card-title">${article.title}</h3>
                ${tagsHtml}
            </div>
            `;

      // Click Handler (Main)
      card.onclick = (e) => {
        // Ignore clicks on the discard zone/overlay (though propagation should stop)
        if (
          e.target.closest(".discard-zone") ||
          e.target.closest(".discard-overlay")
        )
          return;
        onOpen(article);
      };

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
