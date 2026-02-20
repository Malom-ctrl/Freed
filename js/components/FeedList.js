import { Utils } from "../utils.js";
import DOMPurify from "dompurify";

export const FeedList = {
  render: function (feeds, currentFeedId, onSwitch, onEdit, onStats) {
    const { hexToRgba } = Utils;
    const container = document.getElementById("feed-list-container");
    if (!container) return;
    container.innerHTML = "";

    feeds.forEach((feed) => {
      const div = document.createElement("div");
      const isActive = currentFeedId === feed.id;
      div.className = `nav-item ${isActive ? "active" : ""}`;

      // Use displayColor for rendering logic
      const activeColor = feed.displayColor;

      // Apply dynamic active color if present
      if (isActive && activeColor) {
        div.style.color = activeColor;
        div.style.backgroundColor = hexToRgba(activeColor, 0.1);
      }

      const strokeColor = activeColor ? activeColor : "currentColor";

      // Choose icon based on feed type or use cached iconData
      let iconSvg = "";

      if (feed.iconData) {
        // Sanitize URL just in case, though it's likely base64
        const safeUrl = DOMPurify.sanitize(feed.iconData);
        iconSvg = `<img src="${safeUrl}" style="width:20px; height:20px; border-radius:2px; object-fit:contain;">`;
      } else if (feed.type === "web") {
        // Globe icon
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
      } else {
        // RSS icon
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle></svg>`;
      }

      // Stats Icon (Bar Chart)
      const statsIcon = `<div class="feed-btn-icon feed-stats-btn" title="Stats"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg></div>`;

      // Gear icon for settings
      const settingsIcon = `<div class="feed-btn-icon feed-settings-btn" title="Edit Feed"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 0 2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></div>`;

      // Use DOMPurify for the structure, but insert title as textContent for safety
      const contentHtml = `
                <div class="nav-item-content" style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
                    ${iconSvg}
                    <span class="feed-title-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></span>
                </div>
                <div style="display: flex; gap: 2px;">
                    ${statsIcon}
                    ${settingsIcon}
                </div>
            `;

      div.innerHTML = DOMPurify.sanitize(contentHtml);

      // Set title safely
      const titleSpan = div.querySelector(".feed-title-text");
      if (titleSpan) titleSpan.textContent = feed.title;

      // Handle main click on the entire row
      div.onclick = (e) => {
        onSwitch(feed.id);
      };

      // Handle stats click
      const statsBtn = div.querySelector(".feed-stats-btn");
      if (statsBtn) {
        statsBtn.onclick = (e) => {
          e.stopPropagation();
          onStats(feed);
        };
      }

      // Handle edit click
      const settingsBtn = div.querySelector(".feed-settings-btn");
      if (settingsBtn) {
        settingsBtn.onclick = (e) => {
          e.stopPropagation();
          onEdit(feed);
        };
      }

      container.appendChild(div);
    });

    // Update active states for static items
    const allBtn = document.querySelector('[data-id="all"]');
    if (allBtn) {
      if (currentFeedId === "all") allBtn.classList.add("active");
      else allBtn.classList.remove("active");
    }
    const discBtn = document.querySelector('[data-id="discover"]');
    if (discBtn) {
      if (currentFeedId === "discover") discBtn.classList.add("active");
      else discBtn.classList.remove("active");
    }
  },
};
