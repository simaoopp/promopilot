import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TextEncoder } from "util";
import Dialog from "./CampaignPriceImportDialog";
import { createImportApi } from "./importApi";
import { extractInWorker } from "./extractInWorker";

jest.mock("./importApi", () => ({ createImportApi: jest.fn() }));
jest.mock("./extractInWorker", () => ({ extractInWorker: jest.fn() }));
const make = (rows, name = "Fornecedor") => ({ name, rows: rows.map(row => row.map(text => ({ text: String(text) }))) });
const headers = ["Artigo", "Descrição", "PVP2 Antes", "PVP2 Atual", "Data início", "Data fim", "Informação"];
const article = (code, before = "349,99", now = "299,99", start = "01/11/2026", end = "15/11/2026", info = "PROMO") => [code, `Produto ${code}`, before, now, start, end, info];
const sheet = make([headers, article("001"), article("002", "199,99", "199,99"), article("003", "149,99", "169,99"), article("unknown")]);
let root, host, rpc, onApply, onClose, prepared;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; global.TextEncoder = TextEncoder; jest.clearAllMocks();
  Object.defineProperty(global, "crypto", { configurable: true, value: { subtle: { digest: async () => new Uint8Array(32) }, randomUUID: () => "00000000-0000-4000-8000-000000000001" } });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: jest.fn().mockResolvedValue() } });
  extractInWorker.mockResolvedValue([sheet]);
  rpc = jest.fn(async (action, payload) => {
    if (action === "models") return { models: [] };
    if (action === "prepare") {
      prepared = { id: payload.id, store: "Praia", capturedAt: "2026-11-06T12:00:00Z", rows: payload.rows.map(row => ({
        ...row, id: `row-${row.line}`, description: `Catálogo ${row.code}`, beforeCents: row.originalCents,
        currentCents: row.cents, problem: row.code === "unknown" ? "not_found" : row.originalCents === null ? "missing_table_before" : null,
      })) };
      return prepared;
    }
    return { ...prepared, status: "confirmed", items: payload.selected.map(selected => {
      const row = prepared.rows.find(item => item.id === selected.id);
      return { id: row.id, codigo: row.code, descricao: row.description, antes: row.beforeCents / 100, atual: selected.cents / 100,
        campaignPriceImport: { kind: "catalog-pvp2-v1", rowId: row.id, beforeCents: row.beforeCents, afterCents: selected.cents } };
    }) };
  });
  createImportApi.mockResolvedValue(rpc); onApply = jest.fn().mockResolvedValue(); onClose = jest.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function mount(extra = {}) { await act(async () => root.render(<Dialog mode="manual" store="Praia" items={[]} year={2026} onApply={onApply} onClose={onClose} {...extra} />)); }
