

window.Freed = window.Freed || {};

(function() {
    const { DB_NAME, DB_VERSION, DEFAULT_FEEDS } = window.Freed.Config;
    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                const tx = e.target.transaction;

                if (!db.objectStoreNames.contains('feeds')) {
                    db.createObjectStore('feeds', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('articles')) {
                    const articleStore = db.createObjectStore('articles', { keyPath: 'guid' });
                    articleStore.createIndex('feedId', 'feedId', { unique: false });
                    articleStore.createIndex('pubDate', 'pubDate', { unique: false });
                }
                if (!db.objectStoreNames.contains('tags')) {
                    db.createObjectStore('tags', { keyPath: 'name' });
                }
            };

            request.onsuccess = (e) => {
                const db = e.target.result;
                
                // Seed defaults if empty
                const tx = db.transaction(['feeds', 'tags'], 'readwrite');
                const feedStore = tx.objectStore('feeds');
                const tagStore = tx.objectStore('tags');
                
                const countReq = feedStore.count();
                countReq.onsuccess = () => {
                    if (countReq.result === 0) {
                        DEFAULT_FEEDS.forEach(feed => {
                            const tags = feed.tags || [];
                            feedStore.add(feed);
                            tags.forEach(tagName => {
                                // Default random color for seeded tags if not exists
                                tagStore.get(tagName).onsuccess = (ev) => {
                                    if (!ev.target.result) {
                                        tagStore.put({ name: tagName, color: window.Freed.Utils.getRandomFromPalette() });
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

    async function getAllFeeds() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('feeds', 'readonly');
            const store = tx.objectStore('feeds');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function getAllTags() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('tags', 'readonly');
            const store = tx.objectStore('tags');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result); // Returns array of {name, color}
            request.onerror = () => reject(request.error);
        });
    }

    async function saveTag(tag) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('tags', 'readwrite');
            const store = tx.objectStore('tags');
            // tag: {name, color}
            const request = store.put(tag);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function saveFeed(feed) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('feeds', 'readwrite');
            const store = tx.objectStore('feeds');
            const request = store.put(feed);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteFeed(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['feeds', 'articles'], 'readwrite');
            
            // Delete Feed
            const feedStore = tx.objectStore('feeds');
            feedStore.delete(id);
            
            // Delete associated Articles
            const articleStore = tx.objectStore('articles');
            const index = articleStore.index('feedId');
            const keyReq = index.getAllKeys(id);
            
            keyReq.onsuccess = () => {
                const keys = keyReq.result;
                keys.forEach(key => articleStore.delete(key));
            };
            
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function cleanupOrphanedTags() {
        const db = await openDB();
        
        // 1. Get all feeds to find used tags
        const feeds = await new Promise((resolve) => {
            const tx = db.transaction('feeds', 'readonly');
            tx.objectStore('feeds').getAll().onsuccess = (e) => resolve(e.target.result);
        });

        const usedTags = new Set();
        feeds.forEach(feed => {
            if (feed.tags && Array.isArray(feed.tags)) {
                feed.tags.forEach(t => usedTags.add(t));
            }
        });

        // 2. Get all tags and delete unused
        return new Promise((resolve, reject) => {
            const tx = db.transaction('tags', 'readwrite');
            const store = tx.objectStore('tags');
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
            const tx = db.transaction('articles', 'readwrite');
            const store = tx.objectStore('articles');
            
            articles.forEach(article => {
                const getReq = store.get(article.guid);
                
                getReq.onsuccess = () => {
                    const existing = getReq.result;
                    // Merge existing data
                    const finalArticle = existing ? { ...existing, ...article } : { ...article };

                    if (existing) {
                        if (!article.isDateFromFeed) finalArticle.pubDate = existing.pubDate;
                        if (existing.fullContent && article.fullContent === undefined) finalArticle.fullContent = existing.fullContent;
                        if (existing.read && article.read === undefined) finalArticle.read = true;
                        if (existing.favorite && article.favorite === undefined) finalArticle.favorite = true;
                    }
                    delete finalArticle.isDateFromFeed;
                    store.put(finalArticle);
                };
            });
            
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function markArticleRead(guid) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('articles', 'readwrite');
            const store = tx.objectStore('articles');
            const request = store.get(guid);

            request.onsuccess = () => {
                const article = request.result;
                if (article) {
                    article.read = true;
                    store.put(article);
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function toggleFavorite(guid) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('articles', 'readwrite');
            const store = tx.objectStore('articles');
            const request = store.get(guid);

            request.onsuccess = () => {
                const article = request.result;
                if (article) {
                    article.favorite = !article.favorite;
                    store.put(article);
                    resolve(article.favorite);
                } else {
                    resolve(false);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function getArticlesByFeed(feedId) {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction('articles', 'readonly');
            const store = tx.objectStore('articles');
            
            if (feedId === 'all') {
                 const request = store.getAll();
                 request.onsuccess = () => resolve(request.result.sort((a,b) => new Date(b.pubDate) - new Date(a.pubDate)));
            } else {
                const index = store.index('feedId');
                const request = index.getAll(feedId);
                request.onsuccess = () => resolve(request.result.sort((a,b) => new Date(b.pubDate) - new Date(a.pubDate)));
            }
        });
    }

    async function getArticle(guid) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('articles', 'readonly');
            const store = tx.objectStore('articles');
            const request = store.get(guid);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function performCleanup(settings) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('articles', 'readwrite');
            const store = tx.objectStore('articles');
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
                    else if (article.read && ageInDays > settings.readDays) cursor.delete();
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
        getArticle,
        markArticleRead,
        toggleFavorite,
        performCleanup
    };
})();