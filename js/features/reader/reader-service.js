import { DB } from "../../core/db.js";
import { Service } from "../feeds/rss-service.js";
import { Utils } from "../../core/utils.js";
import { State } from "../../core/state.js";
import { Events } from "../../core/events.js";

export const ReaderService = {
  _currentMaxProgress: 0,
  _isLoadingContent: false,
  _contentFetchFailed: false,
  _restoreProgress: 0,

  // Pure logic: Calculate progress based on numbers
  calculateProgress: function (
    scrollTop,
    scrollHeight,
    clientHeight,
    threshold = 20,
  ) {
    if (!State.currentArticleGuid) return 0;

    // Prevent premature read status if waiting for content or if content fetch failed
    if (this._isLoadingContent || this._contentFetchFailed) return 0;

    if (scrollHeight <= clientHeight) {
      // Only mark as read if content exists and is not loading
      if (scrollHeight > 0 && this._currentMaxProgress < 1) {
        this._currentMaxProgress = 1;
        DB.updateReadingProgress(State.currentArticleGuid, 1, true).then(() => {
          Events.emit(Events.ARTICLE_READ, { guid: State.currentArticleGuid });
          Events.emit(Events.ARTICLES_UPDATED);
        });
        return 1;
      }
      return this._currentMaxProgress;
    }

    let progress = scrollTop / (scrollHeight - clientHeight);

    // End detection: allow threshold buffer for bottom reached
    if (scrollTop + clientHeight >= scrollHeight - threshold) {
      progress = 1;
    }

    progress = Math.min(1, Math.max(0, progress));

    // Monotonic check: only update if progress increased
    if (progress > this._currentMaxProgress) {
      this._currentMaxProgress = progress;
      const isRead = progress > 0.95;
      DB.updateReadingProgress(
        State.currentArticleGuid,
        progress,
        isRead ? true : undefined,
      ).then(() => {
        if (isRead) {
          Events.emit(Events.ARTICLE_READ, { guid: State.currentArticleGuid });
        }
        // We might not want to emit ARTICLES_UPDATED on every scroll tick,
        // but maybe on significant progress or read completion.
        // For now, let's stick to read completion or pause.
      });
    }

    return progress;
  },

  resetState: function (article) {
    this._currentMaxProgress = article.readingProgress || 0;
    this._isLoadingContent = false;
    this._contentFetchFailed = !!article.contentFetchFailed;
    this._restoreProgress = 0;

    if (article.readingProgress > 0 && !article.read && !article.favorite) {
      this._restoreProgress = article.readingProgress;
    }
  },

  getRestoreProgress: function () {
    return this._restoreProgress;
  },

  clearRestoreProgress: function () {
    this._restoreProgress = 0;
  },

  setLoadingContent: function (isLoading) {
    this._isLoadingContent = isLoading;
  },

  setContentFetchFailed: function (failed) {
    this._contentFetchFailed = failed;
  },

  toggleFavorite: async function (guid) {
    if (!guid) return false;
    const newState = await DB.toggleFavorite(guid);
    Events.emit(Events.ARTICLE_FAVORITED, { guid, favorite: newState });
    Events.emit(Events.ARTICLES_UPDATED);
    return newState;
  },

  fetchFullArticle: async function (link) {
    return await Service.fetchFullArticle(link);
  },

  saveArticle: async function (article) {
    const res = await DB.saveArticles([article]);
    Events.emit(Events.ARTICLES_UPDATED);
    return res;
  },

  updateFeedReadStats: async function (feedId, diff) {
    return await DB.updateFeedReadStats(feedId, diff);
  },

  addCAD: async function (articleGuid, cadData) {
    const article = await DB.getArticle(articleGuid);
    if (!article) return;

    if (!article.cads) article.cads = [];
    // Generate ID if missing
    if (!cadData.id) cadData.id = Utils.generateId();

    article.cads.push(cadData);
    await this.saveArticle(article);
    return cadData;
  },

  removeCAD: async function (articleGuid, cadId) {
    const article = await DB.getArticle(articleGuid);
    if (!article || !article.cads) return;

    article.cads = article.cads.filter((c) => c.id !== cadId);
    await this.saveArticle(article);
  },
};
