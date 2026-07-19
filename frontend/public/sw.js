const CACHE_NAME = 'caresync-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
];

// Install Event - cache core static resources
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - network first, falling back to cache
self.addEventListener('fetch', (e) => {
  // Only handle GET requests and local scope
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }

  e.respondWith(
    fetch(e.request).then((res) => {
      // Clone response to cache it
      const resClone = res.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(e.request, resClone);
      });
      return res;
    }).catch(() => {
      return caches.match(e.request);
    })
  );
});

// Push Event - Receive background notifications
self.addEventListener('push', (e) => {
  let data = {
    title: 'CareSync Notification',
    body: 'You have a new update from CareSync.',
    icon: '/icon.svg',
    url: '/'
  };

  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data.body = e.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon.svg',
    badge: '/icon.svg',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event - Open page on click
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const clickActionUrl = e.notification.data.url;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      // If a tab is already open, focus it
      const matchingClient = clientsArr.find((c) => {
        return c.url.startsWith(self.location.origin);
      });

      if (matchingClient) {
        matchingClient.navigate(clickActionUrl);
        return matchingClient.focus();
      } else {
        // Otherwise, open a new window/tab
        return self.clients.openWindow(clickActionUrl);
      }
    })
  );
});
