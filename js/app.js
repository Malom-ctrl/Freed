import { DB } from "./db.js";
import { UI } from "./ui-renderer.js";
import { Utils } from "./utils.js";
import { Config } from "./config.js";
import { State } from "./state.js";
import { Theme } from "./theme.js";
import { Tools } from "./tools.js";
import { Tags } from "./tags.js";
import { Reader } from "./reader.js";
import { Feeds } from "./feeds.js";
import { DiscoverData } from "./discover-data.js";
import { Manager as PluginManager } from "./plugin-system/manager.js";
import { FilterBar } from "./components/FilterBar.js";
import { SettingsModal } from "./components/SettingsModal.js";

// Runtime cache for computed icon colors (not saved to DB)
const iconColorCache = new Map();
const processingColorIds = new Set();

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
  UI.setupGlobalTooltip();
  Tags.setupTagColorPopup();
  Tags.setupTagInputs(() => refreshUI());

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
  const allFeeds = await DB.getAllFeeds();
  if (allFeeds.length === 0) {
    State.currentFeedId = "discover";
  }

  // Initial Render
  await refreshUI();

  // Background Network Sync
  if (allFeeds.length > 0) {
    Feeds.syncFeeds(refreshUI);
  }
  window.addEventListener("freed:refresh-ui", () => refreshUI());
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
  const feeds = await DB.getAllFeeds();
  const allTags = await DB.getAllTags();
  const tagMap = new Map(allTags.map((t) => [t.name, t]));

  // Prepare Feeds with Effective Display Color
  const feedsWithEffectiveColor = feeds.map((f) => {
    let displayColor = f.color;

    // Priority 1: Manual Color Override (Persistent)
    if (displayColor) {
      return { ...f, displayColor };
    }

    // Priority 2: Icon Color (Runtime Calculated - Non-Persistent)
    if (f.iconData) {
      if (iconColorCache.has(f.id)) {
        return { ...f, displayColor: iconColorCache.get(f.id) };
      }

      // If not in cache and not processing, trigger calculation
      if (!processingColorIds.has(f.id)) {
        processingColorIds.add(f.id);
        // Compute in background
        Utils.getDominantColor(f.iconData).then((color) => {
          if (color) {
            iconColorCache.set(f.id, color);
            // Trigger UI update once color is ready
            refreshUI();
          }
          processingColorIds.delete(f.id);
        });
      }
      // While loading, fall through to default
    }

    // Priority 3: Global Default Color (Fixed)
    return { ...f, displayColor: "#64748b" };
  });

  // Create map for metadata (using resolved feeds)
  const feedMap = {};
  feedsWithEffectiveColor.forEach((f) => {
    const resolvedTags = (f.tags || [])
      .map((tagName) => tagMap.get(tagName))
      .filter(Boolean);
    feedMap[f.id] = { ...f, tags: resolvedTags };
  });

  // 1. Render Feed Sidebar
  UI.renderFeedList(
    feedsWithEffectiveColor,
    State.currentFeedId,
    switchFeed,
    Feeds.openEditFeedModal.bind(Feeds),
    (feed) => UI.renderStatsModal(feed),
  );

  // 2. Render Main Content (Discover vs Articles)
  const mainTitleEl = document.getElementById("page-title");
  const filterBar = document.getElementById("filter-bar");
  const filterToggleBtn = document.getElementById("btn-toggle-filters");

  // Render Navbar Actions (Plugin)
  UI.renderNavbarActions();

  if (State.currentFeedId === "discover") {
    // Discover View
    if (mainTitleEl) mainTitleEl.textContent = "Discover";

    // Hide Standard Filter UI
    if (filterBar) filterBar.style.display = "none";
    if (filterToggleBtn) filterToggleBtn.style.display = "none";

    UI.renderDiscoverView(
      DiscoverData,
      feeds,
      (feed) => Feeds.addFeedDirectly(feed, () => refreshUI()),
      (pack) =>
        Feeds.addDiscoverPack(pack, DiscoverData.feeds, () => refreshUI()),
    );
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
        const f = feeds.find((x) => x.id === State.currentFeedId);
        if (f) mainTitleEl.textContent = f.title;
      }
    }

    UI.renderArticles(
      enrichedArticles,
      (article) => Reader.openArticle(article, refreshUI),
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
    refreshUI();

    let msg, label, callback;

    if (newState) {
      // Was not discarded, now is Discarded
      msg = "Article discarded";
      label = "Undo";
      callback = () => {
        DB.setArticleDiscarded(article.guid, false).then(() => refreshUI());
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
    refreshUI();
    Utils.showToast(newState ? "Added to Favorites" : "Removed from Favorites");
  });
}

