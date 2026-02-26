import { DB } from "../../core/db.js";
import { Service } from "../feeds/rss-service.js";
import { Utils } from "../../core/utils.js";
import { State } from "../../core/state.js";
import { Registry } from "../plugin-system/registry.js";
import DOMPurify from "dompurify";

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
        DB.updateReadingProgress(State.currentArticleGuid, 1);
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
      const isRead = progress >= 0.95; // Relaxed threshold for "read" status

      // If "read", force progress to 1
      const progressToSave = isRead ? 1 : progress;

      DB.updateReadingProgress(State.currentArticleGuid, progressToSave);
    }

    return progress;
  },

  resetState: function (article) {
    this._currentMaxProgress = article.readingProgress || 0;
    this._isLoadingContent = false;
    this._contentFetchFailed = !!article.contentFetchFailed;
    this._restoreProgress = 0;

    if (
      article.readingProgress > 0 &&
      article.readingProgress < 1 &&
      !article.favorite
    ) {
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
    return newState;
  },

  fetchFullArticle: async function (link) {
    return await Service.fetchFullArticle(link);
  },

  saveArticle: async function (article) {
    const res = await DB.saveArticles([article]);
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

    // Check for overlaps and merge if configured
    const renderers = Registry.getExtensions("cad:renderer");
    const rendererConfig = renderers.find((r) => r.type === cadData.type);
    const shouldMerge = rendererConfig?.shouldMerge || false;

    const overlapping = shouldMerge
      ? article.cads.filter((existing) => {
          if (existing.type !== cadData.type) return false;
          const existingEnd = existing.position + existing.length;
          const newEnd = cadData.position + cadData.length;

          // Check intersection
          return cadData.position < existingEnd && newEnd > existing.position;
        })
      : [];

    if (overlapping.length > 0) {
      // Merge logic
      let minPos = cadData.position;
      let maxEnd = cadData.position + cadData.length;

      overlapping.forEach((c) => {
        minPos = Math.min(minPos, c.position);
        maxEnd = Math.max(maxEnd, c.position + c.length);
      });

      // Update new CAD geometry
      cadData.position = minPos;
      cadData.length = maxEnd - minPos;

      if (article.fullContent) {
        const sourceHTML =
          article.fullContent || article.content || article.description || "";
        // We need the CLEAN source HTML that ReaderView uses.
        const cleanHTML = DOMPurify.sanitize(sourceHTML);
        cadData.originalContent = cleanHTML.substring(minPos, maxEnd);
      }

      // Apply custom merge strategy for data if defined
      if (
        rendererConfig.mergeStrategy &&
        typeof rendererConfig.mergeStrategy === "function"
      ) {
        cadData.data = await rendererConfig.mergeStrategy(overlapping, cadData);
      }

      // Remove overlapping from array
      const overlappingSet = new Set(overlapping);
      article.cads = article.cads.filter((c) => !overlappingSet.has(c));
    }

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
