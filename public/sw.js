/**
 * OpenSCAD Web Customizer Forge - Service Worker
 * Provides offline functionality and caching for PWA
 * Version: 3.1.0
 */

const CACHE_VERSION = 'v3.1.0';
const CACHE_NAME = `openscad-forge-${CACHE_VERSION}`;

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  // Note: Built assets will be discovered and cached on first load
];

// Cache strategies by resource type
const CACHE_STRATEGIES = {
  // App shell: cache-first (fast, offline-capable)
  appShell: ['/', '/index.html'],
  
  // Static assets: cache-first (CSS, JS, fonts)
  static: [/\.css$/, /\.js$/, /\.woff2?$/, /\.ttf$/],
  
  // Examples: cache-first (they don't change often)
  examples: [/\/examples\//],
  
  // WASM: cache-first with network fallback (large, rarely changes)
  wasm: [/\/wasm\//],
  
  // Images/icons: cache-first
  images: [/\.png$/, /\.jpg$/, /\.svg$/, /\.ico$/],
};

/**
 * Install event - precache essential assets
 */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precaching app shell');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      // Force activate immediately
      return self.skipWaiting();
    })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('openscad-forge-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[Service Worker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

/**
 * Fetch event - handle requests with appropriate caching strategy
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip cross-origin requests (except for same-origin with different protocol)
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // Determine caching strategy
  const strategy = getCacheStrategy(url.pathname);
  
  event.respondWith(
    strategy === 'cache-first'
      ? cacheFirst(request)
      : networkFirst(request)
  );
});

/**
 * Determine cache strategy based on URL
 */
function getCacheStrategy(pathname) {
  // App shell
  if (CACHE_STRATEGIES.appShell.some((pattern) => pathname === pattern || pathname.match(pattern))) {
    return 'cache-first';
  }
  
  // Static assets
  if (CACHE_STRATEGIES.static.some((pattern) => pathname.match(pattern))) {
    return 'cache-first';
  }
  
  // Examples
  if (CACHE_STRATEGIES.examples.some((pattern) => pathname.match(pattern))) {
    return 'cache-first';
  }
  
  // WASM files
  if (CACHE_STRATEGIES.wasm.some((pattern) => pathname.match(pattern))) {
    return 'cache-first';
  }
  
  // Images
  if (CACHE_STRATEGIES.images.some((pattern) => pathname.match(pattern))) {
    return 'cache-first';
  }
  
  // Default: network-first
  return 'network-first';
}

/**
 * Cache-first strategy: Try cache, fall back to network
 * Best for: Static assets, WASM files, examples
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    // Return cached response immediately
    return cached;
  }
  
  try {
    // Not in cache, fetch from network
    const response = await fetch(request);
    
    // Cache successful responses
    if (response && response.status === 200) {
      // Clone the response (can only be consumed once)
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    
    return response;
  } catch (error) {
    console.error('[Service Worker] Fetch failed:', error);
    
    // If offline and not in cache, return offline page
    if (request.mode === 'navigate') {
      const offlineResponse = await cache.match('/');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    
    throw error;
  }
}

/**
 * Network-first strategy: Try network, fall back to cache
 * Best for: API calls, dynamic content
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Try network first
    const response = await fetch(request);
    
    // Cache successful responses
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    
    return response;
  } catch (error) {
    console.error('[Service Worker] Network failed, trying cache:', error);
    
    // Fall back to cache
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    
    throw error;
  }
}

/**
 * Message handler for cache management
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        return self.clients.matchAll();
      }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'CACHE_CLEARED' });
        });
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

/**
 * Background sync for queued operations (future enhancement)
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-presets') {
    // Future: sync presets to cloud
    console.log('[Service Worker] Background sync:', event.tag);
  }
});

/**
 * Periodic background sync (future enhancement)
 */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-updates') {
    // Future: check for library updates
    console.log('[Service Worker] Periodic sync:', event.tag);
  }
});

console.log('[Service Worker] Loaded version:', CACHE_VERSION);
