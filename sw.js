const APP_VERSION = "1.3.6";
const CACHE_NAME = `freed-v${APP_VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./core/main.css",
  "./core/layout.css",
  "./components/buttons.css",
  "./components/forms.css",
  "./components/modals.css",
  "./components/sidebar.css",
  "./components/navbar.css",
  "./components/filter-bar.css",
  "./features/reader/article-list.css",
  "./features/reader/reader-view.css",
  "./features/discover/discover-view.css",
  "./features/settings/settings-modal.css",
  "./features/tags/tags.css",
  "./components/toast.css",
  "./features/tools/tools.css",
  "./manifest.json",
  // Core
  "./core/app.js",
  "./features/ai/ai-service.js",
  "./core/config.js",
  "./core/data-service.js",
  "./core/db.js",
  "./core/events.js",
  "./core/state.js",
  "./core/utils.js",
  // Components
  "./components/filter-bar.js",
  "./components/modals.js",
  "./components/navbar.js",
  "./components/sidebar.js",
  // Features
  "./features/discover/discover-data.js",
  "./features/discover/discover-view.js",
  "./features/feeds/feed-list.js",
  "./features/feeds/feed-modal.js",
  "./features/feeds/feed-service.js",
  "./features/feeds/rss-service.js",
  "./features/reader/article-list.js",
  "./features/reader/reader-service.js",
  "./features/reader/reader-view.js",
  "./features/settings/settings-modal.js",
  "./features/settings/theme.js",
  "./features/tags/tags.js",
  "./features/tools/tools.js",
  "./features/plugin-system/interface.js",
  "./features/plugin-system/manager.js",
  "./features/plugin-system/registry.js",
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
