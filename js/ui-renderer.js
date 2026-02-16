window.Freed = window.Freed || {};

window.Freed.UI = {
  toggleModal: function (modalId, show) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show) {
      modal.classList.add("open");
    } else {
      modal.classList.remove("open");
    }
  },

  renderFeedList: function (feeds, currentFeedId, onSwitch, onEdit, onStats) {
    const { hexToRgba } = window.Freed.Utils;
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
        div.style.backgroundColor = hexToRgba(feed.color, 0.1);
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

  renderDiscoverView: function (data, existingFeeds, onAddFeed, onAddPack) {
    const container = document.getElementById("article-list");
    if (!container) return;

    // Apply override class for layout
    container.classList.add("discover-view");
    container.innerHTML = "";

    // Helper to check if added
    const isFeedAdded = (url) => existingFeeds.some((f) => f.url === url);

    // Helper to check if pack added (all constituent feeds exist)
    const isPackAdded = (pack) => {
      const packUrls = pack.feeds
        .map((fid) => {
          const f = data.feeds.find((df) => df.id === fid);
          return f ? f.url : null;
        })
        .filter(Boolean);
      return packUrls.length > 0 && packUrls.every((url) => isFeedAdded(url));
    };

    // --- Header Search Area ---
    const searchRow = document.createElement("div");
    searchRow.className = "filter-bar discover-filter-bar";
    searchRow.innerHTML = `
         <div class="search-wrapper" style="width:100%">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
             <input type="text" id="discover-search" class="filter-input" placeholder="Search for feeds & packs..." style="width:100%; padding-left:36px;">
         </div>
      `;

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "discover-container";

    // --- Tags Row (Expandable) ---
    const allTags = new Set();
    data.feeds.forEach((f) => f.tags.forEach((t) => allTags.add(t)));
    const sortedTags = Array.from(allTags).sort();

    const tagsSection = document.createElement("div");
    tagsSection.className = "discover-tags-wrapper";

    let tagsHtml = `<div class="discover-tag-pill active" data-tag="all">All Topics</div>`;
    sortedTags.forEach((tag) => {
      tagsHtml += `<div class="discover-tag-pill" data-tag="${tag}">${tag}</div>`;
    });

    tagsSection.innerHTML = `
        <div class="discover-tags-container collapsed" id="discover-tags-container">
            ${tagsHtml}
        </div>
        <button id="btn-toggle-tags" class="btn-text" style="font-size:0.8rem; margin-top:4px;">Show all topics</button>
      `;

    // --- Feed Grid (Lazy Loaded) ---
    const feedGrid = document.createElement("div");
    feedGrid.className = "feed-directory-grid";

    // Sentinel for IntersectionObserver
    const sentinel = document.createElement("div");
    sentinel.className = "feed-loader-sentinel";
    sentinel.style.height = "20px";
    sentinel.style.width = "100%";
    sentinel.innerHTML = `<div style="text-align:center; color:var(--text-muted); opacity:0.5;">Loading more...</div>`;
    sentinel.style.display = "none"; // Hidden by default

    let currentFilteredFeeds = [];
    let renderedCount = 0;
    const BATCH_SIZE = 20;
    let gridObserver = null;

    // --- Render a Batch of Feeds ---
    const renderBatch = () => {
      const batch = currentFilteredFeeds.slice(
        renderedCount,
        renderedCount + BATCH_SIZE,
      );
      if (batch.length === 0) {
        sentinel.style.display = "none";
        return;
      }

      batch.forEach((feed) => {
        const added = isFeedAdded(feed.url);
        let domain = "";
        try {
          domain = new URL(feed.url).hostname;
        } catch (e) {}
        const iconUrl = domain
          ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
          : "";

        const item = document.createElement("div");
        item.className = "feed-directory-card";
        item.innerHTML = `
                <img src="${iconUrl}" class="feed-icon-large" onerror="this.style.display='none'">
                <div class="feed-info">
                    <div class="feed-title">${feed.title}</div>
                    <div class="feed-desc">${feed.description}</div>
                    <div class="card-tags" style="margin-top:8px;">
                        ${feed.tags.map((t) => `<span class="tag-pill" style="background:transparent; color:var(--text-muted); font-size:0.7rem; border:1px solid var(--border);">${t}</span>`).join("")}
                    </div>
                </div>
                <button class="feed-add-btn ${added ? "added" : ""}" ${added ? "disabled" : ""}>${added ? "Added" : "Add"}</button>
              `;

        if (!added) {
          const btn = item.querySelector("button");
          btn.onclick = async () => {
            btn.textContent = "Adding...";
            btn.disabled = true;
            btn.style.cursor = "wait";

            const success = await onAddFeed(feed);

            if (success) {
              btn.textContent = "Added";
              btn.className = "feed-add-btn added";
              btn.onclick = null;
              btn.style.cursor = "default";
            } else {
              btn.textContent = "Add";
              btn.className = "feed-add-btn";
              btn.disabled = false;
              btn.style.cursor = "pointer";
            }
          };
        }
        feedGrid.appendChild(item);
      });

      renderedCount += batch.length;

      if (renderedCount >= currentFilteredFeeds.length) {
        sentinel.style.display = "none";
      } else {
        sentinel.style.display = "block";
      }
    };

    // --- Main Render Controller ---
    const renderContent = (filterTag = "all", filterText = "") => {
      contentWrapper.innerHTML = "";
      contentWrapper.appendChild(tagsSection);

      const lowerFilter = filterText.toLowerCase();

      // 1. Packs Section (Only show if no search or matches search)
      let visiblePacks = [];

      if (filterTag === "all") {
        if (!lowerFilter) {
          visiblePacks = data.packs;
        } else {
          visiblePacks = data.packs.filter(
            (p) =>
              p.title.toLowerCase().includes(lowerFilter) ||
              p.description.toLowerCase().includes(lowerFilter),
          );
        }
      }

      if (visiblePacks.length > 0) {
        const packsSection = document.createElement("div");
        packsSection.innerHTML = `<div class="discover-section-title"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> Featured Packs</div>`;

        const packGrid = document.createElement("div");
        packGrid.className = "pack-grid";

        visiblePacks.forEach((pack) => {
          const card = document.createElement("div");
          card.className = "pack-card";
          const alreadyAdded = isPackAdded(pack);

          // Resolve feed names
          const packFeeds = pack.feeds
            .map((fid) => data.feeds.find((f) => f.id === fid))
            .filter(Boolean);
          const feedNames = packFeeds.map((f) => f.title);

          // Compact List
          let feedListText = "";
          if (feedNames.length > 0) {
            const displayNames = feedNames.slice(0, 3).join(", ");
            const diff = feedNames.length - 3;
            feedListText = displayNames + (diff > 0 ? ` & ${diff} more` : "");
          }

          card.innerHTML = `
                    <div class="pack-title">${pack.title}</div>
                    <div class="pack-description">${pack.description}</div>
                    <div class="pack-feed-preview-text">
                        <span style="font-weight:600; font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Includes:</span>
                        ${feedListText}
                    </div>
                    <button class="btn btn-outline ${alreadyAdded ? "added" : ""}" style="margin-top:auto; width:100%;" ${alreadyAdded ? "disabled" : ""}>${alreadyAdded ? "Pack Added" : "Add Pack"}</button>
                  `;

          if (!alreadyAdded) {
            const btn = card.querySelector("button");
            btn.onclick = async () => {
              btn.textContent = "Adding Pack...";
              btn.disabled = true;
              await onAddPack(pack);
              btn.textContent = "Pack Added";
              btn.classList.add("added");
            };
          }
          packGrid.appendChild(card);
        });

        packsSection.appendChild(packGrid);
        contentWrapper.appendChild(packsSection);
      }

      // 2. Directory Section
      const directoryTitle = document.createElement("div");
      directoryTitle.className = "discover-section-title";
      directoryTitle.textContent = "Directory";
      contentWrapper.appendChild(directoryTitle);

      // Reset Grid
      feedGrid.innerHTML = "";
      renderedCount = 0;
      currentFilteredFeeds = data.feeds.filter((feed) => {
        if (filterTag !== "all" && !feed.tags.includes(filterTag)) return false;
        if (
          lowerFilter &&
          !feed.title.toLowerCase().includes(lowerFilter) &&
          !feed.description.toLowerCase().includes(lowerFilter)
        )
          return false;
        return true;
      });

      if (currentFilteredFeeds.length === 0) {
        feedGrid.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:40px; grid-column:1/-1;">No feeds found matching filters.</div>`;
      } else {
        renderBatch(); // Initial batch
      }

      contentWrapper.appendChild(feedGrid);
      contentWrapper.appendChild(sentinel);

      // Observe Sentinel
      if (gridObserver) gridObserver.disconnect();

      if (currentFilteredFeeds.length > 0) {
        gridObserver = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting) {
              renderBatch();
            }
          },
          { root: container, threshold: 0.1 },
        );

        gridObserver.observe(sentinel);
      }
    };

    // Event Listeners for Filters
    tagsSection.addEventListener("click", (e) => {
      if (e.target.classList.contains("discover-tag-pill")) {
        tagsSection
          .querySelectorAll(".discover-tag-pill")
          .forEach((p) => p.classList.remove("active"));
        e.target.classList.add("active");
        const searchVal = document.getElementById("discover-search").value;
        renderContent(e.target.dataset.tag, searchVal);
      }
    });

    // Toggle Tags Button
    const toggleTagsBtn = tagsSection.querySelector("#btn-toggle-tags");
    const tagsContainerDiv = tagsSection.querySelector(
      "#discover-tags-container",
    );

    toggleTagsBtn.onclick = () => {
      if (tagsContainerDiv.classList.contains("collapsed")) {
        tagsContainerDiv.classList.remove("collapsed");
        toggleTagsBtn.textContent = "Show fewer topics";
      } else {
        tagsContainerDiv.classList.add("collapsed");
        tagsContainerDiv.scrollTop = 0;
        toggleTagsBtn.textContent = "Show all topics";
      }
    };

    searchRow
      .querySelector("#discover-search")
      .addEventListener("input", (e) => {
        const activeTagEl = tagsSection.querySelector(".active");
        const activeTag = activeTagEl ? activeTagEl.dataset.tag : "all";
        renderContent(activeTag, e.target.value);
      });

    // Initial Render
    container.appendChild(searchRow);
    container.appendChild(contentWrapper);
    renderContent();
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
    this.toggleModal("stats-modal", true);
  },

  renderArticles: function (
    articles,
    onOpen,
    showImages = true,
    onDiscard,
    onToggleFavorite,
  ) {
    const { formatRelativeTime, hexToRgba, formatFullDate } =
      window.Freed.Utils;
    const list = document.getElementById("article-list");
    if (!list) return;

    // Ensure we are in grid mode (standard view)
    list.classList.remove("discover-view");
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
      const dateStr = formatRelativeTime(article.pubDate);
      const fullDateStr = formatFullDate(article.pubDate);

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
          let bg = hexToRgba(tag.color, 0.15);
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
