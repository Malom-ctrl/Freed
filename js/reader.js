window.Freed = window.Freed || {};

window.Freed.Reader = {
  openArticle: async function (articleInput, onRefreshNeeded) {
    const { DB, Service, Tools, Utils, State } = window.Freed;
    State.currentArticleGuid = articleInput.guid;

    const modal = document.getElementById("read-modal");
    if (!modal) return;

    let article = articleInput;
    try {
      const freshData = await DB.getArticle(articleInput.guid);
      if (freshData) {
        article = { ...articleInput, ...freshData };
      }
    } catch (e) {
      console.warn("Failed to fetch fresh article data", e);
    }

    history.pushState(
      { readingView: true, articleGuid: article.guid },
      "",
      "#article",
    );

    if (!article.read) {
      await DB.markArticleRead(article.guid);
      article.read = true;
      // Trigger refresh to update list visual state
      if (onRefreshNeeded) setTimeout(() => onRefreshNeeded(), 500);
    }

    this.updateFavoriteButtonState(article.favorite);
    const scrollContainer = modal.querySelector(".reader-scroll-container");
    if (scrollContainer) scrollContainer.scrollTop = 0;

    const heroEl = document.getElementById("reader-hero");
    const titleEl = document.getElementById("reader-title");
    const feedTitleEl = document.getElementById("reader-feed-title");
    const dateEl = document.getElementById("reader-date");
    const contentEl = document.getElementById("reader-content");
    const linkEl = document.getElementById("btn-visit-website");

    if (heroEl) {
      if (article.image) {
        heroEl.style.backgroundImage = `url('${article.image}')`;
        heroEl.style.display = "block";
      } else {
        heroEl.style.display = "none";
      }
    }

    if (titleEl) titleEl.textContent = article.title;
    if (feedTitleEl) feedTitleEl.textContent = article.feedTitle;

    if (dateEl) {
      try {
        // Use relative time by default
        dateEl.textContent = Utils.formatRelativeTime(article.pubDate);
        // Add full date tooltip
        const fullDate = new Date(article.pubDate).toLocaleDateString(
          undefined,
          {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          },
        );
        dateEl.setAttribute("data-tooltip", fullDate);
        dateEl.style.cursor = "help";
      } catch (e) {
        dateEl.textContent = article.pubDate;
      }
    }

    if (contentEl) {
      contentEl.setAttribute("data-guid", article.guid);

      if (article.fullContent) {
        contentEl.innerHTML = article.fullContent;
      } else {
        const baseContent =
          article.content || article.description || `<p>${article.snippet}</p>`;
        const loadingHtml = `<div class="full-content-loader">Fetching full article content...</div>`;
        contentEl.innerHTML = loadingHtml + baseContent;

        Service.fetchFullArticle(article.link).then((fullHtml) => {
          const currentGuid = contentEl.getAttribute("data-guid");
          if (currentGuid !== article.guid) return;

          if (fullHtml) {
            // Calculate word count diff
            const oldText = article.content || article.snippet || "";
            const oldWc = Utils.countWords(oldText);

            const newWc = Utils.countWords(Utils.divToText(fullHtml));
            const diff = newWc - oldWc;

            article.fullContent = fullHtml;

            // Ensure DB updates happen before refresh
            DB.saveArticles([article])
              .then(() => {
                if (diff !== 0 && article.feedId) {
                  return DB.updateFeedReadStats(article.feedId, diff);
                }
              })
              .then(() => {
                // Update list UI to show offline indicator and refresh stats
                if (onRefreshNeeded) onRefreshNeeded();
              });

            contentEl.innerHTML = fullHtml;
            Utils.showToast("Article optimized");
          } else {
            const loader = contentEl.querySelector(".full-content-loader");
            if (loader) {
              loader.innerHTML =
                "Unable to fetch full content.<br>Showing summary only.";
              loader.style.color = "var(--text-muted)";
            }
            Utils.showToast("Could not retrieve full content");
          }
        });
      }
    }

    if (linkEl) linkEl.href = article.link;
    modal.classList.add("open");
    document.body.classList.add("modal-open");
  },

  updateFavoriteButtonState: function (isFavorite) {
    const btn = document.getElementById("btn-toggle-favorite");
    const svg = btn.querySelector("svg");
    if (isFavorite) {
      btn.classList.add("active");
      svg.setAttribute("fill", "currentColor");
      svg.setAttribute("stroke", "none");
    } else {
      btn.classList.remove("active");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
    }
  },

  toggleCurrentFavorite: async function (onRefreshNeeded) {
    const { DB, Utils, State } = window.Freed;
    if (!State.currentArticleGuid) return;
    const newState = await DB.toggleFavorite(State.currentArticleGuid);
    this.updateFavoriteButtonState(newState);
    const msg = newState ? "Added to Favorites" : "Removed from Favorites";
    Utils.showToast(msg);
    if (onRefreshNeeded) onRefreshNeeded();
  },

  shareCurrentArticle: async function () {
    const { State, DB, Utils } = window.Freed;
    if (!State.currentArticleGuid) return;

    const article = await DB.getArticle(State.currentArticleGuid);
    if (!article) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.snippet || article.title,
          url: article.link,
        });
      } catch (err) {
        console.log("Share canceled or failed", err);
      }
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(article.link);
        Utils.showToast("Link copied to clipboard");
      } catch (err) {
        Utils.showToast("Failed to copy link");
      }
    }
  },

  closeModal: function () {
    if (history.state && history.state.readingView) history.back();
    else {
      document.getElementById("read-modal")?.classList.remove("open");
      document.body.classList.remove("modal-open");
      window.Freed.State.currentArticleGuid = null;
    }
  },
};
