const CACHE = 'petite-lecture-v7';
const FILES = [
  './', './index.html', './styles.css', './app.js', './i18n/ui.js',
  './books/sample-book/chapter-1.js', './reader.html', './reader-release.js', './reader-narration-player.js', './books/le-petit-prince/loader.js', './books/le-petit-prince/reader-view.js', './books/le-petit-prince/reader.css', './manifest.webmanifest', './icons/icon.svg', './voice-picker.js', './reading-enhancements.js', './mobile.css'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.headers.has('range') || /\.mp3$/i.test(new URL(event.request.url).pathname)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
