import { DB } from "./db.js";
import { Utils } from "./utils.js";
import { Config } from "./config.js";
import { State } from "./state.js";
import { Events } from "./events.js";
import { Theme } from "../features/settings/theme.js";
import { Tools } from "../features/tools/tools.js";
import { Tags } from "../features/tags/tags.js";
import { FeedService } from "../features/feeds/feed-service.js";
import { DiscoverData } from "../features/discover/discover-data.js";
import { Manager as PluginManager } from "../features/plugin-system/manager.js";
import { FilterBar } from "../components/filter-bar.js";
import { SettingsModal } from "../features/settings/settings-modal.js";
import { ReaderView } from "../features/reader/reader-view.js";
import { FeedModal } from "../features/feeds/feed-modal.js";
import { Sidebar } from "../components/sidebar.js";
import { Modals } from "../components/modals.js";
import { StatsView } from "../features/stats/stats-view.js";
import { FeedList } from "../features/feeds/feed-list.js";
import { ArticleList } from "../features/article-list/article-list.js";
import { DiscoverView } from "../features/discover/discover-view.js";
import { DiscoverService } from "../features/discover/discover-service.js";
import { Navbar } from "../components/navbar.js";

import { Registry } from "../features/plugin-system/registry.js";

// --- Initialization ---
async function init() {
  Theme.init();
  State.load();

  // Clear ghost history state on reload
  if (history.state && history.state.readingView) {
    history.replaceState(null, "", location.pathname + location.search);
  }

  registerSW();

  await DB.openDB();

  // Initialize Plugins System (loads installed & builtins)
  await PluginManager.init();

  // Auto-update plugins in background
  PluginManager.autoUpdatePlugins().then((count) => {
    if (count > 0) {
      Utils.showToast(`${count} plugin${count > 1 ? "s" : ""} updated.`, {
        label: "Reload",
        callback: () => window.location.reload(),
      });
    }
  });

  setupEventListeners();
  Tools.setupSelectionTools();
  Modals.setupGlobalTooltip();
  Tags.setupTagColorPopup();
  Tags.setupTagInputs(() => Events.emit(Events.FILTER_CHANGED));

  // Run Data Cleanup Policy
  const cleanupSettings = {
    unreadDays: parseInt(
      localStorage.getItem("cleanup_unread_days") ||
        Config.DEFAULTS.CLEANUP_UNREAD_DAYS,
    ),
    contentDays: parseInt(
      localStorage.getItem("cleanup_content_days") ||
        Config.DEFAULTS.CLEANUP_CONTENT_DAYS,
    ),
    readDays: parseInt(
      localStorage.getItem("cleanup_read_days") ||
        Config.DEFAULTS.CLEANUP_READ_DAYS,
    ),
  };
  DB.performCleanup(cleanupSettings).catch((e) =>
    console.error("Cleanup failed", e),
  );

  // Initial Routing Logic
  const feedCount = await DB.getFeedCount();
  if (feedCount === 0) {
    State.currentFeedId = "discover";
  }

  // Initial Render (triggers components to fetch data)
  await refreshUI();

  // Background Network Sync
  if (feedCount > 0) {
    FeedService.syncFeeds(); // No callback needed, it emits events
  }
}

function registerSW() {
  if (
    "serviceWorker" in navigator &&
    (window.location.protocol === "https:" ||
      window.location.hostname === "localhost")
  ) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) =>
          console.log("SW registered: ", registration.scope),
        )
        .catch((err) => console.log("SW registration failed: ", err));
    });
  }
}

