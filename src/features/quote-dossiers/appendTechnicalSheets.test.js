import { appendTechnicalSheets, collectTechnicalSheets } from "./appendTechnicalSheets";
import createDossierPdfWorker from "./createDossierPdfWorker";
jest.mock("./createDossierPdfWorker", () => ({ __esModule: true, default: jest.fn() }));
let worker;
const pdf = () => new Blob(["%PDF-1.7"], { type: "application/pdf" });
const sheets = () => collectTechnicalSheets([{ articleCode: "QA", technicalSheet: { name: "QA.pdf", blob: pdf() } }]);
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); worker = { postMessage: jest.fn(), terminate: jest.fn() }; createDossierPdfWorker.mockReturnValue(worker); });
afterEach(() => jest.useRealTimers());
test("no sheets returns the base without starting a worker", async () => {
  const base = pdf(); expect(await appendTechnicalSheets(base, [])).toBe(base); expect(createDossierPdfWorker).not.toHaveBeenCalled();
});
test("worker result is the downloadable dossier; the original Blob remains intact", async () => {
  const base = pdf(), list = sheets(); const operation = appendTechnicalSheets(base, list);
  expect(worker.postMessage).toHaveBeenCalledWith({ dossier: base, sheets: list });
  worker.onmessage({ data: { result: new Uint8Array([37, 80, 68, 70, 45]) } });
  expect((await operation).type).toBe("application/pdf"); expect(base.size).toBe(8);
  expect(worker.terminate).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});
test.each(["error", "timeout", "abort"])("%s terminates processing and cannot produce a partial result", async kind => {
  const controller = new AbortController(); const operation = appendTechnicalSheets(pdf(), sheets(), { signal: controller.signal });
  const rejected = expect(operation).rejects.toThrow();
  if (kind === "error") worker.onmessage({ data: { error: { code: "INVALID", equipmentNumber: 1 } } });
  if (kind === "timeout") jest.advanceTimersByTime(120000);
  if (kind === "abort") controller.abort();
  await rejected; expect(worker.terminate).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});
test("gaps keep original equipment numbers and invalid attachments cannot disappear silently", () => {
  const attachment = sheets()[0];
  expect(collectTechnicalSheets([{}, { brand: "QA", reference: "MODEL", technicalSheet: attachment }])[0]).toMatchObject({ equipmentNumber: 2, title: "QA MODEL" });
  expect(() => collectTechnicalSheets([{ technicalSheet: { url: "blob:expired" } }])).toThrow("equipamento 1");
});
