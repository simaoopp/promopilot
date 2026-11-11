import { normalizeTechnicalPdf } from "./dossierTechnicalPdf";
import { browserDraftStorage, DOSSIER_DRAFT_MAX_AGE } from "./dossierDraftPersistence";

const MAX_AGE = DOSSIER_DRAFT_MAX_AGE;
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
export function createDossierDraftStore(storage, legacyTabId, now = Date.now) {
  const memory = new Map(), writes = new Map(), revisions = new Map();
  const keyFor = scope => `v2:${scope}`;
  const fresh = record => Number.isFinite(record?.updatedAt) && now() - record.updatedAt < MAX_AGE;
  const empty = status => ({ draft: emptyDossierDraft(), status, expiresAt: null });
  const cached = scope => {
    const value = memory.get(scope);
    if (value?.expiresAt && now() >= value.expiresAt) { memory.delete(scope); return undefined; }
    return value;
  };
  const enqueue = (scope, action) => {
    const operation = (writes.get(scope) || Promise.resolve()).then(action).then(result => result === false ? "conflict" : "saved", () => "memory");
    writes.set(scope, operation);
    operation.then(() => { if (writes.get(scope) === operation) writes.delete(scope); });
    return operation;
  };
  async function write(scope, state, draft) {
    const revision = `${now()}:${Math.random().toString(36).slice(2)}`;
    const result = await storage.write({ key: keyFor(scope), scope, version: 2, revision, updatedAt: state.updatedAt, draft }, revisions.get(scope) || null);
    if (result !== false) revisions.set(scope, revision);
    return result;
  }
  return {
    peek: cached,
    async load(scope, { fresh: force = false } = {}) {
      if (!scope) return empty("memory");
      const previous = memory.get(scope);
      if (!force && cached(scope)) return cached(scope);
      if (force) memory.delete(scope);
      try {
        let record = await storage.read(keyFor(scope));
        if (cached(scope)) return cached(scope); // A newer local edit wins.
        if (record && !fresh(record)) {
          await storage.remove?.(record.key, record.revision || null);
          revisions.delete(scope);
          return empty("expired");
        }
        revisions.set(scope, record?.revision || null);
        if (record && (record.key !== keyFor(scope) || record.scope !== scope || record.version !== 2)) return empty("memory");
        if (record && !record.draft) { const state = empty("empty"); memory.set(scope, state); return state; }
        if (!record && storage.list) {
          const legacy = (await storage.list()).filter(value => value.version === 1 && value.key.startsWith("v1:") && value.key.endsWith(`:${scope}`) && fresh(value));
          record = legacy.find(value => value.key === `v1:${legacyTabId}:${scope}`) || legacy.sort((a, b) => b.updatedAt - a.updatedAt)[0];
          if (cached(scope)) return cached(scope);
        }
        if (!record) return empty("empty");
        const loaded = { draft: normalizeDossierDraft(record.draft), status: "saved", updatedAt: record.updatedAt, expiresAt: record.updatedAt + MAX_AGE };
        memory.set(scope, loaded); return loaded;
      } catch {
        // A temporary IndexedDB failure must not erase an already-open editor.
        if (previous?.draft.dossier) {
          const retained = { ...previous, status: "memory" }; memory.set(scope, retained); return retained;
        }
        return empty("memory");
      }
    },
    save(scope, value) {
      if (!scope) return Promise.resolve("memory");
      const draft = normalizeDossierDraft(value), updatedAt = now();
      const state = { draft, status: "saving", updatedAt, expiresAt: updatedAt + MAX_AGE };
      memory.set(scope, state);
      return enqueue(scope, () => {
        if (memory.get(scope) !== state) return;
        return write(scope, state, draft);
      }).then(status => { state.status = status; return status; });
    },
    clear(scope) {
      if (!scope) return Promise.resolve("memory");
      const state = { ...empty("empty"), updatedAt: now() };
      memory.set(scope, state);
      // A small tombstone prevents a deleted dossier from resurfacing through
      // a legacy tab copy. It contains no dossier content and expires in 24h.
      return enqueue(scope, () => write(scope, state, null));
    },
  };
}
let browserStore;
export function getDossierDraftStore() {
  if (!browserStore) {
    const id = tabIdentity();
    browserStore = createDossierDraftStore(browserDraftStorage, id || "memory");
  }
  return browserStore;
}
