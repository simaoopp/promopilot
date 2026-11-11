export const DOSSIER_DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;
const expired = record => !Number.isFinite(record?.updatedAt) || Date.now() - record.updatedAt >= DOSSIER_DRAFT_MAX_AGE;

// Read/write checks happen in one IndexedDB transaction, so two tabs cannot
// silently overwrite each other's edits. No schema upgrade or data reset.
function transaction(action) {
  return new Promise((resolve, reject) => {
    let db, tx, result, finished = false;
    const finish = error => {
      if (finished) return;
      finished = true; clearTimeout(timer); db?.close();
      error ? reject(new Error("Armazenamento do rascunho indisponível.")) : resolve(result);
    };
    const timer = setTimeout(() => { try { tx?.abort(); } catch {} finish(true); }, 5000);
    try {
      const request = window.indexedDB.open("promopilot-dossier-drafts", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "key" });
      request.onerror = request.onblocked = () => finish(true);
      request.onsuccess = () => {
        db = request.result;
        if (finished) { db.close(); return; }
        try {
          tx = db.transaction("drafts", "readwrite");
          tx.oncomplete = () => finish(); tx.onerror = tx.onabort = () => finish(true);
          const table = tx.objectStore("drafts");
          const removed = new Map();
          const cursor = table.openCursor();
          cursor.onsuccess = () => {
            if (finished) return;
            try {
              const entry = cursor.result;
              if (!entry) { action(table, value => { result = value; }, removed); return; }
              if (expired(entry.value)) { removed.set(entry.key, entry.value); entry.delete(); }
              entry.continue();
            } catch { try { tx.abort(); } catch {} finish(true); }
          };
        } catch { try { tx?.abort(); } catch {} finish(true); }
      };
    } catch { finish(true); }
  });
}
export const browserDraftStorage = {
  read: key => transaction((table, done, removed) => { const request = table.get(key); request.onsuccess = () => done(request.result || removed.get(key)); }),
  list: () => transaction((table, done) => { const request = table.getAll(); request.onsuccess = () => done(request.result); }),
  write: (record, expectedRevision) => transaction((table, done, removed) => {
    const request = table.get(record.key);
    request.onsuccess = () => {
      if ((request.result?.revision || removed.get(record.key)?.revision || null) !== expectedRevision) { done(false); return; }
      try { table.put(record); done(true); } catch { table.transaction.abort(); }
    };
  }),
  remove: (key, expectedRevision) => transaction((table, done) => {
    const request = table.get(key);
    request.onsuccess = () => {
      if ((request.result?.revision || null) === expectedRevision) table.delete(key);
      done(true);
    };
  }),
};
