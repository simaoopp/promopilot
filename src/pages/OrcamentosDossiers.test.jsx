import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import OrcamentosDossiers from "./OrcamentosDossiers";
import FeatureRoute from "../components/FeatureRoute";
import { PermissionProvider, usePermissions } from "../context/PermissionContext";
import { useAuth } from "../context/AuthContext";
import { loadAccess } from "../services/platformService";
import { extractQuoteDossier, generateQuoteDossierPdf } from "../services/quoteDossierService";
import { createDossierDraftStore, getDossierDraftStore } from "../features/quote-dossiers/dossierDraftStore";
import { resizeDossierImage } from "../features/quote-dossiers/dossierImage";
import { prepareTechnicalPdf } from "../features/quote-dossiers/dossierTechnicalPdf";
import { authIssue } from "../utils/authErrors";
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../services/platformService", () => ({ loadAccess: jest.fn(), setPermissionSnapshot: jest.fn(), selectAccess: jest.fn() }));
jest.mock("../services/quoteDossierService", () => ({ extractQuoteDossier: jest.fn(), generateQuoteDossierPdf: jest.fn() }));
jest.mock("../features/quote-dossiers/dossierTechnicalPdf", () => ({ ...jest.requireActual("../features/quote-dossiers/dossierTechnicalPdf"), prepareTechnicalPdf: jest.fn() }));
jest.mock("../features/quote-dossiers/dossierImage", () => ({ resizeDossierImage: jest.fn() }));
jest.mock("../features/quote-dossiers/dossierDraftStore", () => ({ ...jest.requireActual("../features/quote-dossiers/dossierDraftStore"), getDossierDraftStore: jest.fn() }));
let root, host, permission, disk, records, auth;
const access = (org = "org-a") => ({ organizationId: org, storeId: "store-a", organizations: [{ id: org }], stores: [], pages: [{ page_key: "dossiers" }], permissions: {} });
function Probe() { permission = usePermissions(); return null; }
function tree() { return <MemoryRouter><PermissionProvider><Probe /><FeatureRoute page="dossiers"><OrcamentosDossiers /></FeatureRoute></PermissionProvider></MemoryRouter>; }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(console, "warn").mockImplementation(() => {});
  auth = { user: { id: "user-a" }, authStatus: "authenticated", loadingProfile: false, profileError: "", updateAccessContext: jest.fn() };
  useAuth.mockImplementation(() => auth); loadAccess.mockResolvedValue(access());
  records = new Map(); disk = { read: async key => records.get(key), write: async record => records.set(record.key, record), remove: async key => records.delete(key) };
  getDossierDraftStore.mockReturnValue(createDossierDraftStore(disk, "tab-a"));
  extractQuoteDossier.mockResolvedValue({ dossier: { budgetNumber: "QA/1", customerName: "Demonstração", items: [{ articleCode: "ORÇ000QA", brand: "QA", reference: "MODEL 001", total: "4299,99", features: [] }] } });
  resizeDossierImage.mockResolvedValue("data:image/jpeg;base64,cGhvdG8=");
  let pdfUrl = 0; URL.createObjectURL = jest.fn(() => `blob:sheet-${++pdfUrl}`); URL.revokeObjectURL = jest.fn();
  prepareTechnicalPdf.mockResolvedValue({ name: "ficha-qa.pdf", blob: new Blob(["%PDF-1.7\n%%EOF"], { type: "application/pdf" }) });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.useRealTimers(); jest.restoreAllMocks(); });
