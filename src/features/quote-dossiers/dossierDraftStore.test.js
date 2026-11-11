import { createDossierDraftStore, dossierDraftScope, normalizeDossierDraft } from "./dossierDraftStore";
const draft = value => ({ dossier: { customerName: value }, items: [{ articleCode: "QA001", features: ["Cor:\tBranco"], imageDataUrl: "data:image/jpeg;base64,cGhvdG8=" }], filename: "qa.pdf" });
function storage() {
  const records = new Map();
  return { records, read: jest.fn(async key => records.get(key)), list: jest.fn(async () => [...records.values()]), write: jest.fn(async (record, expected) => { if ((records.get(record.key)?.revision || null) !== expected) return false; records.set(record.key, record); return true; }), remove: jest.fn(async (key, expected) => { if ((records.get(key)?.revision || null) === expected) records.delete(key); }) };
}
const scope = dossierDraftScope("user-a", "org-a", "store-a");
test("closing the tab/browser restores fields and photos only for the same account, organization and store", async () => {
  const disk = storage();
  await createDossierDraftStore(disk, "tab-a").save(scope, draft("QA"));
  const reloaded = createDossierDraftStore(disk, "tab-a");
  expect((await reloaded.load(scope)).draft).toEqual(normalizeDossierDraft(draft("QA")));
  for (const other of [dossierDraftScope("user-b", "org-a", "store-a"), dossierDraftScope("user-a", "org-b", "store-a"), dossierDraftScope("user-a", "org-a", "store-b")]) expect((await reloaded.load(other)).draft.dossier).toBeNull();
  expect((await createDossierDraftStore(disk, "tab-b").load(scope)).draft).toEqual(normalizeDossierDraft(draft("QA")));
});
test("denied/quota storage preserves the in-memory draft and reports its limitation", async () => {
  const disk = storage(); disk.write.mockRejectedValue(new Error("QuotaExceededError"));
  const store = createDossierDraftStore(disk, "tab-a");
  expect(await store.save(scope, draft("Preserved"))).toBe("memory");
  expect((await store.load(scope)).draft.dossier.customerName).toBe("Preserved");
});
test("late reads cannot overwrite an edit or restore a discarded draft", async () => {
  let finish;
  const disk = storage(); disk.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const store = createDossierDraftStore(disk, "tab-a");
  const pending = store.load(scope); await store.save(scope, draft("New")); finish(null);
  expect((await pending).draft.dossier.customerName).toBe("New");
  await store.clear(scope); expect((await store.load(scope)).draft.dossier).toBeNull();
});
test("writes and clearing complete in order even if the first write is slow", async () => {
  const disk = storage(); const store = createDossierDraftStore(disk, "tab-a");
  await Promise.all([store.save(scope, draft("First")), store.save(scope, draft("Last")), store.clear(scope)]);
  expect(disk.write).toHaveBeenCalledTimes(1); // Only the content-free deletion marker is written.
  expect([...disk.records.values()][0].draft).toBeNull();
});
test("expired or malformed drafts do not crash the editor", async () => {
  const disk = storage();
  await createDossierDraftStore(disk, "tab-a", () => 100).save(scope, draft("Expired"));
  expect((await createDossierDraftStore(disk, "tab-a", () => 100 + 25 * 3600000).load(scope)).draft.dossier).toBeNull();
  await createDossierDraftStore(disk, "tab-a", () => 100).save(scope, draft("Malformed"));
  for (const record of disk.records.values()) record.draft.items = [null];
  expect((await createDossierDraftStore(disk, "tab-a", () => 100).load(scope)).status).toBe("memory");
});
test("each edit renews 24 hours; expired memory and disk cannot restore a dossier", async () => {
  const disk = storage(); let time = 100;
  const store = createDossierDraftStore(disk, "tab-a", () => time);
  await store.save(scope, draft("First")); const first = store.peek(scope).expiresAt;
  time += 3600000; await store.save(scope, draft("Edited"));
  expect(store.peek(scope).expiresAt).toBe(first + 3600000);
  time = first + 3600000;
  expect(store.peek(scope)).toBeUndefined(); expect((await store.load(scope)).status).toBe("expired");
  expect(disk.records.size).toBe(0);
});
test("a second tab cannot silently overwrite the first tab's newer draft", async () => {
  const disk = storage(); const first = createDossierDraftStore(disk, "a"), second = createDossierDraftStore(disk, "b");
  await first.save(scope, draft("Initial")); await second.load(scope);
  await first.save(scope, draft("Newer"));
  expect(await second.save(scope, draft("Concurrent"))).toBe("conflict");
  expect(second.peek(scope).draft.dossier.customerName).toBe("Concurrent");
  expect((await createDossierDraftStore(disk, "c").load(scope)).draft.dossier.customerName).toBe("Newer");
  await second.load(scope, { fresh: true }); expect(await second.save(scope, draft("After review"))).toBe("saved");
});
test("legacy drafts migrate on the first edit and explicit deletion does not revive an old tab copy", async () => {
  const disk = storage(); disk.records.set(`v1:old:${scope}`, { key: `v1:old:${scope}`, version: 1, updatedAt: Date.now(), draft: draft("Legacy") });
  const store = createDossierDraftStore(disk, "new");
  expect((await store.load(scope)).draft.dossier.customerName).toBe("Legacy");
  await store.save(scope, draft("Migrated")); await store.clear(scope);
  expect((await createDossierDraftStore(disk, "reopened").load(scope)).draft.dossier).toBeNull();
});
test("a temporary disk error during reload preserves the open draft", async () => {
  const disk = storage(), store = createDossierDraftStore(disk, "a");
  await store.save(scope, draft("Do not lose")); disk.read.mockRejectedValue(new Error("Temporary failure"));
  const loaded = await store.load(scope, { fresh: true });
  expect(loaded.status).toBe("memory"); expect(loaded.draft.dossier.customerName).toBe("Do not lose");
});
test("only editor data is stored, never auth data or raw PDF text", async () => {
  const value = normalizeDossierDraft({ ...draft("QA"), token: "secret", dossier: { customerName: "QA", rawText: "private" } });
  expect(JSON.stringify(value)).not.toMatch(/secret|private|token|rawText/);
  expect(() => normalizeDossierDraft({ dossier: {}, items: [null] })).toThrow();
  expect(dossierDraftScope("a", null, "s")).toBe("");
});
test("technical PDF Blobs survive recovery only for their account and organization", async () => {
  const disk = storage(), blob = new Blob(["%PDF-1.7\n%%EOF"], { type: "application/pdf" });
  const value = draft("QA"); value.items[0].technicalSheet = { name: "ficha.pdf", blob };
  await createDossierDraftStore(disk, "tab-a").save(scope, value);
  const restored = await createDossierDraftStore(disk, "tab-a").load(scope);
  expect(restored.draft.items[0].technicalSheet.blob).toBe(blob);
  expect(restored.draft.items[0].technicalSheet.name).toBe("ficha.pdf");
  expect((await createDossierDraftStore(disk, "tab-a").load(dossierDraftScope("user-b", "org-a", "store-a"))).draft.dossier).toBeNull();
  expect((await createDossierDraftStore(disk, "tab-a").load(dossierDraftScope("user-a", "org-b", "store-a"))).draft.dossier).toBeNull();
});
test("old drafts and a damaged optional PDF keep the rest of the dossier", () => {
  const value = draft("Preserved"); value.items[0].technicalSheet = { name: "Broken.pdf", blob: "not a blob" };
  expect(normalizeDossierDraft(value).dossier.customerName).toBe("Preserved");
  expect(normalizeDossierDraft(value).items[0].technicalSheet).toBeNull();
  expect(normalizeDossierDraft(draft("Old version")).items[0].technicalSheet).toBeNull();
});
