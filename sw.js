const CACHE_NAME = 'pb-calc-v15';
const ASSETS = [
  './PB_PE_ROE_calc.html',
  './db_data.json',
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

self.addEventListener('fetch', e => {
  var url = e.request.url;
  
  // Proxy emweb API: match same-origin path containing /emweb-proxy/
  // e.g. https://gyhok368519.github.io/stock-valuation/emweb-proxy/BonusFinancing/PageAjax?code=SH600519
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
