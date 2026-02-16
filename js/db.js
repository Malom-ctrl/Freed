window.Freed = window.Freed || {};

(function () {
  const { DB_NAME, DB_VERSION, DEFAULT_FEEDS } = window.Freed.Config;
  const { countWords, divToText } = window.Freed.Utils;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        const tx = e.target.transaction;

        if (!db.objectStoreNames.contains("feeds")) {
          db.createObjectStore("feeds", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("articles")) {
          const articleStore = db.createObjectStore("articles", {
            keyPath: "guid",
          });
          articleStore.createIndex("feedId", "feedId", { unique: false });
          articleStore.createIndex("pubDate", "pubDate", { unique: false });
        }
        if (!db.objectStoreNames.contains("tags")) {
          db.createObjectStore("tags", { keyPath: "name" });
        }
      };

      request.onsuccess = (e) => {
        const db = e.target.result;

        // Seed defaults if empty
        const tx = db.transaction(["feeds", "tags"], "readwrite");
        const feedStore = tx.objectStore("feeds");
        const tagStore = tx.objectStore("tags");

        const countReq = feedStore.count();
        countReq.onsuccess = () => {
          if (countReq.result === 0) {
            DEFAULT_FEEDS.forEach((feed) => {
              const tags = feed.tags || [];
              feedStore.add(feed);
              tags.forEach((tagName) => {
                // Default random color for seeded tags if not exists
                tagStore.get(tagName).onsuccess = (ev) => {
                  if (!ev.target.result) {
                    tagStore.put({
                      name: tagName,
                      color: window.Freed.Utils.getRandomFromPalette(),
                    });
                  }
                };
              });
            });
          }
        };
        resolve(db);
      };

      request.onerror = (e) => reject(e);
    });
    return dbPromise;
  }

  // Helper to init stats object if missing
  function initStats(feed) {
    if (!feed.stats) {
      feed.stats = {
        totalFetched: 0,
        read: 0,
        discarded: 0,
        favorited: 0,
        wordCountRead: 0,
        wordCountTranslated: 0,
      };
    }
    return feed.stats;
  }

  async function getAllFeeds() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("feeds", "readonly");
      const store = tx.objectStore("feeds");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAllTags() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tags", "readonly");
      const store = tx.objectStore("tags");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result); // Returns array of {name, color}
      request.onerror = () => reject(request.error);
    });
  }

  async function saveTag(tag) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tags", "readwrite");
      const store = tx.objectStore("tags");
      // tag: {name, color}
      const request = store.put(tag);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function saveFeed(feed) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("feeds", "readwrite");
      const store = tx.objectStore("feeds");
      const request = store.put(feed);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteFeed(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["feeds", "articles"], "readwrite");

      // Delete Feed
      const feedStore = tx.objectStore("feeds");
      feedStore.delete(id);

      // Delete associated Articles
      const articleStore = tx.objectStore("articles");
      const index = articleStore.index("feedId");
      const keyReq = index.getAllKeys(id);

      keyReq.onsuccess = () => {
        const keys = keyReq.result;
        keys.forEach((key) => articleStore.delete(key));
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function cleanupOrphanedTags() {
    const db = await openDB();

    // 1. Get all feeds to find used tags
    const feeds = await new Promise((resolve) => {
      const tx = db.transaction("feeds", "readonly");
      tx.objectStore("feeds").getAll().onsuccess = (e) =>
        resolve(e.target.result);
    });

    const usedTags = new Set();
    feeds.forEach((feed) => {
      if (feed.tags && Array.isArray(feed.tags)) {
        feed.tags.forEach((t) => usedTags.add(t));
      }
    });

    // 2. Get all tags and delete unused
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tags", "readwrite");
      const store = tx.objectStore("tags");
      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const tagName = cursor.value.name;
          if (!usedTags.has(tagName)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveArticles(articles) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["articles", "feeds"], "readwrite");
      const articleStore = tx.objectStore("articles");
      const feedStore = tx.objectStore("feeds");

      // Track new articles per feed to update stats
      const newCounts = {}; // feedId -> count

      let processed = 0;

      // If no articles, resolve immediately
      if (articles.length === 0) {
        resolve();
        return;
      }

      articles.forEach((article) => {
        const getReq = articleStore.get(article.guid);

        getReq.onsuccess = () => {
          const existing = getReq.result;

          if (!existing) {
            // Count as new
            if (article.feedId) {
              newCounts[article.feedId] = (newCounts[article.feedId] || 0) + 1;
            }
          }

          // Merge existing data
          const finalArticle = existing
            ? { ...existing, ...article }
            : { ...article };

          if (existing) {
            if (!article.isDateFromFeed)
              finalArticle.pubDate = existing.pubDate;
            if (existing.fullContent && article.fullContent === undefined)
              finalArticle.fullContent = existing.fullContent;
            if (existing.read && article.read === undefined)
              finalArticle.read = true;
            if (existing.favorite && article.favorite === undefined)
              finalArticle.favorite = true;
            if (
              existing.discarded !== undefined &&
              article.discarded === undefined
            )
              finalArticle.discarded = existing.discarded;
            if (
              existing.readingProgress !== undefined &&
              article.readingProgress === undefined
            )
              finalArticle.readingProgress = existing.readingProgress;
          }
          delete finalArticle.isDateFromFeed;
          articleStore.put(finalArticle);

          processed++;
          checkComplete();
        };
      });

      function checkComplete() {
        if (processed === articles.length) {
          // Update stats for feeds
          const feedIds = Object.keys(newCounts);
          if (feedIds.length === 0) {
            resolve();
            return;
          }

          let feedsUpdated = 0;
          feedIds.forEach((fid) => {
            const freq = feedStore.get(fid);
            freq.onsuccess = () => {
              const feed = freq.result;
              if (feed) {
                initStats(feed);
                feed.stats.totalFetched += newCounts[fid];
                feedStore.put(feed);
              }
              feedsUpdated++;
              if (feedsUpdated === feedIds.length) resolve();
            };
            freq.onerror = () => {
              // ignore missing feed error, just continue
              feedsUpdated++;
              if (feedsUpdated === feedIds.length) resolve();
            };
          });
        }
      }

      tx.onerror = () => reject(tx.error);
    });
  }

  async function updateReadingProgress(guid, progress, isRead) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["articles", "feeds"], "readwrite");
      const articleStore = tx.objectStore("articles");
      const feedStore = tx.objectStore("feeds");

      const req = articleStore.get(guid);
      req.onsuccess = () => {
        const article = req.result;
        if (!article) {
          resolve();
          return;
        }

        const previousRead = !!article.read;
        const previousProgress = article.readingProgress || 0;

        let changed = false;

        // Update Progress if provided
        if (progress !== undefined && article.readingProgress !== progress) {
          article.readingProgress = progress;
          changed = true;
        }

        // If marking as read without progress, assume 100% completion
        if (
          isRead === true &&
          progress === undefined &&
          article.readingProgress < 1
        ) {
          article.readingProgress = 1;
          changed = true;
        }

        // Update Read Status if provided
        if (isRead !== undefined && article.read !== isRead) {
          article.read = isRead;
          changed = true;
        }

        if (!changed) {
          resolve();
          return;
        }

        // Update Feed Stats
        if (article.feedId) {
          const freq = feedStore.get(article.feedId);
          freq.onsuccess = () => {
            const feed = freq.result;
            if (feed) {
              initStats(feed);

              // 1. Update Word Count based on progress delta
              const currentProgress = article.readingProgress || 0;
              const delta = currentProgress - previousProgress;

              // Only add if positive progress is made
              if (delta > 0.001) {
                const text = article.fullContent
                  ? divToText(article.fullContent)
                  : article.content || article.snippet || "";
                const totalWords = countWords(text);
                const wordsToAdd = Math.round(totalWords * delta);
                feed.stats.wordCountRead =
                  (feed.stats.wordCountRead || 0) + wordsToAdd;
              }

              // 2. Update Read Count
              if (article.read !== previousRead) {
                if (article.read) feed.stats.read++;
                else feed.stats.read = Math.max(0, feed.stats.read - 1);
              }

              feedStore.put(feed);
            }
            articleStore.put(article);
            resolve();
          };
          freq.onerror = () => {
            // Fallback save article if feed fetch fails
            articleStore.put(article);
            resolve();
          };
        } else {
          articleStore.put(article);
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function setFavorite(guid, isFavorite) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["articles", "feeds"], "readwrite");
      const articleStore = tx.objectStore("articles");
      const feedStore = tx.objectStore("feeds");
      const request = articleStore.get(guid);

      request.onsuccess = () => {
        const article = request.result;
        if (article && article.favorite !== isFavorite) {
          article.favorite = isFavorite;
          articleStore.put(article);

          // Update Feed Stats
          if (article.feedId) {
            const freq = feedStore.get(article.feedId);
            freq.onsuccess = () => {
              const feed = freq.result;
              if (feed) {
                initStats(feed);
                if (isFavorite) feed.stats.favorited++;
                else
                  feed.stats.favorited = Math.max(0, feed.stats.favorited - 1);
                feedStore.put(feed);
              }
            };
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function setArticleDiscarded(guid, isDiscarded) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["articles", "feeds"], "readwrite");
      const articleStore = tx.objectStore("articles");
      const feedStore = tx.objectStore("feeds");
      const request = articleStore.get(guid);

      request.onsuccess = () => {
        const article = request.result;
        // Only update if value actually changes
        const currentVal = !!article.discarded;
        if (article && currentVal !== isDiscarded) {
          article.discarded = isDiscarded;
          articleStore.put(article);

          // Update Feed Stats
          if (article.feedId) {
            const freq = feedStore.get(article.feedId);
            freq.onsuccess = () => {
              const feed = freq.result;
              if (feed) {
                initStats(feed);
                if (isDiscarded) feed.stats.discarded++;
                else
                  feed.stats.discarded = Math.max(0, feed.stats.discarded - 1);
                feedStore.put(feed);
              }
            };
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function toggleFavorite(guid) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["articles", "feeds"], "readwrite");
      const articleStore = tx.objectStore("articles");
      const feedStore = tx.objectStore("feeds");
      const request = articleStore.get(guid);

      request.onsuccess = () => {
        const article = request.result;
        if (article) {
          const newState = !article.favorite;
          article.favorite = newState;
          articleStore.put(article);

          if (article.feedId) {
            const freq = feedStore.get(article.feedId);
            freq.onsuccess = () => {
              const feed = freq.result;
              if (feed) {
                initStats(feed);
                if (newState) feed.stats.favorited++;
                else
                  feed.stats.favorited = Math.max(0, feed.stats.favorited - 1);
                feedStore.put(feed);
              }
            };
          }
          resolve(newState);
        } else {
          resolve(false);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function updateTranslationStats(feedId, wordCount) {
    if (!feedId || !wordCount) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("feeds", "readwrite");
      const store = tx.objectStore("feeds");
      const request = store.get(feedId);

      request.onsuccess = () => {
        const feed = request.result;
        if (feed) {
          initStats(feed);
          feed.stats.wordCountTranslated += wordCount;
          store.put(feed);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function updateFeedReadStats(feedId, wordCountDelta) {
    if (!feedId || !wordCountDelta) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("feeds", "readwrite");
      const store = tx.objectStore("feeds");
      const request = store.get(feedId);

      request.onsuccess = () => {
        const feed = request.result;
        if (feed) {
          initStats(feed);
          feed.stats.wordCountRead += wordCountDelta;
          store.put(feed);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getArticlesByFeed(feedId) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("articles", "readonly");
      const store = tx.objectStore("articles");

      if (feedId === "all") {
        const request = store.getAll();
        request.onsuccess = () =>
          resolve(
            request.result.sort(
              (a, b) => new Date(b.pubDate) - new Date(a.pubDate),
            ),
          );
      } else {
        const index = store.index("feedId");
        const request = index.getAll(feedId);
        request.onsuccess = () =>
          resolve(
            request.result.sort(
              (a, b) => new Date(b.pubDate) - new Date(a.pubDate),
            ),
          );
      }
    });
  }

  async function getExportableArticles() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readonly");
      const store = tx.objectStore("articles");
      const request = store.openCursor();
      const results = [];

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const article = cursor.value;
          if (article.favorite) {
            results.push(article);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getArticle(guid) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readonly");
      const store = tx.objectStore("articles");
      const request = store.get(guid);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function performCleanup(settings) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");
      const request = store.openCursor();

      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const article = cursor.value;
          if (article.favorite) {
            cursor.continue();
            return;
          }
          const articleDate = new Date(article.pubDate);
          const ageInMs = now - articleDate.getTime();
          const ageInDays = ageInMs / msPerDay;

          if (!article.read && ageInDays > settings.unreadDays) cursor.delete();
          else if (article.read && ageInDays > settings.readDays)
            cursor.delete();
          else if (article.fullContent && ageInDays > settings.contentDays) {
            const updated = { ...article };
            delete updated.fullContent;
            cursor.update(updated);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  window.Freed.DB = {
    openDB,
    getAllFeeds,
    getAllTags,
    saveFeed,
    saveTag,
    deleteFeed,
    cleanupOrphanedTags,
    saveArticles,
    getArticlesByFeed,
    getExportableArticles,
    getArticle,
    updateReadingProgress,
    setFavorite,
    setArticleDiscarded,
    toggleFavorite,
    updateTranslationStats,
    updateFeedReadStats,
    performCleanup,
  };
})();
