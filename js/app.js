(function () {
  // Import from global namespace
  const {
    DB,
    Service,
    UI,
    Utils,
    Config,
    State,
    Theme,
    Tools,
    Tags,
    Reader,
    Feeds,
  } = window.Freed;

  // --- Initialization ---
  async function init() {
    Theme.init();
    State.load();

    // Clear ghost history state on reload
    if (history.state && history.state.readingView) {
      history.replaceState(null, "", location.pathname + location.search);
    }

    registerSW();
    setupEventListeners();
    Tools.setupSelectionTools();
    UI.setupGlobalTooltip();
    Tags.setupTagColorPopup();
    Tags.setupTagInputs(() => refreshUI()); // Pass callback for filter updates

    await DB.openDB();

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

    // Initial Render
    await refreshUI();

    // Background Network Sync
    syncFeeds();
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

    // Create map for metadata
    const feedMap = {};
    feeds.forEach((f) => {
      const resolvedTags = (f.tags || [])
        .map((tagName) => tagMap.get(tagName))
        .filter(Boolean);
      feedMap[f.id] = { ...f, tags: resolvedTags };
    });

    let articles = await DB.getArticlesByFeed(State.currentFeedId);

    // Enrich articles
    let enrichedArticles = articles.map((a) => ({
      ...a,
      feedColor: feedMap[a.feedId]?.color,
      feedTitle: feedMap[a.feedId]?.title || a.feedTitle,
      feedTags: feedMap[a.feedId]?.tags || [],
    }));

    // Apply Filters
    enrichedArticles = applyFilters(enrichedArticles);

    UI.renderFeedList(
      feeds,
      State.currentFeedId,
      switchFeed,
      Feeds.openEditFeedModal.bind(Feeds),
    );

    // Update header title
    const titleEl = document.getElementById("page-title");
    if (titleEl) {
      if (State.currentFeedId === "all") titleEl.textContent = "All Articles";
      else {
        const f = feeds.find((x) => x.id === State.currentFeedId);
        if (f) titleEl.textContent = f.title;
      }
    }

    UI.renderArticles(
      enrichedArticles,
      (article) => Reader.openArticle(article, refreshUI),
      State.showArticleImages,
      (article) => handleDiscard(article),
      (article) => handleToggleFavorite(article),
    );
    updateFilterUI();
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
      Utils.showToast(
        newState ? "Added to Favorites" : "Removed from Favorites",
      );
    });
  }

  function applyFilters(articles) {
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

        if (filters.status === "unread" && a.read) return false;
        if (filters.status === "read" && !a.read) return false;
        if (filters.status === "favorites" && !a.favorite) return false;
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
  }

  function updateFilterUI() {
    const statusSelect = document.getElementById("filter-status");
    const dateSelect = document.getElementById("filter-date");
    const searchInput = document.getElementById("filter-search");
    const clearBtn = document.getElementById("btn-clear-filters");

    if (statusSelect) statusSelect.value = State.filters.status;
    if (dateSelect) dateSelect.value = State.filters.date;
    if (searchInput) searchInput.value = State.filters.search;

    renderFilterTags();

    if (clearBtn) {
      if (
        State.filters.status !== "all" ||
        State.filters.date !== "all" ||
        (State.filters.tags && State.filters.tags.length > 0) ||
        State.filters.search
      ) {
        clearBtn.style.display = "block";
      } else {
        clearBtn.style.display = "none";
      }
    }
  }

  async function renderFilterTags() {
    const container = document.getElementById("filter-active-tags");
    container.innerHTML = "";

    const allTags = await DB.getAllTags();
    const tagMap = new Map(allTags.map((t) => [t.name, t.color]));

    State.filters.tags.forEach((tagName) => {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      const color = tagMap.get(tagName) || "var(--primary)";
      pill.style.backgroundColor = color;
      pill.style.color = "#fff";

      pill.innerHTML = `${tagName} <span class="remove-tag" style="margin-left:4px;cursor:pointer;">&times;</span>`;

      pill.querySelector(".remove-tag").onclick = () => {
        State.filters.tags = State.filters.tags.filter((t) => t !== tagName);
        State.saveFilters();
        refreshUI();
      };
      container.appendChild(pill);
    });
  }

  async function switchFeed(id) {
    State.currentFeedId = id;
    await refreshUI();
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (sidebar && window.innerWidth <= 768) {
      sidebar.classList.remove("open");
      backdrop?.classList.remove("open");
    }
  }

  async function syncFeeds() {
    const feeds = await DB.getAllFeeds();
    const contentRetentionDays = parseInt(
      localStorage.getItem("cleanup_content_days") ||
        Config.DEFAULTS.CLEANUP_CONTENT_DAYS,
    );

    // Process sequentially to manage network load
    for (const feed of feeds) {
      const result = await Service.fetchAndParseFeed(feed);
      if (result.articles && result.articles.length > 0) {
        if (result.parsingRule) {
          feed.parsingRule = result.parsingRule;
          feed.type = "web";
          await DB.saveFeed(feed);
        }
        await DB.saveArticles(result.articles);

        // Trigger Autofetch if enabled for this feed
        // We pass the fresh list of articles we just fetched/parsed
        // We also pass a callback to refresh UI on individual article fetch for reactivity
        Service.processAutofetch(
          feed,
          result.articles,
          contentRetentionDays,
          () => {
            // Only refresh if we are viewing the relevant feed or all
            if (
              State.currentFeedId === feed.id ||
              State.currentFeedId === "all"
            ) {
              refreshUI();
            }
          },
        );
      }
    }
    await refreshUI();
    Utils.showToast("Feeds updated");
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

    window.closeModal = () => Reader.closeModal();

    window.addEventListener("popstate", (event) => {
      const modal = document.getElementById("read-modal");
      if (
        modal &&
        modal.classList.contains("open") &&
        (!event.state || !event.state.readingView)
      ) {
        modal.classList.remove("open");
        document.body.classList.remove("modal-open");
        State.currentArticleGuid = null;
      }
    });

    window.closeFeedModal = () => {
      const wasEditing = Feeds.isEditing;
      document.getElementById("feed-modal")?.classList.remove("open");
      Feeds.isEditing = false;

      if (wasEditing) {
        Feeds.saveCurrentEdit();
      }
    };

    window.closeSettingsModal = () =>
      document.getElementById("settings-modal")?.classList.remove("open");

    document.getElementById("read-modal")?.addEventListener("click", (e) => {
      if (e.target === document.getElementById("read-modal"))
        Reader.closeModal();
    });
    document.getElementById("feed-modal")?.addEventListener("click", (e) => {
      if (e.target === document.getElementById("feed-modal"))
        window.closeFeedModal();
    });
    document
      .getElementById("settings-modal")
      ?.addEventListener("click", (e) => {
        if (e.target === document.getElementById("settings-modal"))
          window.closeSettingsModal();
      });

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

    document.getElementById("btn-settings")?.addEventListener("click", () => {
      document.getElementById("settings-modal")?.classList.add("open");
      const keyInput = document.getElementById("settings-api-key");
      if (keyInput)
        keyInput.value = localStorage.getItem("freed_api_key") || "";

      const langInput = document.getElementById("settings-language");
      if (langInput)
        langInput.value = localStorage.getItem("freed_target_lang") || "en";

      const themeInput = document.getElementById("settings-theme");
      if (themeInput)
        themeInput.value = localStorage.getItem("freed_theme") || "system";

      const fontInput = document.getElementById("settings-font");
      if (fontInput)
        fontInput.value = localStorage.getItem("freed_font") || "system";

      const imagesInput = document.getElementById("settings-show-images");
      if (imagesInput) imagesInput.checked = State.showArticleImages;

      document.getElementById("settings-cleanup-unread").value =
        localStorage.getItem("cleanup_unread_days") ||
        Config.DEFAULTS.CLEANUP_UNREAD_DAYS;
      document.getElementById("settings-cleanup-content").value =
        localStorage.getItem("cleanup_content_days") ||
        Config.DEFAULTS.CLEANUP_CONTENT_DAYS;
      document.getElementById("settings-cleanup-read").value =
        localStorage.getItem("cleanup_read_days") ||
        Config.DEFAULTS.CLEANUP_READ_DAYS;
    });

    document
      .getElementById("btn-save-settings")
      ?.addEventListener("click", () => {
        localStorage.setItem(
          "freed_api_key",
          document.getElementById("settings-api-key").value.trim(),
        );
        localStorage.setItem(
          "freed_target_lang",
          document.getElementById("settings-language").value,
        );

        const theme = document.getElementById("settings-theme").value;
        localStorage.setItem("freed_theme", theme);
        Theme.apply(theme);

        const font = document.getElementById("settings-font").value;
        localStorage.setItem("freed_font", font);
        Theme.applyFont(font);

        const showImages = document.getElementById(
          "settings-show-images",
        ).checked;
        localStorage.setItem("freed_show_images", showImages);
        State.showArticleImages = showImages;

        localStorage.setItem(
          "cleanup_unread_days",
          document.getElementById("settings-cleanup-unread").value,
        );
        localStorage.setItem(
          "cleanup_content_days",
          document.getElementById("settings-cleanup-content").value,
        );
        localStorage.setItem(
          "cleanup_read_days",
          document.getElementById("settings-cleanup-read").value,
        );

        Utils.showToast("Settings saved");
        window.closeSettingsModal();
        refreshUI();
      });

    document.getElementById("filter-search")?.addEventListener("input", (e) => {
      State.filters.search = e.target.value;
      State.saveFilters();
      refreshUI();
    });

    document
      .getElementById("filter-status")
      ?.addEventListener("change", (e) => {
        State.filters.status = e.target.value;
        State.saveFilters();
        refreshUI();
      });

    document.getElementById("filter-date")?.addEventListener("change", (e) => {
      State.filters.date = e.target.value;
      State.saveFilters();
      refreshUI();
    });

    document
      .getElementById("btn-clear-filters")
      ?.addEventListener("click", () => {
        State.filters.status = "all";
        State.filters.date = "all";
        State.filters.tags = [];
        State.filters.search = "";
        State.saveFilters();
        refreshUI();
      });
  }

  // Expose App Controller
  window.Freed.App = {
    refreshUI,
    switchFeed,
    syncFeeds,
  };

  init();
})();
