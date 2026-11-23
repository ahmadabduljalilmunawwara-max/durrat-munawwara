/// <reference lib="es2022" />

interface PrecacheEntry {
  url: string;
  revision: string | null;
}

interface SWExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface SWFetchEvent extends Event {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

interface SWMessageEvent extends Event {
  data: { type?: string } | null;
}

interface SWGlobalScope {
  __WB_MANIFEST?: Array<PrecacheEntry | string>;
  location: Location;
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
  };
  addEventListener(type: 'install', listener: (event: SWExtendableEvent) => void): void;
  addEventListener(type: 'activate', listener: (event: SWExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: SWFetchEvent) => void): void;
  addEventListener(type: 'message', listener: (event: SWMessageEvent) => void): void;
}

const sw = self as unknown as SWGlobalScope;

const CACHE_NAME = 'dmtc-app-shell-v1';
const FONT_CACHE = 'dmtc-fonts-v1';
const OFFLINE_URL = '/offline.html';

const CORE_SHELL_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

const NEVER_CACHE_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com',
  'firebasestorage.googleapis.com',
  'accounts.google.com',
  'apis.google.com',
  'www.googleapis.com',
  'generativelanguage.googleapis.com',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const STATIC_ASSET_EXT_REGEX =
  /\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|webp|ico|webmanifest)$/i;

function isApiOrFirebaseRequest(url: URL): boolean {
  if (url.origin === sw.location.origin) {
    return url.pathname.startsWith('/api/');
  }
  if (NEVER_CACHE_HOSTS.includes(url.hostname)) return true;
  if (
    url.hostname.endsWith('.firebaseio.com') ||
    url.hostname.endsWith('.cloudfunctions.net') ||
    url.hostname.endsWith('.run.app')
  ) {
    return true;
  }
  return false;
}

function isDevViteAsset(url: URL): boolean {
  return (
    url.origin === sw.location.origin &&
    (url.pathname.startsWith('/@') ||
      url.pathname.startsWith('/src/') ||
      url.pathname.includes('node_modules/.vite'))
  );
}

sw.addEventListener('install', (event) => {
  const rawManifest = (self as unknown as { __WB_MANIFEST?: Array<PrecacheEntry | string> }).__WB_MANIFEST;
  const manifestEntries = Array.isArray(rawManifest) ? rawManifest : [];
  const manifestUrls = manifestEntries
    .map((entry) => (typeof entry === 'string' ? entry : entry.url))
    .filter((url) => url !== '/' && url !== '/index.html' && url !== 'index.html');

  const urlsToPrecache = Array.from(new Set([...CORE_SHELL_URLS, ...manifestUrls]));

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        urlsToPrecache.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch {
            // Ignore transient precache errors for individual non-critical assets
          }
        })
      );
    })
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key.startsWith('dmtc-') && key !== CACHE_NAME && key !== FONT_CACHE) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );
      await sw.clients.claim();
    })()
  );
});

sw.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void sw.skipWaiting();
  }
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never cache Firebase, Auth, Google APIs, or backend /api/* live data requests
  if (isApiOrFirebaseRequest(url)) return;

  // Navigation requests always go to network so app state/data checks stay live;
  // when offline, serve branded offline fallback page instead of failing silently.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedOffline = await caches.match(OFFLINE_URL);
        return (
          cachedOffline ||
          new Response('لا يوجد اتصال بالإنترنت', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      })
    );
    return;
  }

  // Skip Vite dev module transforms during development
  if (isDevViteAsset(url)) return;

  // Google Fonts: cache-first with background refresh
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          void fetch(request)
            .then((fresh) => {
              if (fresh && (fresh.ok || fresh.type === 'opaque')) {
                void cache.put(request, fresh.clone());
              }
            })
            .catch(() => {});
          return cached;
        }
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      })
    );
    return;
  }

  // Same-origin static UI assets (JS, CSS, local fonts, company logos, manifest)
  if (
    url.origin === sw.location.origin &&
    (STATIC_ASSET_EXT_REGEX.test(url.pathname) ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/images/'))
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          void fetch(request)
            .then((fresh) => {
              if (fresh && fresh.ok) {
                void cache.put(request, fresh.clone());
              }
            })
            .catch(() => {});
          return cached;
        }
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      })
    );
  }
});
