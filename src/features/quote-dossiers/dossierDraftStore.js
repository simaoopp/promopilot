import { normalizeTechnicalPdf } from "./dossierTechnicalPdf";

const DB_NAME = "promopilot-dossier-drafts";
const TABLE = "drafts";
const MAX_AGE = 24 * 60 * 60 * 1000;
export const emptyDossierDraft = () => ({ dossier: null, items: [], filename: "" });
const dossierFields = ["budgetNumber", "customerName", "date", "total", "notes"];
const itemFields = ["articleCode", "rawDescription", "description", "title", "brand", "category", "reference", "ean", "quantity", "unitPrice", "total", "technicalDescription", "imageDataUrl"];
const plainObject = value => value && typeof value === "object" && !Array.isArray(value);
function fields(source, names) {
  return Object.fromEntries(names.map(name => {
    const value = source[name];
    if (value != null && !["string", "number", "boolean"].includes(typeof value)) throw new Error("Formato de dossier inválido.");
    return [name, value == null ? "" : String(value)];
  }));
}
// Store only editor fields. Never persist sessions, tokens, extracted PDF text,
// response diagnostics or arbitrary properties from an API response.
export function normalizeDossierDraft(value) {
  if (!plainObject(value) || !plainObject(value.dossier) || !Array.isArray(value.items)) throw new Error("Formato de dossier inválido.");
  const items = value.items.map(item => {
    if (!plainObject(item)) throw new Error("Equipamento inválido no dossier.");
    const result = fields(item, itemFields);
    const features = Array.isArray(item.features) ? item.features : String(item.features || "").split("\n");
    if (features.some(feature => typeof feature !== "string")) throw new Error("Características inválidas no dossier.");
    result.features = [...features];
    result.technicalSheet = normalizeTechnicalPdf(item.technicalSheet);
    if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(result.imageDataUrl)) result.imageDataUrl = "";
    return result;
  });
  return { dossier: fields(value.dossier, dossierFields), items, filename: typeof value.filename === "string" ? value.filename : "" };
}
export function dossierDraftScope(userId, organizationId, storeId) {
  return userId && organizationId ? JSON.stringify([userId, organizationId, storeId || null]) : "";
}
function tabIdentity() {
  try {
    const key = "promopilot:dossier-tab";
    let id = window.sessionStorage.getItem(key);
    if (!id) { id = window.crypto.randomUUID(); window.sessionStorage.setItem(key, id); }
    return id;
  } catch { return null; }
}
function databaseOperation(mode, action) {
  return new Promise((resolve, reject) => {
    let db, transaction, result, finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true; clearTimeout(timer); db?.close();
      if (error) reject(new Error("Armazenamento do rascunho indisponível.")); else resolve(value);
    };
    const timer = setTimeout(() => { try { transaction?.abort(); } catch {} finish(true); }, 5000);
    try {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(TABLE, { keyPath: "key" });
      request.onerror = request.onblocked = () => finish(true);
      request.onsuccess = () => {
        db = request.result;
        if (finished) { db.close(); return; }
        try {
          transaction = db.transaction(TABLE, mode);
          transaction.oncomplete = () => finish(null, result);
          transaction.onerror = transaction.onabort = () => finish(true);
          const store = transaction.objectStore(TABLE);
          const operation = action(store);
          operation.onsuccess = () => { result = operation.result; };
          if (mode === "readwrite") {
            const cursor = store.openCursor();
            cursor.onsuccess = () => {
              const entry = cursor.result;
              if (!entry) return;
              if (Date.now() - Number(entry.value.updatedAt || 0) > MAX_AGE) entry.delete();
              entry.continue();
            };
          }
        } catch { finish(true); }
      };
    } catch { finish(true); }
  });
}
const browserStorage = {
  read: key => databaseOperation("readonly", store => store.get(key)),
  write: record => databaseOperation("readwrite", store => store.put(record)),
  remove: key => databaseOperation("readwrite", store => store.delete(key)),
};

export function createDossierDraftStore(storage, tabId, now = Date.now) {
  const memory = new Map(), writes = new Map();
  const keyFor = scope => `v1:${tabId}:${scope}`;
  const enqueue = (scope, action) => {
    const operation = (writes.get(scope) || Promise.resolve()).then(action).then(() => "saved", () => "memory");
    writes.set(scope, operation);
    operation.then(() => { if (writes.get(scope) === operation) writes.delete(scope); });
    return operation;
  };
  return {
    peek: scope => memory.get(scope),
    async load(scope) {
      if (!scope) return { draft: emptyDossierDraft(), status: "memory" };
      if (memory.has(scope)) return memory.get(scope);
      try {
        const record = await storage.read(keyFor(scope));
        // A newer edit/reset must win over an older disk read.
        if (memory.has(scope)) return memory.get(scope);
        if (!record || record.key !== keyFor(scope) || record.version !== 1 || now() - record.updatedAt > MAX_AGE || !Number.isFinite(record.updatedAt)) return { draft: emptyDossierDraft(), status: "empty" };
        const loaded = { draft: normalizeDossierDraft(record.draft), status: "saved" };
        memory.set(scope, loaded); return loaded;
      } catch { return { draft: emptyDossierDraft(), status: "memory" }; }
    },
    save(scope, value) {
      if (!scope) return Promise.resolve("memory");
      const draft = normalizeDossierDraft(value);
      const state = { draft, status: "saving" };
      memory.set(scope, state);
      return enqueue(scope, () => {
        if (memory.get(scope) !== state) return; // Coalesce edits still waiting for disk.
        return storage.write({ key: keyFor(scope), version: 1, updatedAt: now(), draft });
      }).then(status => {
        state.status = status; return status;
      });
    },
    clear(scope) {
      if (!scope) return Promise.resolve("memory");
      // A tombstone also prevents a pending read from restoring a cleared draft.
      memory.set(scope, { draft: emptyDossierDraft(), status: "empty" });
      return enqueue(scope, () => storage.remove(keyFor(scope)));
    },
  };
}
let browserStore;
export function getDossierDraftStore() {
  if (!browserStore) {
    const id = tabIdentity();
    const unavailable = () => Promise.reject(new Error("Armazenamento indisponível."));
    browserStore = createDossierDraftStore(id ? browserStorage : { read: unavailable, write: unavailable, remove: unavailable }, id || "memory");
  }
  return browserStore;
}
