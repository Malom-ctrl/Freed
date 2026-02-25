import { Registry } from "../plugin-system/registry.js";
import DOMPurify from "dompurify";
import { Modals } from "../../components/modals.js";

export const StatsView = {
  _createStatBar: function (label, value, total, color) {
    const pct = Math.min(100, Math.round((value / total) * 100)) || 0;

    const container = document.createElement("div");
    container.className = "stat-bar-container";

    const labelRow = document.createElement("div");
    labelRow.className = "stat-bar-label-row";

    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;

    const valueSpan = document.createElement("span");
    valueSpan.className = "stat-bar-value";
    valueSpan.textContent = `${value} `;

    const pctSpan = document.createElement("span");
    pctSpan.className = "stat-bar-pct";
    pctSpan.textContent = `(${pct}%)`;

    valueSpan.appendChild(pctSpan);
    labelRow.appendChild(labelSpan);
    labelRow.appendChild(valueSpan);

    const barContainer = document.createElement("div");
    barContainer.className = "stat-bar-track";

    const bar = document.createElement("div");
    bar.className = "stat-bar-fill";
    bar.style.width = `${pct}%`;
    bar.style.background = color;

    barContainer.appendChild(bar);
    container.appendChild(labelRow);
    container.appendChild(barContainer);

    return container;
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
    };

    const total = Math.max(stats.totalFetched, 1);

    while (content.firstChild) content.removeChild(content.firstChild);

    const headerDiv = document.createElement("div");
    headerDiv.className = "stats-header";

    const countDiv = document.createElement("div");
    countDiv.className = "stats-total-count";
    countDiv.textContent = stats.totalFetched;

    const labelDiv = document.createElement("div");
    labelDiv.className = "stats-total-label";
    labelDiv.textContent = "Total Articles Fetched";

    headerDiv.appendChild(countDiv);
    headerDiv.appendChild(labelDiv);
    content.appendChild(headerDiv);

    const parser = new DOMParser();
    const appendStatBar = (label, value, total, color) => {
      const el = this._createStatBar(label, value, total, color);
      content.appendChild(el);
    };

    appendStatBar("Read", stats.read, total, "#10b981");
    appendStatBar("Discarded", stats.discarded, total, "#ef4444");
    appendStatBar("Favorited", stats.favorited, total, "#f59e0b");

    // Render Custom Plugin Stats
    const customStats = Registry.getExtensions("stats:feed");
    if (customStats.length > 0) {
      customStats.forEach((item) => {
        if (typeof item.render === "function") {
          const html = item.render(feed);
          if (html) {
            const div = document.createElement("div");
            const doc = parser.parseFromString(
              DOMPurify.sanitize(html),
              "text/html",
            );
            while (doc.body.firstChild) div.appendChild(doc.body.firstChild);
            content.appendChild(div);
          }
        }
      });
    }

    document.getElementById("stats-modal-title").textContent =
      `${feed.title} Stats`;
    Modals.toggleModal("stats-modal", true);
  },
};
