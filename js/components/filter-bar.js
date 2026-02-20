import { State } from "../core/state.js";
import { DB } from "../core/db.js";
import { Events } from "../core/events.js";
import DOMPurify from "dompurify";

export const FilterBar = {
  applyFilters: function (articles) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;
    const filters = State.filters;

    return articles.filter((a) => {
      // Status Logic
      if (filters.status === "discarded") {
        if (!a.discarded) return false;
      } else {
        // Default: Hide discarded
        if (a.discarded) return false;

        // Unread: progress < 1 (or undefined)
        if (
          filters.status === "unread" &&
          a.readingProgress &&
          a.readingProgress >= 1
        )
          return false;

        // Read: progress >= 1
        if (
          filters.status === "read" &&
          (!a.readingProgress || a.readingProgress < 1)
        )
          return false;

        if (filters.status === "favorites" && !a.favorite) return false;

        // Unfinished: Started but not finished (0 < progress < 1)
        if (
          filters.status === "unfinished" &&
          (!a.readingProgress ||
            a.readingProgress === 0 ||
            a.readingProgress >= 1)
        )
          return false;
      }

      const articleTime = new Date(a.pubDate).getTime();
      if (filters.date === "24h" && now - articleTime > oneDay) return false;
      if (filters.date === "7d" && now - articleTime > sevenDays) return false;

      if (filters.tags && filters.tags.length > 0) {
        const hasTag =
          a.feedTags && a.feedTags.some((t) => filters.tags.includes(t.name));
        if (!hasTag) return false;
      }

      if (filters.search) {
        const term = filters.search.toLowerCase();
        const title = (a.title || "").toLowerCase();
        const snippet = (a.snippet || "").toLowerCase();
        const feed = (a.feedTitle || "").toLowerCase();
        if (
          !title.includes(term) &&
          !snippet.includes(term) &&
          !feed.includes(term)
        ) {
          return false;
        }
      }
      return true;
    });
  },

  updateUI: function () {
    const statusSelect = document.getElementById("filter-status");
    const dateSelect = document.getElementById("filter-date");
    const searchInput = document.getElementById("filter-search");
    const clearBtn = document.getElementById("btn-clear-filters");

    if (statusSelect) statusSelect.value = State.filters.status;
    if (dateSelect) dateSelect.value = State.filters.date;
    if (searchInput) searchInput.value = State.filters.search;

    this.renderTags();

    if (clearBtn) {
      if (
        State.filters.status !== "all" ||
        State.filters.date !== "all" ||
        (State.filters.tags && State.filters.tags.length > 0) ||
        State.filters.search
      ) {
        clearBtn.style.display = "block";
        // Also highlight toggle button if on mobile
        const toggle = document.getElementById("btn-toggle-filters");
        if (toggle) toggle.classList.add("active");
      } else {
        clearBtn.style.display = "none";
        const toggle = document.getElementById("btn-toggle-filters");
        if (toggle) toggle.classList.remove("active");
      }
    }
  },

  renderTags: async function () {
    const container = document.getElementById("filter-active-tags");
    if (!container) return;
    container.innerHTML = "";

    const allTags = await DB.getAllTags();
    const tagMap = new Map(allTags.map((t) => [t.name, t.color]));

    State.filters.tags.forEach((tagName) => {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      const color = tagMap.get(tagName) || "var(--primary)";
      pill.style.backgroundColor = color;
      pill.style.color = "#fff";

      // Use textContent for safety
      pill.textContent = tagName;

      const removeSpan = document.createElement("span");
      removeSpan.className = "remove-tag";
      removeSpan.style.marginLeft = "4px";
      removeSpan.style.cursor = "pointer";
      removeSpan.innerHTML = "&times;"; // &times; is safe static HTML

      removeSpan.onclick = () => {
        State.filters.tags = State.filters.tags.filter((t) => t !== tagName);
        State.saveFilters();
        Events.emit(Events.FILTER_CHANGED);
      };

      pill.appendChild(removeSpan);
      container.appendChild(pill);
    });
  },

  setupListeners: function () {
    document.getElementById("filter-search")?.addEventListener("input", (e) => {
      State.filters.search = e.target.value;
      State.saveFilters();
      Events.emit(Events.FILTER_CHANGED);
    });

    document
      .getElementById("filter-status")
      ?.addEventListener("change", (e) => {
        State.filters.status = e.target.value;
        State.saveFilters();
        Events.emit(Events.FILTER_CHANGED);
      });

    document.getElementById("filter-date")?.addEventListener("change", (e) => {
      State.filters.date = e.target.value;
      State.saveFilters();
      Events.emit(Events.FILTER_CHANGED);
    });

    document
      .getElementById("btn-clear-filters")
      ?.addEventListener("click", () => {
        State.filters.status = "all";
        State.filters.date = "all";
        State.filters.tags = [];
        State.filters.search = "";
        State.saveFilters();
        Events.emit(Events.FILTER_CHANGED);
      });

    // Filter Toggle (Mobile)
    document
      .getElementById("btn-toggle-filters")
      ?.addEventListener("click", () => {
        document.getElementById("filter-bar")?.classList.toggle("open");
      });
  },
};