async function refreshUI() {
  // Use FeedService to get display-ready feeds (with colors)
  const feedsWithEffectiveColor = await FeedService.getFeedsForDisplay();

  // Collect unique tag names
  const uniqueTagNames = new Set();
  feedsWithEffectiveColor.forEach((f) => {
    if (f.tags) f.tags.forEach((t) => uniqueTagNames.add(t));
  });

  // Fetch only needed tags
  const tagMap = new Map();
  for (const tagName of uniqueTagNames) {
    const tag = await DB.getTag(tagName);
    if (tag) tagMap.set(tagName, tag);
  }

  // Create map for metadata (using resolved feeds)
  const feedMap = {};
  feedsWithEffectiveColor.forEach((f) => {
    const resolvedTags = (f.tags || [])
      .map((tagName) => tagMap.get(tagName))
      .filter(Boolean);
    feedMap[f.id] = { ...f, tags: resolvedTags };
  });

  // 1. Render Feed Sidebar
  FeedList.render(
    feedsWithEffectiveColor,
    State.currentFeedId,
    switchFeed,
    FeedModal.openEditFeedModal.bind(FeedModal),
    (feed) => StatsView.renderStatsModal(feed),
  );

  Sidebar.renderPrimaryItems();
  Sidebar.renderFeedItems();
  Sidebar.updateActiveState(State.currentFeedId);

  // 2. Render Navbar Actions (Plugin)
  Navbar.renderActions();

  // 3. Render Main Content (Discover vs Articles)
  const mainTitleEl = document.getElementById("page-title");
  const filterBar = document.getElementById("filter-bar");
  const filterToggleBtn = document.getElementById("btn-toggle-filters");
  const container = document.getElementById("article-list");

  // Reset container classes (centralized cleanup)
  if (container) {
    container.className = "";
  }

  if (State.currentFeedId === "discover") {
    // Discover View
    if (mainTitleEl) mainTitleEl.textContent = "Discover";

    // Hide Standard Filter UI
    if (filterBar) filterBar.style.display = "none";
    if (filterToggleBtn) filterToggleBtn.style.display = "none";

    DiscoverView.render(
      DiscoverData,
      feedsWithEffectiveColor,
      (feed) => FeedService.addFeedDirectly(feed),
      (pack) => DiscoverService.addDiscoverPack(pack, DiscoverData.feeds),
    );
  } else if (State.currentFeedId && State.currentFeedId.startsWith("custom:")) {
    // Custom View (managed by plugins)
    const viewId = State.currentFeedId.replace("custom:", "");
    const customViews = Registry.getExtensions("view:custom");
    const view = customViews.find((v) => v.id === viewId);

    if (view && typeof view.render === "function") {
      if (container) {
        container.innerHTML = "";

        // Update Title
        if (mainTitleEl) mainTitleEl.textContent = view.title || "Custom View";

        // Hide Standard Filter UI
        if (filterBar) filterBar.style.display = "none";
        if (filterToggleBtn) filterToggleBtn.style.display = "none";

        // Render
        view.render(container);
      }
    }
    return;
  } else {
    // Standard View
    if (filterBar) {
      filterBar.style.display = "";
    }
    if (filterToggleBtn) filterToggleBtn.style.display = "";

    let articles = await DB.getArticlesByFeed(State.currentFeedId);

    // Enrich articles
    let enrichedArticles = articles.map((a) => ({
      ...a,
      feedColor: feedMap[a.feedId]?.displayColor,
      feedTitle: feedMap[a.feedId]?.title || a.feedTitle,
      feedTags: feedMap[a.feedId]?.tags || [],
    }));

    // Apply Filters
    enrichedArticles = FilterBar.applyFilters(enrichedArticles);

    // Update header title
    if (mainTitleEl) {
      if (State.currentFeedId === "all")
        mainTitleEl.textContent = "All Articles";
      else {
        const f = feedMap[State.currentFeedId];
        if (f) mainTitleEl.textContent = f.title;
      }
    }

    ArticleList.render(
      enrichedArticles,
      (article) => ReaderView.openArticle(article),
      State.showArticleImages,
      (article) => handleDiscard(article),
      (article) => handleToggleFavorite(article),
    );

    FilterBar.updateUI();
  }
}

function handleDiscard(article) {
  const newState = !article.discarded;
  DB.setArticleDiscarded(article.guid, newState).then(() => {
    Events.emit(Events.ARTICLES_UPDATED);

    let msg, label, callback;

    if (newState) {
      // Was not discarded, now is Discarded
      msg = "Article discarded";
      label = "Undo";
      callback = () => {
        DB.setArticleDiscarded(article.guid, false).then(() => {
          Events.emit(Events.ARTICLES_UPDATED);
        });
      };
    } else {
      // Was discarded, now Restored
      msg = "Article restored";
    }

    if (msg) Utils.showToast(msg, label ? { label, callback } : null);
  });
}

function handleToggleFavorite(article) {
  DB.toggleFavorite(article.guid).then((newState) => {
    Events.emit(Events.ARTICLES_UPDATED);
    Utils.showToast(newState ? "Added to Favorites" : "Removed from Favorites");
  });
}

async function switchFeed(id) {
  Events.emit(Events.FEED_SELECTED, { id });
}

function setupEventListeners() {
  // Setup Component Listeners
  Modals.setupListeners();
  FilterBar.setupListeners();
  SettingsModal.setupListeners();
  ReaderView.setupListeners();
  FeedModal.setupListeners();
  Sidebar.setupListeners();

  // Global Event Handlers
  Events.on(Events.REFRESH_UI, () => refreshUI());
  Events.on(Events.SETTINGS_UPDATED, () => refreshUI());
  Events.on(Events.FEEDS_UPDATED, () => refreshUI());
  Events.on(Events.ARTICLES_UPDATED, () => refreshUI());
  Events.on(Events.FILTER_CHANGED, () => refreshUI());

  Events.on(Events.FEED_SELECTED, async (detail) => {
    if (detail.id) {
      State.currentFeedId = detail.id;
    }

    // Reset scroll position
    const list = document.getElementById("article-list");
    if (list) list.scrollTop = 0;

    await refreshUI();

    // Sidebar closing is handled in Sidebar.js
  });
}

export const App = {
  refreshUI,
  switchFeed,
  syncFeeds: FeedService.syncFeeds,
};

// Initialize
init();
