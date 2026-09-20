const CACHE_NAME = "sixfl-static-v2";
const CORE_ASSETS = [
  "/icon.png",
  "/apple-icon.png",
  "/favicon-192.png",
  "/favicon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("sixfl-static-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isSafeStaticRequest(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (request.mode === "navigate") return false;
  if (url.pathname.startsWith("/api/")) return false;

  return (
    url.pathname.startsWith("/_next/static/") ||
    CORE_ASSETS.includes(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isSafeStaticRequest(event.request, url)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (!response || !response.ok || response.type !== "basic") {
          return response;
        }

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    }),
  );
});


const PUSH_DB_NAME = "sixfl-pwa";
const PUSH_DB_VERSION = 1;
const PUSH_STORE_NAME = "push";
const PUSH_TOKEN_KEY = "deviceToken";

function openPushDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_DB_NAME, PUSH_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PUSH_STORE_NAME)) {
        db.createObjectStore(PUSH_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setPushDeviceToken(token) {
  const db = await openPushDb();

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(PUSH_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PUSH_STORE_NAME);

    if (token) {
      store.put(token, PUSH_TOKEN_KEY);
    } else {
      store.delete(PUSH_TOKEN_KEY);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

async function getPushDeviceToken() {
  const db = await openPushDb();

  const token = await new Promise((resolve, reject) => {
    const transaction = db.transaction(PUSH_STORE_NAME, "readonly");
    const request = transaction.objectStore(PUSH_STORE_NAME).get(PUSH_TOKEN_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return token;
}

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "SIXFL_PUSH_DEVICE_TOKEN") {
    event.waitUntil(setPushDeviceToken(data.token || null));
  }

  if (data.type === "SIXFL_CLEAR_PUSH_DEVICE_TOKEN") {
    event.waitUntil(setPushDeviceToken(null));
  }
});

async function fetchPendingPushNotification() {
  const token = await getPushDeviceToken();
  if (!token) return null;

  const response = await fetch("/api/push/pending", {
    cache: "no-store",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  return payload?.notification || null;
}

async function isMatchingChatAlreadyVisible(url) {
  const destination = new URL(url, self.location.origin);
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  return windows.some((client) => {
    try {
      const current = new URL(client.url);
      return (
        client.visibilityState === "visible" &&
        current.origin === destination.origin &&
        current.pathname === destination.pathname
      );
    } catch {
      return false;
    }
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const notification = await fetchPendingPushNotification();
      if (!notification) return;

      if (await isMatchingChatAlreadyVisible(notification.url)) {
        return;
      }

      await self.registration.showNotification(notification.title || "SIXFL", {
        body: notification.body || "",
        icon: "/favicon-192.png",
        badge: "/favicon-192.png",
        tag: notification.tag || "sixfl",
        renotify: false,
        timestamp: notification.timestamp || Date.now(),
        data: {
          url: notification.url || "/dashboard?app=1",
        },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification?.data?.url || "/dashboard?app=1",
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        if ("navigate" in client && new URL(client.url).origin === self.location.origin) {
          await client.navigate(targetUrl);
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })(),
  );
});
