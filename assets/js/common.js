/* common.js — v6.0.0 公共层
 * 职责：全局错误钩子+诊断日志、safeJSON、fetch 网关（超时/重试）、收藏本地导出/导入、
 *       escapeHTML。不自动改动页面行为（除错误钩子），页面按需调用 PBC.*。
 * 设计约束：无框架、无外部依赖、ES5 兼容（Android WebView 4.4+ 可运行）。
 */
(function () {
  'use strict';
  var VER = '6.0.0';
  var PBC = window.PBC = window.PBC || {};
  PBC.version = VER;

  /* ---------- escapeHTML ---------- */
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  PBC.esc = esc;

  /* ---------- safeJSON（localStorage 容错读写） ---------- */
  function getJSON(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function setJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { diag('storage write failed: ' + key + ' ' + (e && e.message || e), 'warn'); return false; }
  }
  PBC.getJSON = getJSON;
  PBC.setJSON = setJSON;

  /* ---------- 诊断日志（环形缓冲 50 条，localStorage 持久化） ---------- */
  var DIAG_KEY = '_pb_diag_log';
  function diag(msg, level) {
    try {
      var arr = getJSON(DIAG_KEY, []);
      arr.unshift({ t: new Date().toISOString(), level: level || 'info', msg: String(msg).substring(0, 300) });
      if (arr.length > 50) arr.length = 50;
      setJSON(DIAG_KEY, arr);
    } catch (e) { /* 忽略 */ }
  }
  PBC.diag = diag;

  /* 全局错误钩子：线上白屏/异常可经"诊断日志"回查 */
  window.addEventListener('error', function (e) {
    diag((e.message || 'error') + ' @' + (e.filename || '').split('/').pop() + ':' + (e.lineno || 0), 'error');
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    diag('unhandledrejection: ' + ((r && r.message) || r), 'error');
  });

  /* 诊断日志查看器（由各页面"诊断日志"菜单项调用） */
  function fmtDiagTime(iso) {
    // 紧凑显示：MM-DD HH:mm:ss（完整 ISO 在手机上会溢出只剩尾巴）
    if (!iso || iso.length < 19) return iso || '';
    return iso.substring(5, 10) + ' ' + iso.substring(11, 19);
  }
  PBC.showDiagLog = function () {
    var old = document.getElementById('pbcDiagOverlay');
    if (old) { old.parentNode.removeChild(old); return; }
    var arr = getJSON(DIAG_KEY, []);
    var overlay = document.createElement('div');
    overlay.id = 'pbcDiagOverlay';
    // v6.0.1 兼容修复：老 Android WebView 不支持 inset/flex-gap，且 flex列+flex:1 的滚动区解析不出
    // 可滚高度（日志多时被裁掉无法下滚）。改用全时代兼容写法：四向长式定位、滚动区直接 max-height、
    // 按钮间距用 margin 替代 gap（与项目"老 WebView 避新 CSS"铁律一致）。
    overlay.setAttribute('style',
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px;');
    var inner = '';
    inner += '<div id="pbcDiagCard" style="background:#fff;color:#202124;border-radius:12px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.3);font-family:inherit;">';
    inner += '<div style="padding:12px 14px;font-weight:700;font-size:15px;border-bottom:1px solid #eee;">诊断日志（最近 ' + arr.length + ' 条）</div>';
    inner += '<div id="pbcDiagList" style="max-height:60vh;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px 14px;font-size:12px;line-height:1.7;font-family:monospace;white-space:pre-wrap;word-break:break-all;">';
    if (!arr.length) inner += '暂无日志。发生异常时会自动记录。';
    arr.forEach(function (it) {
      inner += '[' + esc(fmtDiagTime(it.t)) + '] ' + esc(it.level) + ' ' + esc(it.msg) + '\n';
    });
    inner += '</div>';
    inner += '<div style="padding:10px 14px;border-top:1px solid #eee;text-align:right;">';
    inner += '<button id="pbcDiagCopy" style="padding:8px 14px;border-radius:8px;border:1px solid #dadce0;background:#fff;cursor:pointer;margin-right:8px;">复制</button>';
    inner += '<button id="pbcDiagClear" style="padding:8px 14px;border-radius:8px;border:1px solid #dadce0;background:#fff;cursor:pointer;margin-right:8px;">清空</button>';
    inner += '<button id="pbcDiagClose" style="padding:8px 14px;border-radius:8px;border:none;background:#1a73e8;color:#fff;cursor:pointer;">关闭</button>';
    inner += '</div></div>';
    overlay.innerHTML = inner;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) overlay.parentNode.removeChild(overlay); });
    document.getElementById('pbcDiagClose').onclick = function () { overlay.parentNode.removeChild(overlay); };
    document.getElementById('pbcDiagClear').onclick = function () {
      try { localStorage.removeItem(DIAG_KEY); } catch (e) {}
      overlay.parentNode.removeChild(overlay);
    };
    document.getElementById('pbcDiagCopy').onclick = function () {
      var text = arr.map(function (it) { return '[' + it.t + '] ' + it.level + ' ' + it.msg; }).join('\n');
      function done(ok) { toast(ok ? '已复制到剪贴板' : '复制失败，请长按文本手动复制'); if (ok) overlay.parentNode.removeChild(overlay); }
      // Android WebView 的 navigator.clipboard 会挂起/静默失败：execCommand 优先（与页面 _fallbackCopy 同策略）
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0;font-size:16px;';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
          return;
        }
        done(ok);
      } catch (e) { done(false); }
    };
  };

  /* ---------- fetch 网关：超时 + 重试（供各页面统一使用） ---------- */
  PBC.fetchJSON = function (url, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 8000;
    var retries = opts.retries == null ? 1 : opts.retries;
    function attempt(n) {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout);
      return fetch(url, { cache: opts.cache || 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          clearTimeout(timer);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .catch(function (e) {
          clearTimeout(timer);
          if (n < retries) {
            return new Promise(function (res) { setTimeout(res, 600); }).then(function () { return attempt(n + 1); });
          }
          throw e;
        });
    }
    return attempt(0);
  };

  /* ---------- IndexedDB 通用访问（收藏导入导出用） ---------- */
  function idbOpen(dbName, storeName, keyPath) {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, keyPath ? { keyPath: keyPath } : undefined);
        };
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function (e) { reject(e.target.error); };
      } catch (e) { reject(e); }
    });
  }
  function idbGetAll(dbName, storeName, keyPath) {
    return idbOpen(dbName, storeName, keyPath).then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(storeName, 'readonly');
          var rq = tx.objectStore(storeName).getAll();
          rq.onsuccess = function () { resolve(rq.result || []); };
          rq.onerror = function () { reject(rq.error); };
        } catch (e) { reject(e); }
      });
    });
  }
  function idbPutAll(dbName, storeName, keyPath, items) {
    return idbOpen(dbName, storeName, keyPath).then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(storeName, 'readwrite');
          var st = tx.objectStore(storeName);
          items.forEach(function (it) { st.put(it); });
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { reject(tx.error); };
        } catch (e) { reject(e); }
      });
    });
  }

  /* ---------- 收藏导出（本地文件，不上传任何服务器） ---------- */
  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 5000);
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (t) {
      t.textContent = msg; t.classList.add('show');
      clearTimeout(t._pbcTimer);
      t._pbcTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
    } else { try { console.log('[toast]', msg); } catch (e) {} }
  }
  PBC.toast = toast;

  function favExport() {
    idbGetAll('StockFavDB', 'fav', 'code').then(function (items) {
      if (!items.length) { toast('收藏为空'); return; }
      var groups = null;
      try { groups = getJSON('pb_calc_fav_groups', null); } catch (e) {}
      var payload = { ver: VER, exported: new Date().toISOString(), items: items, groups: groups };
      var d = new Date();
      var name = 'favorites_v6_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
      // APK：走 Java 桥调系统"保存到文件"对话框（WebView 的 blob 下载默认不落盘）
      if (window.JSInterface && window.JSInterface.saveJson) {
        try { window.JSInterface.saveJson(name, JSON.stringify(payload)); diag('favExport: ' + items.length + ' items (via bridge)'); return; }
        catch (e) { /* 桥失败则继续走浏览器下载 */ }
      }
      download(name, JSON.stringify(payload));
      toast('已导出 ' + items.length + ' 条收藏');
      diag('favExport: ' + items.length + ' items');
    }).catch(function (e) { toast('导出失败：' + (e && e.message || e)); diag('favExport failed: ' + (e && e.message || e), 'error'); });
  }
  window.favExport = favExport;
  PBC.favExport = favExport;

  /* ---------- 收藏导入：兼容旧版 favorites.json（{用户:[{code,name,time}]}）与 v6 格式 ---------- */
  /* 核心逻辑独立导出（favImportText），便于测试与未来桥接复用 */
  function favImportText(text) {
    var items = [], groups = null;
    try {
      var data = JSON.parse(text);
      if (data && Array.isArray(data.items)) {
        items = data.items; groups = data.groups || null;           // v6 格式
      } else if (data && typeof data === 'object') {
        Object.keys(data).forEach(function (user) {                  // 旧 favorites.json 格式
          if (Array.isArray(data[user])) items = items.concat(data[user]);
        });
      }
    } catch (e) { toast('JSON 解析失败'); return; }
    items = items.filter(function (it) { return it && /^\d{6}$/.test(String(it.code)); })
      .map(function (it) { return { code: String(it.code), name: it.name || '', group: it.group || '', time: it.time || Date.now() }; });
    if (!items.length) { toast('文件中未找到有效收藏'); return; }
    idbPutAll('StockFavDB', 'fav', 'code', items).then(function () {
      if (groups && Array.isArray(groups)) {
        var cur = getJSON('pb_calc_fav_groups', []);
        groups.forEach(function (g) { if (cur.indexOf(g) < 0) cur.push(g); });
        setJSON('pb_calc_fav_groups', cur);
      }
      toast('已导入 ' + items.length + ' 条收藏，即将刷新');
      diag('favImport: ' + items.length + ' items');
      setTimeout(function () { location.reload(); }, 1200);
    }).catch(function (e) { toast('写入失败：' + (e && e.message || e)); diag('favImport failed: ' + (e && e.message || e), 'error'); });
  }
  PBC.favImportText = favImportText;

  function favImport() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) { document.body.removeChild(input); return; }
      var reader = new FileReader();
      reader.onload = function (ev) {
        document.body.removeChild(input);
        favImportText(new TextDecoder('utf-8').decode(new Uint8Array(ev.target.result)));
      };
      reader.onerror = function () { document.body.removeChild(input); toast('文件读取失败'); };
      reader.readAsArrayBuffer(f);
    };
    input.click();
  }
  window.favImport = favImport;
  PBC.favImport = favImport;
})();
