/* ============================================================
 * 墨庐 · 小说创作工作台 — 本地持久化
 *
 * IndexedDB 为主存：不受 localStorage 约 5MB 的限制，
 *   正文内嵌图片（dataURL）也能安全写入。
 * localStorage 同时保存一份相同快照，仅用于启动时同步秒开；
 *   写入超限时静默跳过，改由 IndexedDB 异步接管。
 * 两者都不可用时降级为纯内存，页面关闭即丢失（会在界面提示）。
 * ============================================================ */

'use strict';

const ML_STORE = (() => {
  const LS_KEY = 'ml-books';
  const DB_NAME = 'molu-workbench';
  const DB_VER = 1;
  const OS_NAME = 'library';
  const REC_ID = 'books';
  const FORMAT = 1;

  /* ---------- 能力探测 ---------- */
  const hasLS = (() => {
    try {
      const k = '__ml_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  const hasIDB = (() => {
    try { return typeof indexedDB !== 'undefined' && indexedDB !== null; }
    catch (e) { return false; }
  })();

  /* ---------- IndexedDB ---------- */
  let dbPromise = null;

  function openDB() {
    if (!hasIDB) return Promise.reject(new Error('indexedDB 不可用'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OS_NAME)) {
          db.createObjectStore(OS_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexedDB 打开失败'));
      req.onblocked = () => reject(new Error('indexedDB 被其他标签页占用'));
    });
    /* 打开失败后允许下次重试 */
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function idbTx(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(OS_NAME, mode); }
      catch (e) { return reject(e); }
      const os = tx.objectStore(OS_NAME);
      let result;
      try { result = fn(os); }
      catch (e) { return reject(e); }
      tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
      tx.onerror = () => reject(tx.error || new Error('indexedDB 事务失败'));
      tx.onabort = () => reject(tx.error || new Error('indexedDB 事务中断'));
    }));
  }

  /* ---------- 载荷 ---------- */
  const pack = books => ({
    id: REC_ID,
    format: FORMAT,
    savedAt: new Date().toISOString(),
    books,
  });

  /* 只接受形状正确的载荷，避免残缺数据把应用带崩 */
  function unpack(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!Array.isArray(raw.books)) return null;
    return { books: raw.books, savedAt: raw.savedAt || '', format: raw.format || 1 };
  }

  /* ---------- 读 ---------- */

  /* 同步读取（启动时立即渲染，避免默认数据闪现） */
  function loadSync() {
    if (!hasLS) return null;
    let txt;
    try { txt = localStorage.getItem(LS_KEY); }
    catch (e) { return null; }
    if (!txt) return null;
    try { return unpack(JSON.parse(txt)); }
    catch (e) { return null; }
  }

  /* 异步读取主存；localStorage 因超限没写成时，这里才是唯一完整副本 */
  function loadAsync() {
    if (!hasIDB) return Promise.resolve(null);
    return idbTx('readonly', os => os.get(REC_ID))
      .then(rec => unpack(rec))
      .catch(() => null);
  }

  /* ---------- 写 ---------- */
  function save(books) {
    const payload = pack(books);
    let json = null;
    try { json = JSON.stringify(payload); }
    catch (e) {
      return Promise.resolve({ ls: false, idb: false, error: '数据无法序列化：' + e.message });
    }

    /* localStorage 快照：超限属预期情形，静默跳过 */
    let ls = false;
    if (hasLS) {
      try { localStorage.setItem(LS_KEY, json); ls = true; }
      catch (e) {
        ls = false;
        try { localStorage.removeItem(LS_KEY); } catch (_) {}
      }
    }

    if (!hasIDB) return Promise.resolve({ ls, idb: false, savedAt: payload.savedAt });

    return idbTx('readwrite', os => os.put(payload))
      .then(() => ({ ls, idb: true, savedAt: payload.savedAt }))
      .catch(e => ({ ls, idb: false, savedAt: payload.savedAt, error: e.message }));
  }

  function clear() {
    if (hasLS) { try { localStorage.removeItem(LS_KEY); } catch (e) {} }
    if (!hasIDB) return Promise.resolve();
    return idbTx('readwrite', os => os.delete(REC_ID)).catch(() => {});
  }

  /* ---------- 说明文字 ---------- */
  function describe() {
    if (hasIDB && hasLS) return 'IndexedDB + localStorage 快照';
    if (hasIDB) return 'IndexedDB';
    if (hasLS) return 'localStorage';
    return '仅内存（关闭页面即丢失）';
  }

  return {
    get hasLS() { return hasLS; },
    get hasIDB() { return hasIDB; },
    get usable() { return hasLS || hasIDB; },
    FORMAT,
    loadSync,
    loadAsync,
    save,
    clear,
    describe,
  };
})();
