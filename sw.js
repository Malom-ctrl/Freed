const APP_VERSION = "1.3.0";
const CACHE_NAME = `freed-v${APP_VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  // Core
  "./js/app.js",
  "./js/core/ai-service.js",
  "./js/core/config.js",
  "./js/core/data-service.js",
  "./js/core/db.js",
  "./js/core/events.js",
  "./js/core/state.js",
  "./js/core/utils.js",
  // Components
  "./js/components/filter-bar.js",
  "./js/components/modals.js",
  "./js/components/navbar.js",
  "./js/components/sidebar.js",
  // Features
  "./js/features/discover/discover-data.js",
  "./js/features/discover/discover-view.js",
  "./js/features/feeds/feed-list.js",
  "./js/features/feeds/feed-modal.js",
  "./js/features/feeds/feed-service.js",
  "./js/features/feeds/rss-service.js",
  "./js/features/reader/article-list.js",
  "./js/features/reader/reader-service.js",
  "./js/features/reader/reader-view.js",
  "./js/features/settings/settings-modal.js",
  "./js/features/settings/theme.js",
  "./js/features/tags/tags.js",
  "./js/features/tools/tools.js",
  // Plugin System
  "./js/plugin-system/interface.js",
  "./js/plugin-system/manager.js",
  "./js/plugin-system/registry.js",
  // Fonts
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&family=JetBrains+Mono:wght@400&display=swap",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) =>
            key !== CACHE_NAME ? caches.delete(key) : Promise.resolve(),
          ),
        ),
      ),
  );
  return self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(e.request).then((networkResponse) => {
        // Check if we received a valid response
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          networkResponse.type !== "basic"
        ) {
          return networkResponse;
        }

        // Clone the response
        const responseToCache = networkResponse.clone();

        if (e.request.url.match(/\.(js|css|png|jpg|jpeg|svg|json)$/)) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }

        return networkResponse;
      });
    }),
  );
});
