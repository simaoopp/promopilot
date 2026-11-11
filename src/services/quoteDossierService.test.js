import { extractQuoteDossier, generateQuoteDossierPdf } from "./quoteDossierService";
import { requireSession } from "./authSessionService";
import { getAccessCacheScope, tenantHeaders } from "./platformService";
import { appendTechnicalSheets } from "../features/quote-dossiers/appendTechnicalSheets";
jest.mock("../features/quote-dossiers/createDossierPdfWorker", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../features/quote-dossiers/appendTechnicalSheets", () => ({ ...jest.requireActual("../features/quote-dossiers/appendTechnicalSheets"), appendTechnicalSheets: jest.fn() }));
jest.mock("./authSessionService", () => ({ requireSession: jest.fn() }));
jest.mock("./platformService", () => ({ getAccessCacheScope: jest.fn(), tenantHeaders: jest.fn() }));
const ok = () => ({ ok: true, status: 200, json: async () => ({ dossier: { items: [] } }) });
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); jest.spyOn(console, "warn").mockImplementation(() => {});
  global.fetch = jest.fn(async () => ok());
  appendTechnicalSheets.mockImplementation(async base => base);
  requireSession.mockResolvedValue({ user: { id: "user-a" }, access_token: "synthetic-token" });
  getAccessCacheScope.mockReturnValue("user-a:org-a:store-a");
  tenantHeaders.mockReturnValue({ "X-Organization-Id": "org-a", "X-Store-Id": "store-a" });
  process.env.REACT_APP_API_BASE_URL = "https://api.example.test/api/";
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); delete process.env.REACT_APP_API_BASE_URL; });
test("the authorized organization and normalized API origin are used", async () => {
  await extractQuoteDossier({ filename: "qa.pdf", pdfBase64: "test" });
  expect(fetch).toHaveBeenCalledWith("https://api.example.test/api/orcamentos-dossiers/extract", expect.objectContaining({ headers: expect.objectContaining({ "X-Organization-Id": "org-a", Authorization: "Bearer synthetic-token" }) }));
});
test.each([401, 403, 503, 413])("HTTP %i is surfaced without logging tokens or raw upstream bodies", async status => {
  fetch.mockResolvedValue({ ok: false, status, text: async () => "sensitive SQL and token" });
  await expect(extractQuoteDossier({ filename: "qa.pdf", pdfBase64: "test" })).rejects.toMatchObject({ status });
  expect(fetch).toHaveBeenCalledTimes(1); expect(JSON.stringify(console.warn.mock.calls)).not.toMatch(/synthetic-token|sensitive|SQL|qa.pdf/);
});
test("account/organization changes while session lookup is pending prevent the request", async () => {
  requireSession.mockImplementation(async () => { getAccessCacheScope.mockReturnValue("user-a:org-b:store-a"); return { user: { id: "user-a" }, access_token: "synthetic-token" }; });
  await expect(extractQuoteDossier({})).rejects.toMatchObject({ code: "SESSION_CHANGED" }); expect(fetch).not.toHaveBeenCalled();
});
test("a mismatched session cannot use the previous account's tenant headers", async () => {
  requireSession.mockResolvedValue({ user: { id: "user-b" }, access_token: "other" });
  await expect(extractQuoteDossier({})).rejects.toMatchObject({ code: "SESSION_CHANGED" }); expect(fetch).not.toHaveBeenCalled();
});
test("HTML returned instead of PDF is an error, never a downloaded dossier", async () => {
  fetch.mockResolvedValue({ ...ok(), headers: { get: () => "text/html" } });
  await expect(generateQuoteDossierPdf({ dossier: {}, items: [] })).rejects.toMatchObject({ code: "DOSSIER_REQUEST_FAILED" });
});
test("bounded API timeout aborts the network operation and settles loading", async () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const operation = extractQuoteDossier({}); const assertion = expect(operation).rejects.toMatchObject({ code: "AUTH_TIMEOUT" });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(1);
  jest.advanceTimersByTime(120000); await assertion;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
test("cancelled pages abort their pending operation", async () => {
  const controller = new AbortController(); fetch.mockImplementation(() => new Promise(() => {}));
  const operation = extractQuoteDossier({}, { signal: controller.signal }); const assertion = expect(operation).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve(); controller.abort(); await assertion;
});
test("local technical sheets are never sent in the dossier generation request", async () => {
  const attachment = { name: "private-manufacturer-sheet.pdf", blob: new Blob(["private bytes"], { type: "application/pdf" }) };
  const item = Object.freeze({ articleCode: "QA001", total: "99,99", technicalSheet: attachment });
  fetch.mockResolvedValue({ ...ok(), headers: { get: () => "application/pdf" }, blob: async () => new Blob(["%PDF-1.7"]) });
  await generateQuoteDossierPdf({ dossier: { budgetNumber: "QA/1" }, items: [item] });
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.items).toEqual([{ articleCode: "QA001", total: "99,99" }]);
  expect(fetch.mock.calls[0][1].body).not.toMatch(/technicalSheet|private-manufacturer|private bytes/);
  expect(item.technicalSheet).toBe(attachment);
  expect(appendTechnicalSheets).toHaveBeenCalledWith(expect.any(Blob), [expect.objectContaining({ equipmentNumber: 1, blob: attachment.blob })], undefined);
});
test("only the merged PDF is returned and scope changes while merging reject it", async () => {
  const final = new Blob(["merged"], { type: "application/pdf" });
  fetch.mockResolvedValue({ ...ok(), headers: { get: () => "application/pdf" }, blob: async () => new Blob(["base"]) });
  appendTechnicalSheets.mockResolvedValueOnce(final);
  expect(await generateQuoteDossierPdf({ dossier: {}, items: [] })).toBe(final);
  appendTechnicalSheets.mockImplementationOnce(async () => { getAccessCacheScope.mockReturnValue("user-a:org-b:store-a"); return final; });
  await expect(generateQuoteDossierPdf({ dossier: {}, items: [] })).rejects.toMatchObject({ code: "SESSION_CHANGED" });
});