async function mount() { await act(async () => root.render(tree())); }
function button(text) { return [...host.querySelectorAll("button")].find(node => node.textContent === text); }
function field(label) { return [...host.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent === label)?.querySelector("input,textarea"); }
async function edit(label, value) {
  await act(async () => { const input = field(label); Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function extract() {
  const input = host.querySelector('input[accept="application/pdf"]');
  Object.defineProperty(input, "files", { configurable: true, value: [{ name: "qa.pdf", size: 5, arrayBuffer: async () => new ArrayBuffer(5) }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await act(async () => button("Extrair orçamento").click());
  if (button("Substituir rascunho")) await act(async () => button("Substituir rascunho").click());
}
async function paste(data, index = 0) {
  const target = host.querySelectorAll(".quote-image-paste")[index];
  const event = new Event("paste", { bubbles: true, cancelable: true }); Object.defineProperty(event, "clipboardData", { value: data });
  await act(async () => target.dispatchEvent(event)); return event;
}
test("three access outages and retries preserve edits and pasted photographs", async () => {
  await mount(); await extract(); await edit("Cliente", "Cliente revisto"); await edit("Características manuais (uma por linha)", "Cor: Branco\n");
  await paste({ items: [{ kind: "file", type: "image/png", getAsFile: () => ({ type: "image/png", size: 3 }) }] });
  for (let i = 0; i < 3; i++) {
    loadAccess.mockRejectedValueOnce(authIssue("NETWORK_ERROR", 503));
    await act(async () => permission.refresh());
    expect(host.textContent).toContain("Tentar novamente"); expect(field("Cliente")).toBeUndefined();
    await act(async () => button("Tentar novamente").click());
    expect(field("Cliente").value).toBe("Cliente revisto");
    expect(field("Características manuais (uma por linha)").value).toBe("Cor: Branco\n");
    expect(host.querySelector(".quote-image-paste img").src).toBe("data:image/jpeg;base64,cGhvdG8=");
  }
  expect(extractQuoteDossier).toHaveBeenCalledTimes(1);
});
test("a page reload recovers the persisted draft with a fresh in-memory store", async () => {
  await mount(); await extract(); await edit("Observações", "Preservar após F5");
  await act(async () => root.unmount()); getDossierDraftStore.mockReturnValue(createDossierDraftStore(disk, "tab-a")); root = createRoot(host);
  await mount(); expect(field("Observações").value).toBe("Preservar após F5"); expect(host.textContent).toContain("Rascunho recuperado");
});
test("another organization never displays the previous draft", async () => {
  await mount(); await extract(); await edit("Cliente", "Organização A");
  loadAccess.mockResolvedValue(access("org-b")); await act(async () => permission.refresh());
  expect(field("Cliente")).toBeUndefined(); expect(host.textContent).not.toContain("Organização A");
  loadAccess.mockResolvedValue(access()); await act(async () => permission.refresh()); expect(field("Cliente").value).toBe("Organização A");
});
test("PDF and extraction failures preserve the editable draft", async () => {
  await mount(); await extract(); await edit("Descrição geral manual", "Texto revisto");
  generateQuoteDossierPdf.mockRejectedValue(new Error("Ligação indisponível"));
  await act(async () => button("Gerar dossier PDF").click()); expect(field("Descrição geral manual").value).toBe("Texto revisto");
  extractQuoteDossier.mockRejectedValue(new Error("PDF inválido")); await extract();
  expect(field("Descrição geral manual").value).toBe("Texto revisto");
});
test("malformed API rows are reported without replacing a valid draft or crashing React", async () => {
  await mount(); await extract(); extractQuoteDossier.mockResolvedValue({ dossier: { items: [null] } }); await extract();
  expect(field("Cliente").value).toBe("Demonstração"); expect(host.textContent).toContain("Equipamento inválido");
});
test("pasting an image targets the selected equipment while plain text/URLs are not intercepted", async () => {
  await mount(); await extract();
  const plain = await paste({ items: [{ kind: "string", type: "text/plain" }] }); expect(plain.defaultPrevented).toBe(false); expect(resizeDossierImage).not.toHaveBeenCalled();
  const file = { type: "image/png", size: 30 }; const picture = await paste({ files: [file] });
  expect(picture.defaultPrevented).toBe(true); expect(resizeDossierImage).toHaveBeenCalledWith(file);
  expect(host.querySelector(".quote-image-paste img")).not.toBeNull();
});
test("upload still works and a rejected pasted photo keeps the previous image", async () => {
  await mount(); await extract(); const input = host.querySelector('input[accept^="image/png"]');
  Object.defineProperty(input, "files", { configurable: true, value: [{ type: "image/jpeg", size: 30 }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  resizeDossierImage.mockRejectedValue(new Error("Imagem inválida")); await paste({ files: [{ type: "image/png" }] });
  expect(host.textContent).toContain("Imagem inválida"); expect(host.querySelector(".quote-image-paste img").src).toBe("data:image/jpeg;base64,cGhvdG8=");
});
test("clearing needs an explicit confirmation and removes only this draft", async () => {
  await mount(); await extract();
  await act(async () => button("Novo dossier").click()); expect(field("Cliente")).toBeDefined();
  await act(async () => button("Cancelar").click()); expect(field("Cliente")).toBeDefined();
  await act(async () => button("Novo dossier").click());
  await act(async () => button("Eliminar rascunho").click());
  expect(field("Cliente")).toBeUndefined(); expect(records.size).toBe(0);
});
test("a storage deletion failure is visible instead of claiming the saved draft was removed", async () => {
  await mount(); await extract(); disk.remove = async () => { throw new Error("Storage unavailable"); };
  await act(async () => button("Novo dossier").click()); await act(async () => button("Eliminar rascunho").click());
  expect(host.textContent).toContain("Não foi possível eliminar a cópia guardada");
  disk.remove = async key => records.delete(key); await act(async () => button("Repetir eliminação").click());
  expect(host.textContent).not.toContain("Não foi possível eliminar"); expect(records.size).toBe(0);
});

test("paste applies to the focused equipment and waits for conversion before PDF generation", async () => {
  extractQuoteDossier.mockResolvedValue({ dossier: { budgetNumber: "QA/2", items: [{ articleCode: "QA001" }, { articleCode: "QA002" }] } });
  let finish; resizeDossierImage.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount(); await extract(); await paste({ files: [{ type: "image/png", size: 3 }] }, 1);
  expect(button("Gerar dossier PDF").disabled).toBe(true);
  await act(async () => finish("data:image/jpeg;base64,cGhvdG8="));
  expect(button("Gerar dossier PDF").disabled).toBe(false);
  const targets = host.querySelectorAll(".quote-image-paste");
  expect(targets[0].querySelector("img")).toBeNull(); expect(targets[1].querySelector("img")).not.toBeNull();
});

async function attachPdf(index = 0) {
  const input = host.querySelectorAll('input[accept="application/pdf,.pdf"]')[index];
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["%PDF-1.7\n%%EOF"], "ficha-qa.pdf", { type: "application/pdf" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
test("technical PDF stays with its equipment after access retry and page reload", async () => {
  extractQuoteDossier.mockResolvedValue({ dossier: { budgetNumber: "QA/2", items: [{ articleCode: "QA001" }, { articleCode: "QA002" }] } });
  await mount(); await extract(); await attachPdf(1);
  let sections = host.querySelectorAll(".quote-technical-pdf");
  expect(sections[0].querySelector("a")).toBeNull(); expect(sections[1].textContent).toContain("ficha-qa.pdf");
  loadAccess.mockRejectedValueOnce(authIssue("NETWORK_ERROR", 503)); await act(async () => permission.refresh());
  await act(async () => button("Tentar novamente").click()); expect(host.querySelectorAll(".quote-technical-pdf")[1].querySelector("a").textContent).toBe("Abrir PDF");
  await act(async () => root.unmount()); getDossierDraftStore.mockReturnValue(createDossierDraftStore(disk, "tab-a")); root = createRoot(host);
  await mount(); sections = host.querySelectorAll(".quote-technical-pdf");
  expect(sections[0].querySelector("a")).toBeNull(); expect(sections[1].querySelector("a").getAttribute("href")).toMatch(/^blob:sheet-/);
  expect(sections[1].textContent).toContain("ficha-qa.pdf");
});
test("a pending technical PDF cannot be lost by generating or replacing the dossier mid-read", async () => {
  let finish; prepareTechnicalPdf.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount(); await extract(); await attachPdf();
  expect(button("Gerar dossier PDF").disabled).toBe(true); expect(button("Novo dossier").disabled).toBe(true);
  await act(async () => finish({ name: "ficha.pdf", blob: new Blob(["%PDF-1.7\n%%EOF"], { type: "application/pdf" }) }));
  expect(button("Gerar dossier PDF").disabled).toBe(false); expect(button("Novo dossier").disabled).toBe(false);
  expect(host.querySelector(".quote-technical-pdf a").textContent).toBe("Abrir PDF");
});
