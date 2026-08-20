// アプリシェル（静的アセット）のキャッシュを担当。
// 試合データ・順位表データのキャッシュは js/db.js の IndexedDB 側で行う。
const CACHE_NAME = 'mlb-watch-shell-v9';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/db.js',
  './js/home.js',
  './js/trivia.js',
  './js/rules.js',
  './js/notifications.js',
  './js/standings.js',
  './js/team-sheet.js',
  './js/team-search.js',
  './js/player-search.js',
  './js/player-sheet.js',
  './js/game-sheet.js',
  './js/today-stats.js',
  './js/alerts.js',
  './js/kana.js',
  './js/sheet-stack.js',
  './js/teams.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 同一オリジンの静的アセットのみ SW でキャッシュ制御する。
  // MLB Stats API（statsapi.mlb.com）へのリクエストはそのままネットワークへ通す。
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// Web Push通知の受信（送信元は scripts/send-notifications.mjs、毎日18時JSTのダイジェスト）
self.addEventListener('push', (event) => {
  let data = { title: 'MLB Watch', body: '新着情報があります。' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  const options = {
    body: data.body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: data.url || './index.html' },
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.registration.scope));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
