/** @jest-environment node */
import { Blob } from "node:buffer";
import { receiveMessageOnPort, MessageChannel } from "node:worker_threads";
import { browserDraftStorage as storage, DOSSIER_DRAFT_MAX_AGE } from "./dossierDraftPersistence";
// CRA's Jest 27 sandbox predates Node's structuredClone/DOMException globals.
// Obtain the host implementations, including native Blob structured cloning.
global.DOMException = require("domexception");
global.structuredClone = value => {
  const { port1, port2 } = new MessageChannel();
  try { port1.postMessage(value); return receiveMessageOnPort(port2).message; }
  finally { port1.close(); port2.close(); }
};
const { IDBFactory } = require("fake-indexeddb");
beforeEach(() => { global.window = { indexedDB: new IDBFactory() }; });
afterEach(() => { delete global.window; });
test("IndexedDB preserves native PDF Blobs across new reads", async () => {
  const record = { key: "v2:scope", revision: "r1", updatedAt: Date.now(), draft: { blob: new Blob(["pdf data"], { type: "application/pdf" }) } };
  expect(await storage.write(record, null)).toBe(true);
  const loaded = await storage.read(record.key);
  expect(await loaded.draft.blob.text()).toBe("pdf data"); expect(loaded.draft.blob.type).toBe("application/pdf");
});
test("concurrent IndexedDB transactions accept one writer and reject a stale revision", async () => {
  const initial = { key: "v2:scope", revision: "r1", updatedAt: Date.now(), draft: "initial" };
  await storage.write(initial, null);
  const accepted = await Promise.all([storage.write({ ...initial, revision: "a", draft: "A" }, "r1"), storage.write({ ...initial, revision: "b", draft: "B" }, "r1")]);
  expect(accepted).toEqual([true, false]); expect((await storage.read(initial.key)).draft).toBe("A");
});
test("expired bytes are deleted and cleanup cannot delete a fresh replacement", async () => {
  const initial = { key: "v2:scope", revision: "old", updatedAt: Date.now() - DOSSIER_DRAFT_MAX_AGE - 1, draft: "old bytes" };
  await storage.write(initial, null);
  await storage.write({ ...initial, revision: "new", updatedAt: Date.now(), draft: "new bytes" }, "old");
  expect((await storage.read(initial.key)).draft).toBe("new bytes");
  await storage.remove(initial.key, "old"); expect((await storage.read(initial.key)).draft).toBe("new bytes");
  await storage.write({ ...initial, key: "v2:expired" }, null);
  await storage.read("other"); expect((await storage.list()).map(record => record.key)).toEqual([initial.key]);
});
test("unserializable data aborts cleanly and preserves the previous saved dossier", async () => {
  const initial = { key: "v2:scope", revision: "r1", updatedAt: Date.now(), draft: "preserved" };
  await storage.write(initial, null);
  await expect(storage.write({ ...initial, revision: "bad", draft: () => {} }, "r1")).rejects.toThrow("indisponível");
  expect((await storage.read(initial.key)).draft).toBe("preserved");
});
