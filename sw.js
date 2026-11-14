/* sw.js — v6.0.0
 * 缓存名由 version.json 单一真源派生（构建时同步）；无后端、无凭证。
 * 策略：
 *  - install：逐资源容忍式预缓存（单个失败不阻断整体）
 *  - version.json / *_update=：仅网络（失败返回 503，不做缓存兜底）
 *  - db_data.json / db_meta.json / stock_index.json：网络优先，缓存兜底
 *  - 同源其余请求（含页面导航）：SWR（缓存秒开 + 后台刷新）
 *  - /dj-proxy/、/emweb-proxy/：白名单 CORS 代理（同源路径 → 东财/蛋卷），失败返回 502 JSON
 *  - activate：清理旧缓存；不自动 skipWaiting（由页面消息触发，避免新旧资源混用）
 */
var VER = '6.0.1';
var CACHE = 'pb-calc-v' + VER;
var ASSETS = [
  './', './index.html',
  './PB_PE_ROE_calc.html',
  './roe.html', './mine.html', './moat.html', './risk.html', './macro.html',
  './lockup.html', './trend.html', './rotation.html', './schiller.html',
  './assets/js/common.js', './assets/css/common.css',
  './stock_index.json', './db_meta.json', './version.json',
  './manifest.json', './icon-512.jpg'
];
var NETWORK_FIRST = ['./db_data.json', './db_meta.json', './stock_index.json'];
var SWR_MAX_ENTRIES = 400; // SWR 缓存条目上限，防止无限增长

self.addEventListener('install', function (event) {
  // 逐个缓存，单个失败仅记录，不阻断安装；不自动 skipWaiting（由页面 SKIP_WAITING 消息触发）
  event.waitUntil(
    Promise.all(ASSETS.map(function (url) {
      return caches.open(CACHE).then(function (c) {
        return c.add(new Request(url, { cache: 'no-store' }));
      }).catch(function (e) {
        console.warn('[sw] precache fail:', url, e && e.message);
      });
    }))
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isNWFirst(url) {
  // 兼容 GitHub Pages 子路径部署（/stock-valuation/...），用后缀匹配
  return NETWORK_FIRST.some(function (p) { return url.pathname.indexOf(p) === url.pathname.length - p.length; });
}

/* 白名单代理：仅允许既有数据路径，避免变成开放代理 */
var EMWEB_PATHS = ['BonusFinancing/PageAjax', 'CompanySurvey/PageAjax', 'ShareholderResearch/PageAjax'];
var DJ_PATHS = ['index_eva/dj'];

function proxyResponse(externalUrl) {
  return fetch(externalUrl, { cache: 'no-store' }).then(function (r) {
    return r.text().then(function (text) {
      return new Response(text, {
        status: r.status,
        headers: {
          'Content-Type': r.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    });
  }).catch(function (err) {
    return new Response(JSON.stringify({ error: 'proxy_failed', message: String(err && err.message || err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  });
}

function handleProxy(url) {
  var path = url.pathname;
  if (path.indexOf('/emweb-proxy/') >= 0) {
    var rest = path.substring(path.indexOf('/emweb-proxy/') + '/emweb-proxy/'.length);
    var ok = EMWEB_PATHS.some(function (p) { return rest.indexOf(p) === 0; });
    if (!ok) return Promise.resolve(new Response(JSON.stringify({ error: 'path_not_allowed' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    return proxyResponse('https://emweb.securities.eastmoney.com/PC_HSF10/' + rest + url.search);
  }
  if (path.indexOf('/dj-proxy/') >= 0) {
    var restDj = path.substring(path.indexOf('/dj-proxy/') + '/dj-proxy/'.length);
    var okDj = DJ_PATHS.some(function (p) { return restDj.indexOf(p) === 0; });
    if (!okDj) return Promise.resolve(new Response(JSON.stringify({ error: 'path_not_allowed' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    return proxyResponse('https://danjuanfunds.com/djapi/' + restDj + url.search);
  }
  return null;
}

/* SWR 缓存写入 + 容量上限 */
function swrPut(cache, request, response) {
  return cache.put(request, response.clone()).then(function () {
    return cache.keys().then(function (keys) {
      if (keys.length > SWR_MAX_ENTRIES) {
        // 淘汰最早的 (keys.length - SWR_MAX_ENTRIES) 条
        var extra = keys.length - SWR_MAX_ENTRIES;
        var toDelete = keys.slice(0, extra);
        return Promise.all(toDelete.map(function (k) { return cache.delete(k); }));
      }
    });
  }).catch(function () { /* 缓存写失败不影响响应 */ });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = null;
  try { url = new URL(req.url); } catch (e) { return; }

  // 跨域请求交给浏览器
  if (url.origin !== self.location.origin) return;

  // Android APK 本地拦截路径：交给原生层
  if (url.pathname.indexOf('lockup-radar') >= 0) return;

  // 白名单代理
  var proxied = handleProxy(url);
  if (proxied) { event.respondWith(proxied); return; }

  // version.json / _update=：仅网络（更新探测必须拿到最新）
  var pn = url.pathname;
  if ((pn.length >= 13 && pn.indexOf('version.json') === pn.length - 13) || url.search.indexOf('_update=') >= 0) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(function () {
        return new Response(JSON.stringify({ error: 'network_unavailable' }), {
          status: 503, headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 数据类文件：网络优先，缓存兜底
  if (isNWFirst(url)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(function (r) {
        if (r.ok) {
          caches.open(CACHE).then(function (c) { swrPut(c, req, r); });
        }
        return r.clone();
      }).catch(function () {
        return caches.match(req,{ignoreSearch:true}).then(function (c) {
          return c || new Response('{}', { status: 502, headers: { 'Content-Type': 'application/json' } });
        });
      })
    );
    return;
  }

  // 同源其余（含导航）：SWR
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var fetching = fetch(req, { cache: 'no-store' }).then(function (r) {
          if (r && r.ok) swrPut(cache, req, r);
          return r;
        }).catch(function () { return undefined; });
        if (cached) {
          fetching.catch(function () { /* 后台刷新失败：保留旧缓存 */ });
          event.waitUntil(fetching);
          return cached;
        }
        return fetching.then(function (r) {
          if (r) return r.clone();
          // 终极兜底：遍历所有缓存
          return caches.match(req,{ignoreSearch:true}).then(function (c2) {
            return c2 || new Response('network error', { status: 502, headers: { 'Content-Type': 'text/plain' } });
          });
        });
      });
    })
  );
});
