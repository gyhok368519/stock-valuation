const CACHE_NAME = 'pb-calc-v206';
const ASSETS = [
  './PB_PE_ROE_calc.html',
  './roe.html',
  './mine.html',
  './stock_index.json',
  './manifest.json',
  './icon-512.jpg',
  './sw.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(function() {
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(function() {
      return self.clients.claim();
    })
  );
});

// Handle SKIP_WAITING message from page
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// === Stale-While-Revalidate helper ===
// Return cached response immediately (if available), fetch fresh copy in background for next visit.
// If no cache, wait for network. Network failure falls back to ANY cache across all cache stores.
function swr(request) {
  return caches.match(request).then(function(cached) {
    var fetchPromise = fetch(request, { cache: 'no-store' }).then(function(response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
      }
      return response;
    }).catch(function(err) {
      console.warn('[SW] SWR background refresh failed:', request.url, err && err.message);
    });

    if (cached) return cached; // SWR: instant cache, background refresh
    return fetchPromise.catch(function() {
      // Network failed & no exact cache match: search ALL caches for a fallback
      return caches.keys().then(function(cacheNames) {
        var matchNext = function(i) {
          if (i >= cacheNames.length) {
            return new Response('network error', { status: 502, headers: { 'Content-Type': 'text/plain' } });
          }
          return caches.open(cacheNames[i]).then(function(cache) {
            return cache.match(request);
          }).then(function(resp) {
            if (resp) return resp;
            return matchNext(i + 1);
          }).catch(function() {
            return matchNext(i + 1);
          });
        };
        return matchNext(0);
      });
    });
  });
}

// Allowed emweb proxy paths (whitelist)
var EMWEB_ALLOWED = ['BonusFinancing/PageAjax', 'CompanySurvey/PageAjax', 'ShareholderResearch/PageAjax'];

self.addEventListener('fetch', e => {
  var url = e.request.url;

  // Proxy emweb API: only same-origin + whitelisted paths + GET only
  if (url.indexOf('/emweb-proxy/') !== -1 && new URL(url).origin === self.location.origin) {
    if (e.request.method !== 'GET') return;
    var proxyIdx = url.indexOf('/emweb-proxy/');
    var afterProxy = url.substring(proxyIdx + '/emweb-proxy/'.length);
    var queryIdx = afterProxy.indexOf('?');
    var pathPart = queryIdx >= 0 ? afterProxy.substring(0, queryIdx) : afterProxy;
    // Whitelist check
    var allowed = false;
    for (var i = 0; i < EMWEB_ALLOWED.length; i++) {
      if (pathPart === EMWEB_ALLOWED[i]) { allowed = true; break; }
    }
    if (!allowed) return;
    var queryPart = queryIdx >= 0 ? afterProxy.substring(queryIdx + 1) : '';
    var realUrl = 'https://emweb.securities.eastmoney.com/PC_HSF10/' + pathPart + '?' + queryPart;
    e.respondWith(
      fetch(realUrl, { mode: 'cors', credentials: 'omit' })
        .then(function(resp) {
          // Only copy safe headers, not upstream sensitive ones
          var headers = new Headers();
          headers.set('Content-Type', 'application/json; charset=utf-8');
          headers.set('Access-Control-Allow-Origin', self.location.origin);
          return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: headers });
        })
        .catch(function(err) {
          return new Response(JSON.stringify({error: err.message}), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': self.location.origin }
          });
        })
    );
    return;
  }

  // Update check requests: bypass all caches, force fresh from network
  if (url.indexOf('_update=') !== -1) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(function() {
          return new Response('{"error":"network_unavailable"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // db_data.json: network-first (always try fresh data from GitHub, fallback to cache)
  if (url.indexOf('db_data.json') !== -1) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(e.request).then(function(cached) {
          return cached || new Response('{}', { status: 502, headers: { 'Content-Type': 'application/json' } });
        });
      })
    );
    return;
  }

  // Skip cross-origin requests entirely — let browser handle them directly
  // (prevents SW from blocking mine.html/roe.html API calls on mobile WebView)
  if (new URL(url).origin !== self.location.origin) return;

  // Skip navigation requests for HTML pages — let browser handle them directly
  // (prevents SW from intercepting page loads like roe.html/mine.html on mobile WebView
  // where SW is unstable and may return 502 "network error" instead of loading the page)
  if (e.request.mode === 'navigate') return;

  // Stale-While-Revalidate for same-origin static assets
  // - PB_PE_ROE_calc.html, sw.js, manifest.json, stock_index.json → SWR
  e.respondWith(swr(e.request));
});
