import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import TechnicalPdfAttachment from "./TechnicalPdfAttachment";
import { prepareTechnicalPdf } from "./dossierTechnicalPdf";
jest.mock("./dossierTechnicalPdf", () => ({ ...jest.requireActual("./dossierTechnicalPdf"), prepareTechnicalPdf: jest.fn() }));
let root, host, current, busy;
const sheet = (name = "Ficha.pdf") => ({ name, blob: new Blob(["%PDF-1.7\n%%EOF"], { type: "application/pdf" }) });
function Harness({ initial }) {
  const [value, setValue] = useState(initial); current = value;
  return <TechnicalPdfAttachment value={value} equipmentNumber={1} onChange={setValue} onReadingChange={busy} />;
}
beforeEach(() => {
  jest.clearAllMocks(); global.IS_REACT_ACT_ENVIRONMENT = true; busy = jest.fn();
  URL.createObjectURL = jest.fn().mockReturnValueOnce("blob:qa-one").mockReturnValue("blob:qa-two"); URL.revokeObjectURL = jest.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  prepareTechnicalPdf.mockResolvedValue(sheet());
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks(); });
async function mount(initial) { await act(async () => root.render(<Harness initial={initial} />)); }
async function choose() {
  const input = host.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["%PDF-1.7\n%%EOF"], "Ficha.pdf", { type: "application/pdf" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
const button = text => [...host.querySelectorAll("button")].find(node => node.textContent === text);
test("upload exposes a direct new-tab link and a download with the original filename", async () => {
  await mount(); await choose();
  const open = [...host.querySelectorAll("a")].find(node => node.textContent === "Abrir PDF");
  expect(open.getAttribute("href")).toBe("blob:qa-one"); expect(open.target).toBe("_blank"); expect(open.rel).toBe("noopener noreferrer");
  expect(host.querySelector("a[download]").download).toBe("Ficha.pdf"); expect(current.blob.type).toBe("application/pdf");
  expect(busy.mock.calls).toEqual([[true], [false]]);
});
test("a restored Blob gets a fresh URL; no expired URL is persisted", async () => {
  const attachment = sheet(); await mount(attachment);
  expect(URL.createObjectURL).toHaveBeenCalledWith(attachment.blob);
  await act(async () => root.unmount()); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa-one");
  root = createRoot(host); await mount(attachment);
  expect(host.querySelector("a").getAttribute("href")).toBe("blob:qa-two");
});
test("invalid replacements keep the current attachment openable", async () => {
  const original = sheet("Original.pdf"); await mount(original);
  prepareTechnicalPdf.mockRejectedValue(new Error("PDF inválido")); await choose();
  expect(current).toBe(original); expect(host.textContent).toContain("PDF inválido"); expect(host.querySelector("a").getAttribute("href")).toBe("blob:qa-one");
});
test("replacement releases the old URL and removal requires confirmation", async () => {
  await mount(sheet("Original.pdf")); await choose();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa-one");
  await act(async () => button("Remover").click()); expect(current).not.toBeNull();
  await act(async () => button("Cancelar").click()); expect(current).not.toBeNull();
  await act(async () => button("Remover").click()); await act(async () => button("Confirmar remoção").click());
  expect(current).toBeNull(); expect(host.querySelector("a")).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa-two");
});
test("a late result after the editor unmounts cannot attach to a new dossier", async () => {
  let finish; prepareTechnicalPdf.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount(); await choose(); const signal = prepareTechnicalPdf.mock.calls[0][1].signal;
  await act(async () => root.unmount()); expect(signal.aborted).toBe(true);
  await act(async () => finish(sheet())); expect(current).toBeUndefined();
  root = createRoot(host); await mount(); expect(host.querySelector("a")).toBeNull();
});
