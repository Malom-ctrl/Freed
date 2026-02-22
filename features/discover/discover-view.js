import { Utils } from "../../core/utils.js";
import DOMPurify from "dompurify";

export const DiscoverView = {
  render: function (data, existingFeeds, onAddFeed, onAddPack) {
    const container = document.getElementById("article-list");
    if (!container) return;

    container.classList.add("discover-view");
    container.innerHTML = "";

    const isFeedAdded = (url) => existingFeeds.some((f) => f.url === url);
    const isPackAdded = (pack) => {
      const packUrls = pack.feeds
        .map((fid) => {
          const f = data.feeds.find((df) => df.id === fid);
          return f ? f.url : null;
        })
        .filter(Boolean);
      return packUrls.length > 0 && packUrls.every((url) => isFeedAdded(url));
    };

    // --- Header Search ---
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

    // --- Tags Row ---
    const allTags = new Set();
    data.feeds.forEach((f) => f.tags.forEach((t) => allTags.add(t)));
    const sortedTags = Array.from(allTags).sort();

    const tagsSection = document.createElement("div");
    tagsSection.className = "discover-tags-wrapper";

    let tagsHtml = `<div class="discover-tag-pill active" data-tag="all">All Topics</div>`;
    sortedTags.forEach((tag) => {
      tagsHtml += `<div class="discover-tag-pill" data-tag="${DOMPurify.sanitize(tag)}">${DOMPurify.sanitize(tag)}</div>`;
    });

    tagsSection.innerHTML = `
        <div class="discover-tags-container collapsed" id="discover-tags-container">
            ${tagsHtml}
        </div>
        <button id="btn-toggle-tags" class="btn-text" style="font-size:0.8rem; margin-top:4px;">Show all topics</button>
      `;

    // --- Feed Grid Container ---
    const feedGrid = document.createElement("div");
    feedGrid.className = "feed-directory-grid";

    let gridObserver = null;

    // --- Main Render Controller ---
    const renderContent = (filterTag = "all", filterText = "") => {
      // Disconnect previous observer if re-rendering
      if (gridObserver) {
        gridObserver.disconnect();
        gridObserver = null;
      }

      contentWrapper.innerHTML = "";
      contentWrapper.appendChild(tagsSection);

      const lowerFilter = filterText.toLowerCase();

      // 1. Packs Section
      let visiblePacks = [];
      if (filterTag === "all") {
        if (!lowerFilter) {
          visiblePacks = data.packs;
        } else {
          visiblePacks = data.packs.filter((p) => {
            if (
              p.title.toLowerCase().includes(lowerFilter) ||
              p.description.toLowerCase().includes(lowerFilter)
            ) {
              return true;
            }
            const feedsInPack = p.feeds
              .map((fid) => data.feeds.find((f) => f.id === fid))
              .filter(Boolean);
            return feedsInPack.some(
              (f) =>
                f.title.toLowerCase().includes(lowerFilter) ||
                f.tags.some((t) => t.toLowerCase().includes(lowerFilter)),
            );
          });
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

          const packFeeds = pack.feeds
            .map((fid) => data.feeds.find((f) => f.id === fid))
            .filter(Boolean);
          const feedNames = packFeeds.map((f) => f.title);

          let feedListText = "";
          if (feedNames.length > 0) {
            const displayNames = feedNames.slice(0, 3).join(", ");
            const diff = feedNames.length - 3;
            feedListText = displayNames + (diff > 0 ? ` & ${diff} more` : "");
          }

          card.innerHTML = DOMPurify.sanitize(`
                    <div class="pack-title">${pack.title}</div>
                    <div class="pack-description">${pack.description}</div>
                    <div class="pack-feed-preview-text">
                        <span style="font-weight:600; font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Includes:</span>
                        <span class="feed-list-text"></span>
                    </div>
                    <button class="btn btn-outline ${alreadyAdded ? "added" : ""}" style="margin-top:auto; width:100%;" ${alreadyAdded ? "disabled" : ""}>${alreadyAdded ? "Pack Added" : "Add Pack"}</button>
                  `);

          // Set text content safely
          card.querySelector(".pack-title").textContent = pack.title;
          card.querySelector(".pack-description").textContent =
            pack.description;
          card.querySelector(".feed-list-text").textContent = feedListText;

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

      feedGrid.innerHTML = "";
      contentWrapper.appendChild(feedGrid);

      // Filtering Logic
      const filteredFeeds = data.feeds.filter((feed) => {
        if (filterTag !== "all" && !feed.tags.includes(filterTag)) return false;

        if (lowerFilter) {
          const matchesTitle = feed.title.toLowerCase().includes(lowerFilter);
          const matchesDesc = feed.description
            .toLowerCase()
            .includes(lowerFilter);
          const matchesTags = feed.tags.some((t) =>
            t.toLowerCase().includes(lowerFilter),
          );
          if (!matchesTitle && !matchesDesc && !matchesTags) return false;
        }
        return true;
      });

      if (filteredFeeds.length === 0) {
        feedGrid.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:40px; grid-column:1/-1;">No feeds found matching filters.</div>`;
      } else {
        const batchSize = 20;
        let renderedCount = 0;

        const renderBatch = () => {
          const batch = filteredFeeds.slice(
            renderedCount,
            renderedCount + batchSize,
          );
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

            const tagsHtml = feed.tags
              .map(
                (t) =>
                  `<span class="tag-pill" style="background:transparent; color:var(--text-muted); font-size:0.7rem; border:1px solid var(--border);">${DOMPurify.sanitize(t)}</span>`,
              )
              .join("");

            item.innerHTML = DOMPurify.sanitize(`
                            <img src="${iconUrl}" class="feed-icon-large" onerror="this.style.display='none'">
                            <div class="feed-info">
                                <div class="feed-title"></div>
                                <div class="feed-desc"></div>
                                <div class="card-tags" style="margin-top:8px;">
                                    ${tagsHtml}
                                </div>
                            </div>
                            <button class="feed-add-btn ${added ? "added" : ""}" ${added ? "disabled" : ""}>${added ? "Added" : "Add"}</button>
                        `);

            item.querySelector(".feed-title").textContent = feed.title;
            item.querySelector(".feed-desc").textContent = feed.description;

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
        };

        renderBatch();

        // Simple infinite scroll
        const sentinel = document.createElement("div");
        sentinel.style.height = "20px";
        sentinel.style.gridColumn = "1/-1";
        feedGrid.appendChild(sentinel);

        gridObserver = new IntersectionObserver((entries) => {
          if (
            entries[0].isIntersecting &&
            renderedCount < filteredFeeds.length
          ) {
            feedGrid.removeChild(sentinel);
            renderBatch();
            feedGrid.appendChild(sentinel);
          }
        });
        gridObserver.observe(sentinel);
      }
    };

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

    container.appendChild(searchRow);
    container.appendChild(contentWrapper);
    renderContent();
  },
};
