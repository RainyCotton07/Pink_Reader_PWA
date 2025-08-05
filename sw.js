// Pink Reader PWA - Service Worker

const CACHE_NAME = 'pink-reader-v1';
const RUNTIME_CACHE = 'pink-reader-runtime';

// Core files to cache for offline functionality
const CORE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/media-manager.js',
  './js/pdf-viewer.js',
  './js/image-viewer.js',
  './js/video-player.js',
  './js/utils.js',
  './icons/app_icon.png',
  './icons/icon-32x32.png',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png'
];

// External dependencies to cache
const EXTERNAL_DEPS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

/**
 * Service Worker Install Event
 * Pre-cache core application files
 */
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      try {
        // Cache core files
        await cache.addAll(CORE_FILES);
        console.log('Core files cached successfully');
        
        // Cache external dependencies (with error handling)
        for (const url of EXTERNAL_DEPS) {
          try {
            await cache.add(url);
            console.log(`Cached external dependency: ${url}`);
          } catch (error) {
            console.warn(`Failed to cache external dependency: ${url}`, error);
          }
        }
        
        // Skip waiting to activate immediately
        self.skipWaiting();
      } catch (error) {
        console.error('Failed to cache core files:', error);
      }
    })()
  );
});

/**
 * Service Worker Activate Event
 * Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(name => 
        name.startsWith('pink-reader-') && name !== CACHE_NAME && name !== RUNTIME_CACHE
      );
      
      await Promise.all(
        oldCaches.map(cacheName => {
          console.log(`Deleting old cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
      
      // Take control of all pages
      self.clients.claim();
      
      console.log('Service Worker activated successfully');
    })()
  );
});

/**
 * Service Worker Fetch Event
 * Implement caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-HTTP requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip requests for browser extensions
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return;
  }
  
  event.respondWith(handleFetch(request));
});

/**
 * Handle fetch requests with appropriate caching strategy
 */
async function handleFetch(request) {
  const url = new URL(request.url);
  
  try {
    // Strategy 1: Core app files - Cache First
    if (isCoreFile(request)) {
      return await cacheFirst(request);
    }
    
    // Strategy 2: External CDN resources - Stale While Revalidate
    if (isExternalDependency(request)) {
      return await staleWhileRevalidate(request);
    }
    
    // Strategy 3: Images and media - Cache First with fallback
    if (isImageOrMedia(request)) {
      return await cacheFirst(request);
    }
    
    // Strategy 4: API and dynamic content - Network First
    if (isDynamicContent(request)) {
      return await networkFirst(request);
    }
    
    // Default: Network First for everything else
    return await networkFirst(request);
    
  } catch (error) {
    console.error('Fetch handler error:', error);
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match('./index.html');
    }
    
    // Return empty response for other failed requests
    return new Response('', { status: 408, statusText: 'Request Timeout' });
  }
}

/**
 * Cache First strategy
 * Check cache first, fallback to network
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('Network request failed:', request.url, error);
    throw error;
  }
}

/**
 * Network First strategy
 * Try network first, fallback to cache
 */
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok && request.method === 'GET') {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('Network request failed, checking cache:', request.url);
    
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

/**
 * Stale While Revalidate strategy
 * Return cached version immediately, update cache in background
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Background fetch to update cache
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(error => {
    console.warn('Background fetch failed:', request.url, error);
  });
  
  // Return cached version immediately, or wait for network
  return cachedResponse || fetchPromise;
}

/**
 * Check if request is for a core app file
 */
function isCoreFile(request) {
  const url = new URL(request.url);
  
  // Same origin requests for core files
  if (url.origin === self.location.origin) {
    const pathname = url.pathname;
    return CORE_FILES.some(file => {
      const normalizedFile = file.replace('./', '/');
      return pathname === normalizedFile || pathname === file;
    });
  }
  
  return false;
}

/**
 * Check if request is for external dependencies
 */
function isExternalDependency(request) {
  const url = request.url;
  return EXTERNAL_DEPS.some(dep => url.includes(dep) || url.startsWith(dep));
}

/**
 * Check if request is for images or media
 */
function isImageOrMedia(request) {
  const url = new URL(request.url);
  const extension = url.pathname.split('.').pop().toLowerCase();
  
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const mediaExtensions = ['mp4', 'webm', 'ogg', 'avi', 'mov'];
  
  return imageExtensions.includes(extension) || mediaExtensions.includes(extension);
}

/**
 * Check if request is for dynamic content
 */
function isDynamicContent(request) {
  const url = new URL(request.url);
  
  // API endpoints
  if (url.pathname.startsWith('/api/')) {
    return true;
  }
  
  // External APIs
  if (url.origin !== self.location.origin) {
    return true;
  }
  
  // Dynamic routes
  const dynamicPatterns = ['/user/', '/admin/', '/dashboard/'];
  return dynamicPatterns.some(pattern => url.pathname.includes(pattern));
}

/**
 * Background Sync for offline actions
 */
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'file-upload') {
    event.waitUntil(handleFileUploadSync());
  }
});

/**
 * Handle file upload sync
 */
async function handleFileUploadSync() {
  try {
    // This would sync any pending file uploads when back online
    console.log('Processing background file upload sync');
    
    // Get pending uploads from IndexedDB
    // Process each upload
    // Clean up completed uploads
    
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

/**
 * Push notification handler
 */
self.addEventListener('push', (event) => {
  console.log('Push message received');
  
  const options = {
    body: 'Pink Reader has new updates available!',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png',
    tag: 'pink-reader-update',
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Pink Reader', options)
  );
});

/**
 * Notification click handler
 */
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    // Open the app
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // If app is already open, focus it
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
    );
  }
});

/**
 * Message handler for communication with main app
 */
self.addEventListener('message', (event) => {
  console.log('Service Worker received message:', event.data);
  
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_NAME });
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ success: true });
      }).catch(error => {
        event.ports[0].postMessage({ success: false, error: error.message });
      });
      break;
      
    case 'CACHE_FILE':
      if (payload && payload.url) {
        cacheFile(payload.url).then(() => {
          event.ports[0].postMessage({ success: true });
        }).catch(error => {
          event.ports[0].postMessage({ success: false, error: error.message });
        });
      }
      break;
  }
});

/**
 * Clear all caches
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
  console.log('All caches cleared');
}

/**
 * Cache a specific file
 */
async function cacheFile(url) {
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.add(url);
  console.log(`File cached: ${url}`);
}

/**
 * Periodic background sync (if supported)
 */
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    console.log('Periodic sync triggered:', event.tag);
    
    if (event.tag === 'content-sync') {
      event.waitUntil(performPeriodicSync());
    }
  });
}

/**
 * Perform periodic background tasks
 */
async function performPeriodicSync() {
  try {
    console.log('Performing periodic background sync');
    
    // Check for app updates
    // Sync user preferences
    // Clean up old data
    // Optimize caches
    
  } catch (error) {
    console.error('Periodic sync failed:', error);
  }
}

// Log service worker startup
console.log('Pink Reader Service Worker loaded');
console.log('Cache version:', CACHE_NAME);
console.log('Core files to cache:', CORE_FILES.length);
console.log('External dependencies:', EXTERNAL_DEPS.length);