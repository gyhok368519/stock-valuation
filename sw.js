const CACHE_NAME = 'pb-calc-v62';
const ASSETS = [
  './PB_PE_ROE_calc.html',
  './manifest.json',
  './icon-512.jpg',
  './sw.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Handle SKIP_WAITING message from page
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', e => {
  var url = e.request.url;
  
  // Proxy emweb API: match same-origin path containing /emweb-proxy/
  if (url.indexOf('/emweb-proxy/') !== -1) {
    var proxyIdx = url.indexOf('/emweb-proxy/');
    var afterProxy = url.substring(proxyIdx + '/emweb-proxy/'.length);
    var queryIdx = afterProxy.indexOf('?');
    var pathPart = queryIdx >= 0 ? afterProxy.substring(0, queryIdx) : afterProxy;
    var queryPart = queryIdx >= 0 ? afterProxy.substring(queryIdx + 1) : '';
    var realUrl = 'https://emweb.securities.eastmoney.com/PC_HSF10/' + pathPart + '?' + queryPart;
    e.respondWith(
      fetch(realUrl, { mode: 'cors', credentials: 'omit' })
        .then(function(resp) {
          var headers = new Headers(resp.headers);
          headers.set('Access-Control-Allow-Origin', '*');
          headers.set('Content-Type', 'application/json; charset=utf-8');
          return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: headers });
        })
        .catch(function(err) {
          return new Response(JSON.stringify({error: err.message}), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        })
    );
    return;
  }

  // Update check requests: bypass all caches, force fresh from network
  if (url.indexOf('_update=') !== -1) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(function(response) {
          return response;
        })
        .catch(function() {
          return caches.match(e.request);
        })
    );
    return;
  }

  // db_data.json: cache-first strategy for fast load, background refresh
  // This ensures returning users see data instantly from cache while
  // the SW fetches the latest version in the background
  if (url.indexOf('db_data.json') !== -1) {
    e.respondWith(
      caches.match(e.request).then(function(cachedResponse) {
        // Always try to fetch fresh copy in background
        var fetchPromise = fetch(e.request, { cache: 'no-store' })
          .then(function(response) {
            if (response.ok) {
              var clone = response.clone();
              caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
            }
            return response;
          })
          .catch(function() {
            // Network failed, will use cache below
          });

        if (cachedResponse) {
          // Return cache immediately, background fetch updates cache for next visit
          return cachedResponse;
        }
        // No cache: must wait for network
        return fetchPromise.then(function(response) {
          return response;
        }).catch(function() {
          return new Response(JSON.stringify({error: 'network error'}), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // Network-first, cache-fallback strategy
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
