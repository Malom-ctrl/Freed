import { Utils } from "../../core/utils.js";
import DOMPurify from "dompurify";

export const DiscoverView = {
  render: function (data, existingFeeds, onAddFeed, onAddPack) {
    const container = document.getElementById("article-list");
    if (!container) return;

    container.classList.add("discover-view");
    container.innerHTML = "";

    const existingIds = new Set(existingFeeds.map((f) => f.id));
    const isFeedAdded = (url) => existingIds.has(url);

    const dataFeedsMap = new Map(data.feeds.map((f) => [f.id, f]));

    const isPackAdded = (pack) => {
      const packUrls = pack.feeds
        .map((fid) => {
          const f = dataFeedsMap.get(fid);
          return f ? f.url : null;
        })
        .filter(Boolean);
      return packUrls.length > 0 && packUrls.every((url) => isFeedAdded(url));
    };

    // --- Header Search ---
    const searchRow = document.createElement("div");
    searchRow.className = "filter-bar discover-filter-bar";

    const searchWrapper = document.createElement("div");
    searchWrapper.className = "search-wrapper";
    searchWrapper.style.width = "100%";

    const svgNS = "http://www.w3.org/2000/svg";
    const searchIcon = document.createElementNS(svgNS, "svg");
    searchIcon.setAttribute("width", "16");
    searchIcon.setAttribute("height", "16");
    searchIcon.setAttribute("viewBox", "0 0 24 24");
    searchIcon.setAttribute("fill", "none");
    searchIcon.setAttribute("stroke", "currentColor");
    searchIcon.setAttribute("stroke-width", "2");
    searchIcon.setAttribute("class", "search-icon");
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", "11");
    circle.setAttribute("cy", "11");
    circle.setAttribute("r", "8");
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", "21");
    line.setAttribute("y1", "21");
    line.setAttribute("x2", "16.65");
    line.setAttribute("y2", "16.65");
    searchIcon.appendChild(circle);
    searchIcon.appendChild(line);

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.id = "discover-search";
    searchInput.className = "filter-input";
    searchInput.placeholder = "Search for feeds & packs...";
    searchInput.style.width = "100%";
    searchInput.style.paddingLeft = "36px";

    searchWrapper.appendChild(searchIcon);
    searchWrapper.appendChild(searchInput);
    searchRow.appendChild(searchWrapper);

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "discover-container";

    // --- Tags Row ---
    const allTags = new Set();
    data.feeds.forEach((f) => f.tags.forEach((t) => allTags.add(t)));
    const sortedTags = Array.from(allTags).sort();

    const tagsSection = document.createElement("div");
    tagsSection.className = "discover-tags-wrapper";

    const tagsContainer = document.createElement("div");
    tagsContainer.className = "discover-tags-container collapsed";
    tagsContainer.id = "discover-tags-container";

    const allTagPill = document.createElement("div");
    allTagPill.className = "discover-tag-pill active";
    allTagPill.dataset.tag = "all";
    allTagPill.textContent = "All Topics";
    tagsContainer.appendChild(allTagPill);

    sortedTags.forEach((tag) => {
      const pill = document.createElement("div");
      pill.className = "discover-tag-pill";
      pill.dataset.tag = DOMPurify.sanitize(tag);
      pill.textContent = DOMPurify.sanitize(tag);
      tagsContainer.appendChild(pill);
    });

    const toggleTagsBtn = document.createElement("button");
    toggleTagsBtn.id = "btn-toggle-tags";
    toggleTagsBtn.className = "btn-text";
    toggleTagsBtn.style.fontSize = "0.8rem";
    toggleTagsBtn.style.marginTop = "4px";
    toggleTagsBtn.textContent = "Show all topics";

    tagsSection.appendChild(tagsContainer);
    tagsSection.appendChild(toggleTagsBtn);

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
              .map((fid) => dataFeedsMap.get(fid))
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

        const sectionTitle = document.createElement("div");
        sectionTitle.className = "discover-section-title";
        const packIcon = document.createElementNS(svgNS, "svg");
        packIcon.setAttribute("width", "20");
        packIcon.setAttribute("height", "20");
        packIcon.setAttribute("viewBox", "0 0 24 24");
        packIcon.setAttribute("fill", "none");
        packIcon.setAttribute("stroke", "currentColor");
        packIcon.setAttribute("stroke-width", "2");
        packIcon.style.marginRight = "8px";
        const pPath = document.createElementNS(svgNS, "path");
        pPath.setAttribute(
          "d",
          "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
        );
        const pPoly = document.createElementNS(svgNS, "polyline");
        pPoly.setAttribute("points", "3.27 6.96 12 12.01 20.73 6.96");
        const pLine = document.createElementNS(svgNS, "line");
        pLine.setAttribute("x1", "12");
        pLine.setAttribute("y1", "22.08");
        pLine.setAttribute("x2", "12");
        pLine.setAttribute("y2", "12");
        packIcon.appendChild(pPath);
        packIcon.appendChild(pPoly);
        packIcon.appendChild(pLine);
        sectionTitle.appendChild(packIcon);
        sectionTitle.appendChild(document.createTextNode(" Featured Packs"));
        packsSection.appendChild(sectionTitle);

        const packGrid = document.createElement("div");
        packGrid.className = "pack-grid";

        visiblePacks.forEach((pack) => {
          const card = document.createElement("div");
          card.className = "pack-card";
          const alreadyAdded = isPackAdded(pack);

          const packFeeds = pack.feeds
            .map((fid) => dataFeedsMap.get(fid))
            .filter(Boolean);
          const feedNames = packFeeds.map((f) => f.title);

          let feedListText = "";
          if (feedNames.length > 0) {
            const displayNames = feedNames.slice(0, 3).join(", ");
            const diff = feedNames.length - 3;
            feedListText = displayNames + (diff > 0 ? ` & ${diff} more` : "");
          }

          const pTitle = document.createElement("div");
          pTitle.className = "pack-title";
          pTitle.textContent = pack.title;

          const pDesc = document.createElement("div");
          pDesc.className = "pack-description";
          pDesc.textContent = pack.description;

          const pPreview = document.createElement("div");
          pPreview.className = "pack-feed-preview-text";
          const pLabel = document.createElement("span");
          pLabel.style.fontWeight = "600";
          pLabel.style.fontSize = "0.75rem";
          pLabel.style.textTransform = "uppercase";
          pLabel.style.color = "var(--text-muted)";
          pLabel.textContent = "Includes:";
          const pList = document.createElement("span");
          pList.className = "feed-list-text";
          pList.textContent = feedListText;
          pPreview.appendChild(pLabel);
          pPreview.appendChild(pList);

          const pBtn = document.createElement("button");
          pBtn.className = `btn btn-outline ${alreadyAdded ? "added" : ""}`;
          pBtn.style.marginTop = "auto";
          pBtn.style.width = "100%";
          if (alreadyAdded) pBtn.disabled = true;
          pBtn.textContent = alreadyAdded ? "Pack Added" : "Add Pack";

          card.appendChild(pTitle);
          card.appendChild(pDesc);
          card.appendChild(pPreview);
          card.appendChild(pBtn);

          if (!alreadyAdded) {
            pBtn.onclick = async () => {
              pBtn.textContent = "Adding Pack...";
              pBtn.disabled = true;
              await onAddPack(pack);
              pBtn.textContent = "Pack Added";
              pBtn.classList.add("added");
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
        const noFeeds = document.createElement("div");
        noFeeds.style.textAlign = "center";
        noFeeds.style.color = "var(--text-muted)";
        noFeeds.style.padding = "40px";
        noFeeds.style.gridColumn = "1/-1";
        noFeeds.textContent = "No feeds found matching filters.";
        feedGrid.appendChild(noFeeds);
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

            const img = document.createElement("img");
            img.src = iconUrl;
            img.className = "feed-icon-large";
            img.onerror = function () {
              this.style.display = "none";
            };

            const infoDiv = document.createElement("div");
            infoDiv.className = "feed-info";

            const fTitle = document.createElement("div");
            fTitle.className = "feed-title";
            fTitle.textContent = feed.title;

            const fDesc = document.createElement("div");
            fDesc.className = "feed-desc";
            fDesc.textContent = feed.description;

            const cardTags = document.createElement("div");
            cardTags.className = "card-tags";
            cardTags.style.marginTop = "8px";

            feed.tags.forEach((t) => {
              const tSpan = document.createElement("span");
              tSpan.className = "tag-pill";
              tSpan.style.background = "transparent";
              tSpan.style.color = "var(--text-muted)";
              tSpan.style.fontSize = "0.7rem";
              tSpan.style.border = "1px solid var(--border)";
              tSpan.textContent = DOMPurify.sanitize(t);
              cardTags.appendChild(tSpan);
            });

            infoDiv.appendChild(fTitle);
            infoDiv.appendChild(fDesc);
            infoDiv.appendChild(cardTags);

            const fBtn = document.createElement("button");
            fBtn.className = `feed-add-btn ${added ? "added" : ""}`;
            if (added) fBtn.disabled = true;
            fBtn.textContent = added ? "Added" : "Add";

            item.appendChild(img);
            item.appendChild(infoDiv);
            item.appendChild(fBtn);

            if (!added) {
              fBtn.onclick = async () => {
                fBtn.textContent = "Adding...";
                fBtn.disabled = true;
                fBtn.style.cursor = "wait";
                const success = await onAddFeed(feed);
                if (success) {
                  fBtn.textContent = "Added";
                  fBtn.className = "feed-add-btn added";
                  fBtn.onclick = null;
                  fBtn.style.cursor = "default";
                } else {
                  fBtn.textContent = "Add";
                  fBtn.className = "feed-add-btn";
                  fBtn.disabled = false;
                  fBtn.style.cursor = "pointer";
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

    toggleTagsBtn.onclick = () => {
      if (tagsContainer.classList.contains("collapsed")) {
        tagsContainer.classList.remove("collapsed");
        toggleTagsBtn.textContent = "Show fewer topics";
      } else {
        tagsContainer.classList.add("collapsed");
        tagsContainer.scrollTop = 0;
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