async function switchFeed(id) {
  State.currentFeedId = id;

  // Reset scroll position
  const list = document.getElementById("article-list");
  if (list) list.scrollTop = 0;

  await refreshUI();
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (sidebar && window.innerWidth <= 768) {
    sidebar.classList.remove("open");
    backdrop?.classList.remove("open");
  }
}

function setupEventListeners() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");

  const toggleMenu = () => {
    sidebar?.classList.toggle("open");
    backdrop?.classList.toggle("open");
  };

  document.getElementById("menu-btn")?.addEventListener("click", toggleMenu);
  backdrop?.addEventListener("click", toggleMenu);

  document
    .querySelector('[data-id="all"]')
    ?.addEventListener("click", () => switchFeed("all"));
  document
    .querySelector('[data-id="discover"]')
    ?.addEventListener("click", () => switchFeed("discover"));

  window.closeModal = () => Reader.closeModal();

  window.addEventListener("popstate", (event) => {
    const modal = document.getElementById("read-modal");
    if (
      modal &&
      modal.classList.contains("open") &&
      (!event.state || !event.state.readingView)
    ) {
      UI.toggleModal("read-modal", false);
      document.body.classList.remove("modal-open");
      State.currentArticleGuid = null;
      refreshUI();
    }
  });

  window.closeFeedModal = () => {
    const wasEditing = Feeds.isEditing;
    UI.toggleModal("feed-modal", false);
    Feeds.isEditing = false;

    if (wasEditing) {
      Feeds.saveCurrentEdit();
    }
  };

  window.closeSettingsModal = () => UI.toggleModal("settings-modal", false);
  window.closeStatsModal = () => UI.toggleModal("stats-modal", false);

  let mouseDownTarget = null;
  document.addEventListener("mousedown", (e) => {
    mouseDownTarget = e.target;
  });

  const bindBackdropClose = (modalId, closeFn) => {
    const el = document.getElementById(modalId);
    if (!el) return;
    el.addEventListener("click", (e) => {
      // Only close if interaction started AND ended on the backdrop
      if (e.target === el && mouseDownTarget === el) {
        closeFn();
      }
    });
  };

  bindBackdropClose("read-modal", () => Reader.closeModal());
  bindBackdropClose("feed-modal", () => window.closeFeedModal());
  bindBackdropClose("settings-modal", () => window.closeSettingsModal());
  bindBackdropClose("stats-modal", () => window.closeStatsModal());

  document
    .getElementById("btn-new-feed")
    ?.addEventListener("click", Feeds.openAddFeedModal.bind(Feeds));

  document.getElementById("btn-save-feed")?.addEventListener("click", () => {
    Feeds.handleSaveFeed((id, isNew) => {
      refreshUI();
      if (isNew) switchFeed(id);
    });
  });

  const originalDelete = Feeds.handleDeleteFeed;
  Feeds.handleDeleteFeed = (id) => {
    originalDelete.call(Feeds, id, (deletedId) => {
      if (State.currentFeedId === deletedId) switchFeed("all");
      else refreshUI();
    });
  };

  document
    .getElementById("btn-toggle-favorite")
    ?.addEventListener("click", () =>
      Reader.toggleCurrentFavorite(() => refreshUI()),
    );
  document
    .getElementById("btn-share-article")
    ?.addEventListener("click", () => Reader.shareCurrentArticle());

  // Setup Component Listeners
  FilterBar.setupListeners(refreshUI);
  SettingsModal.setupListeners(refreshUI);
}

export const App = {
  refreshUI,
  switchFeed,
  syncFeeds: Feeds.syncFeeds,
};

// Initialize
init();