async function change(element, value) {
  expect(element).toBeTruthy();
  await act(async () => {
    const proto = element.tagName === "SELECT" ? HTMLSelectElement.prototype : element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function click(element) { expect(element).toBeTruthy(); await act(async () => element.click()); }
const button = text => [...host.querySelectorAll("button")].find(element => element.textContent.includes(text));
const select = label => [...host.querySelectorAll("label")].find(element => element.textContent.startsWith(label))?.querySelector("select");
const input = label => host.querySelector(`input[aria-label="${label}"]`);
async function source() { await change(host.querySelector("textarea"), "Tabela colada"); await click(button("Analisar tabela")); }
async function review() { await source(); await click(button("Rever artigos")); }

test("known headers skip manual mapping checkboxes; final review remains mandatory", async () => {
  await mount(); await source();
  expect(host.textContent).toContain("Tabela analisada"); expect(select("Código do artigo")).toBeUndefined();
  expect(host.querySelector(".price-import-confirm-column")).toBeNull(); expect(rpc).not.toHaveBeenCalled();
  await click(button("Rever artigos"));
  expect(rpc.mock.calls.find(([action]) => action === "prepare")[1]).toEqual(expect.objectContaining({ mode: "manual", rows: expect.arrayContaining([expect.objectContaining({ code: "001", originalCents: 34999, cents: 29999 })]) }));
  expect(host.textContent).toContain("349,99"); expect(host.textContent).toContain("Sem alteração"); expect(host.textContent).toContain("Aumento");
  expect(input("Incluir 001").checked).toBe(true); expect(input("Incluir 002").checked).toBe(false); expect(input("Incluir unknown").disabled).toBe(true);
  expect(onApply).not.toHaveBeenCalled(); await click(button("Confirmar e guardar"));
  expect(onApply).toHaveBeenCalledWith([expect.objectContaining({ codigo: "001", antes: 349.99, atual: 299.99, dataInicio: "01/11/2026", dataFim: "15/11/2026" })], expect.objectContaining({ status: "confirmed" }));
});
test("only ambiguous fields are exposed and the explicitly chosen price column is submitted", async () => {
  extractInWorker.mockResolvedValue([make([[...headers, "Preço Promo"], [...article("001"), "279,99"]])]);
  await mount(); await source();
  expect(select("PVP2 Atual")).toBeTruthy(); expect(select("Código do artigo")).toBeUndefined(); expect(button("Rever artigos").disabled).toBe(true);
  await change(select("PVP2 Atual"), "7"); await click(button("Rever artigos"));
  expect(rpc.mock.calls.find(([action]) => action === "prepare")[1].rows[0].cents).toBe(27999);
});
test("multiple worksheets preserve source locations and never submit maintenance rows", async () => {
  extractInWorker.mockResolvedValue([make([headers, article("001"), ["ATUALIZAÇÃO DE PVP"], article("13.731.001.00044", "100", "90", "", "", "")], "Folha A"), make([headers, article("002", "200", "180")], "Folha B")]);
  await mount(); await source(); await click(button("Copiar códigos excluídos"));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("13.731.001.00044");
  await click(button("Rever artigos"));
  const payload = rpc.mock.calls.find(([action]) => action === "prepare")[1];
  expect(payload.rows.map(row => [row.code, row.line, row.sourceSheet, row.sourceLine])).toEqual([["001", 1, "Folha A", 2], ["002", 2, "Folha B", 2]]);
  await click(button("Confirmar e guardar")); expect(onApply.mock.calls[0][0]).toHaveLength(2);
});
test("an all-excluded document can be reviewed/copied without an empty RPC or campaign write", async () => {
  extractInWorker.mockResolvedValue([make([headers, ["REPOSIÇÃO DE PVP"], article("00001", "100", "90", "", "", "")])]);
  await mount(); await review(); expect(host.textContent).toContain("1 linhas excluídas"); expect(rpc).not.toHaveBeenCalled();
  expect(button("Confirmar e guardar").disabled).toBe(true);
});
test("uncertain section membership is pending and requires explicit review", async () => {
  extractInWorker.mockResolvedValue([make([headers, ["Possível reposição de PVP"], article("001")])]);
  await mount(); await review(); expect(input("Incluir 001").disabled).toBe(true);
  await click(host.querySelector(".price-import-warning input"));
  expect(input("Incluir 001").disabled).toBe(false); await click(input("Incluir 001"));
  await click(button("Confirmar e guardar")); expect(rpc.mock.calls.find(([action]) => action === "confirm")[1].selected[0].reviewed).toBe(true);
});
test("no dates are invented; correcting the row unlocks only a valid period", async () => {
  extractInWorker.mockResolvedValue([make([headers, article("001", "350", "300", "", "")])]);
  await mount(); await review(); expect(input("Incluir 001").disabled).toBe(true); expect(input("Início de 001").value).toBe("");
  await change(input("Início de 001"), "2026-11-20"); await change(input("Fim de 001"), "2026-11-10");
  expect(input("Incluir 001").disabled).toBe(true);
  await change(input("Fim de 001"), "2026-12-01"); await click(input("Incluir 001")); await click(button("Confirmar e guardar"));
  expect(onApply.mock.calls[0][0][0]).toMatchObject({ dataInicio: "20/11/2026", dataFim: "01/12/2026" });
});
test("conflicting periods cannot be applied until the user confirms the displayed dates", async () => {
  extractInWorker.mockResolvedValue([make([["Campanha de 02/11/2026 a 20/11/2026"], headers, article("001")])]);
  await mount({ dates: { dataInicio: "2026-11-05", dataFim: "2026-11-25" } }); await review();
  expect(host.querySelector('.price-import-date-panel input[type="date"]').value).toBe("2026-11-05");
  expect(button("Confirmar e guardar").disabled).toBe(true);
  await click(button("Confirmar as datas apresentadas"));
  // Confirming the conflict preserves per-item dates; it is not an implicit override.
  await click(button("Confirmar e guardar"));
  expect(onApply.mock.calls[0][0][0].dataInicio).toBe("01/11/2026");
});
test("invalid/missing table prices remain visible without a catalogue substitute", async () => {
  extractInWorker.mockResolvedValue([make([headers, article("001", "", "299,99"), article("002", "199,99", "")])]);
  await mount(); await review(); expect(input("Incluir 001").disabled).toBe(true); expect(input("Incluir 002").disabled).toBe(true);
  expect(host.textContent).toContain("Falta PVP2 Antes na tabela");
  await change(input("PVP2 Atual de 002"), "149,99"); await click(input("Incluir 002")); await click(button("Confirmar e guardar"));
  expect(onApply.mock.calls[0][0][0]).toMatchObject({ codigo: "002", antes: 199.99, atual: 149.99 });
});
test("manual price correction unselects the line; Before has no edit control", async () => {
  await mount(); await review(); await change(input("PVP2 Atual de 001"), "289,99");
  expect(input("Incluir 001").checked).toBe(false); expect(host.querySelector('input[aria-label^="PVP2 Antes"]')).toBeNull();
  await click(input("Incluir 001")); await click(button("Confirmar e guardar"));
  expect(rpc.mock.calls.find(([action]) => action === "confirm")[1].selected).toEqual([{ id: "row-1", cents: 28999, reviewed: false }]);
});
test("existing article remains excluded and cancelling makes no campaign write", async () => {
  await mount({ items: [{ codigo: "001" }] }); await review(); expect(input("Incluir 001").disabled).toBe(true);
  await click(button("Cancelar")); expect(onApply).not.toHaveBeenCalled(); expect(rpc.mock.calls.some(([action]) => action === "confirm")).toBe(false);
});
test("lost campaign-save response retries the same immutable prices and dates", async () => {
  onApply.mockRejectedValueOnce(new Error("Ligação interrompida")); await mount(); await review(); await click(button("Confirmar e guardar"));
  expect(host.textContent).toContain("Ligação interrompida"); expect(input("PVP2 Atual de 001").disabled).toBe(true); expect(input("Início de 001").disabled).toBe(true);
  await click(button("Repetir confirmação")); expect(onApply).toHaveBeenCalledTimes(2); expect(onApply.mock.calls[0]).toEqual(onApply.mock.calls[1]);
});
test("changing tenant cancels late preparation and never applies a campaign", async () => {
  let resolve; const pending = new Promise(done => { resolve = done; }); rpc.mockImplementationOnce(() => pending);
  await mount(); await source(); await click(button("Rever artigos"));
  await act(async () => window.dispatchEvent(new Event("promopilot:access-changed")));
  await act(async () => resolve({ id: "batch", rows: [] })); expect(onClose).toHaveBeenCalled(); expect(onApply).not.toHaveBeenCalled();
});
test("hundreds of articles are paginated, retaining the fixed footer outside scrolling content", async () => {
  extractInWorker.mockResolvedValue([make([headers, ...Array.from({ length: 500 }, (_, i) => article(String(i).padStart(5, "0")))])]);
  await mount(); await review(); expect(host.querySelectorAll('input[aria-label^="Incluir"]')).toHaveLength(50);
  expect(host.textContent).toContain("Página 1 de 10"); await click(button("Seguinte")); expect(host.textContent).toContain("Página 2 de 10");
  expect(host.querySelector(".price-import-footer").parentElement).toBe(host.querySelector("dialog"));
  expect(host.querySelector(".price-import-body .price-import-footer")).toBeNull();
});

test("manual creation accepts an ODS file through the shared importer", async () => {
  await mount();
  const file = new File(["ods-fixture"], "Fornecedor.ods", { type: "application/vnd.oasis.opendocument.spreadsheet" });
  file.arrayBuffer = jest.fn().mockResolvedValue(new Uint8Array([80, 75, 3, 4]).buffer);
  const upload = host.querySelector('input[type="file"]');
  await act(async () => { Object.defineProperty(upload, "files", { configurable: true, value: [file] }); upload.dispatchEvent(new Event("change", { bubbles: true })); });
  await click(button("Analisar tabela"));
  expect(extractInWorker).toHaveBeenCalledWith(expect.objectContaining({ name: "Fornecedor.ods", bytes: expect.any(ArrayBuffer) }), expect.any(AbortSignal));
  await click(button("Rever artigos")); await click(button("Confirmar e guardar")); expect(onApply.mock.calls[0][0][0].codigo).toBe("001");
});
test("manual dates survive changing the source table and new conflicts are reviewed again", async () => {
  extractInWorker.mockResolvedValue([make([headers, article("001", "350", "300", "", "")])]);
  await mount(); await source();
  const inputs = host.querySelectorAll('.price-import-date-panel input[type="date"]');
  await change(inputs[0], "2026-12-01"); await change(inputs[1], "2026-12-15");
  await click(button("Mudar tabela"));
  extractInWorker.mockResolvedValue([make([["Campanha de 01/11/2026 a 15/11/2026"], headers, article("001", "350", "300", "", "")])]);
  await click(button("Analisar tabela"));
  expect(host.querySelector('.price-import-date-panel input[type="date"]').value).toBe("2026-12-01");
  expect(button("Confirmar as datas apresentadas")).toBeTruthy();
});
