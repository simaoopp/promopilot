import { createDossierDraftStore, dossierDraftScope, normalizeDossierDraft } from "./dossierDraftStore";
const draft = value => ({ dossier: { customerName: value }, items: [{ articleCode: "QA001", features: ["Cor:\tBranco"], imageDataUrl: "data:image/jpeg;base64,cGhvdG8=" }], filename: "qa.pdf" });
function storage() {
  const records = new Map();
  return { records, read: jest.fn(async key => records.get(key)), write: jest.fn(async record => records.set(record.key, record)), remove: jest.fn(async key => records.delete(key)) };
}
const scope = dossierDraftScope("user-a", "org-a", "store-a");
test("reload restores fields and photos only in the same account, organization, store and tab", async () => {
  const disk = storage();
  await createDossierDraftStore(disk, "tab-a").save(scope, draft("QA"));
  const reloaded = createDossierDraftStore(disk, "tab-a");
  expect((await reloaded.load(scope)).draft).toEqual(normalizeDossierDraft(draft("QA")));
  for (const other of [dossierDraftScope("user-b", "org-a", "store-a"), dossierDraftScope("user-a", "org-b", "store-a"), dossierDraftScope("user-a", "org-a", "store-b")]) expect((await reloaded.load(other)).draft.dossier).toBeNull();
  expect((await createDossierDraftStore(disk, "tab-b").load(scope)).draft.dossier).toBeNull();
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
  expect(disk.write).not.toHaveBeenCalled(); // Both queued writes were superseded by the explicit clear.
  expect(disk.records.size).toBe(0);
});
test("expired or malformed drafts do not crash the editor", async () => {
  const disk = storage();
  await createDossierDraftStore(disk, "tab-a", () => 100).save(scope, draft("Expired"));
  expect((await createDossierDraftStore(disk, "tab-a", () => 100 + 25 * 3600000).load(scope)).draft.dossier).toBeNull();
  for (const record of disk.records.values()) record.draft.items = [null];
  expect((await createDossierDraftStore(disk, "tab-a", () => 100).load(scope)).status).toBe("memory");
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
