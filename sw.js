const CACHE_NAME = "freed-v34";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./js/config.js",
  "./js/state.js",
  "./js/utils.js",
  "./js/db.js",
  "./js/theme.js",
  "./js/ai-service.js",
  "./js/rss-service.js",
  "./js/ui-renderer.js",
  "./js/tools.js",
  "./js/tags.js",
  "./js/reader.js",
  "./js/feeds.js",
  "./js/app.js",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
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
      return response || fetch(e.request);
    }),
  );
});
