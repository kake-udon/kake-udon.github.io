// 軽量 IndexedDB ラッパー。API レスポンスをキャッシュし、オフライン時のフォールバックに使う。
const DB_NAME = 'mlb-app-db';
const DB_VERSION = 1;
const STORE_CACHE = 'apiCache';
const STORE_FAVORITES = 'favorites';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
        db.createObjectStore(STORE_FAVORITES, { keyPath: 'favKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheSet(key, value) {
  try {
    await withStore(STORE_CACHE, 'readwrite', (store) => {
      store.put({ key, value, savedAt: Date.now() });
    });
  } catch (e) {
    console.warn('cacheSet failed', e);
  }
}

export async function cacheGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const req = tx.objectStore(STORE_CACHE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

export async function getFavorites() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FAVORITES, 'readonly');
      const req = tx.objectStore(STORE_FAVORITES).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

export async function toggleFavorite(item) {
  // item: { type: 'team'|'player', id, name }
  const favKey = `${item.type}:${item.id}`;
  const favorites = await getFavorites();
  const exists = favorites.find((f) => f.favKey === favKey);
  if (exists) {
    await withStore(STORE_FAVORITES, 'readwrite', (store) => store.delete(favKey));
    return false;
  }
  await withStore(STORE_FAVORITES, 'readwrite', (store) => store.put({ ...item, favKey }));
  return true;
}

export async function isFavorite(type, id) {
  const favorites = await getFavorites();
  return favorites.some((f) => f.favKey === `${type}:${id}`);
}
