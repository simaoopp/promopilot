const DB_NAME = "expert-artigos-cache";
const DB_VERSION = 1;
const STORE_NAME = "catalogos";
const ALL_ARTIGOS_CACHE_KEY = "all-artigos-v1";
const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function hasIndexedDbSupport() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

function toPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Erro no IndexedDB."));
  });
}

function openDatabase() {
  if (!hasIndexedDbSupport()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Erro ao abrir cache local."));
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();

  if (!db) return null;

  try {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await callback(store);

    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Erro na transação IndexedDB."));
      transaction.onabort = () => reject(transaction.error || new Error("Transação IndexedDB abortada."));
    });

    return result;
  } finally {
    db.close();
  }
}

function normalizePersistedRecord(record, maxAgeMs) {
  const updatedAt = Number(record?.updatedAt || 0);
  const items = Array.isArray(record?.items) ? record.items : [];

  if (!items.length || !updatedAt) {
    return null;
  }

  if (Date.now() - updatedAt > maxAgeMs) {
    return null;
  }

  return {
    ok: true,
    items,
    artigos: items,
    total: Number.isFinite(record.total) ? record.total : items.length,
    limit: items.length,
    offset: 0,
    hasMore: false,
    q: "",
    source: "indexeddb",
    updatedAt,
  };
}

export async function readPersistedArtigos({ maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  try {
    const record = await withStore("readonly", (store) =>
      toPromise(store.get(ALL_ARTIGOS_CACHE_KEY)),
    );

    return normalizePersistedRecord(record, maxAgeMs);
  } catch (error) {
    console.warn("Não foi possível ler a cache local de artigos.", error);
    return null;
  }
}

export async function writePersistedArtigos(payload = {}) {
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.artigos)
      ? payload.artigos
      : [];

  if (!items.length) return null;

  const record = {
    key: ALL_ARTIGOS_CACHE_KEY,
    items,
    total: Number.isFinite(payload.total) ? payload.total : items.length,
    updatedAt: Date.now(),
  };

  try {
    await withStore("readwrite", (store) => toPromise(store.put(record)));
    return record;
  } catch (error) {
    console.warn("Não foi possível guardar a cache local de artigos.", error);
    return null;
  }
}

export async function clearPersistedArtigos() {
  try {
    await withStore("readwrite", (store) => toPromise(store.delete(ALL_ARTIGOS_CACHE_KEY)));
  } catch (error) {
    console.warn("Não foi possível limpar a cache local de artigos.", error);
  }
}
