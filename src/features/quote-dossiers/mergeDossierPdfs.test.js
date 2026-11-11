/** @jest-environment node */
import { Blob } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFName, PDFArray, PDFDict, degrees, StandardFonts } from "pdf-lib";
import { mergeDossierPdfs as merge } from "./mergeDossierPdfs";
const fontBytes = fs.readFileSync(path.join(process.cwd(), "src/features/quote-dossiers/assets/DejaVuSans.ttf"));
const mergeDossierPdfs = data => merge({ ...data, fontBytes });
async function source(label, sizes = [[595, 842]], customize) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  sizes.forEach((size, i) => { const page = pdf.addPage(size); page.drawText(`${label} - ${i + 1}`, { x: 20, y: 40, font }); });
  if (customize) customize(pdf);
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
const sheet = (blob, equipmentNumber = 1) => ({ blob, name: "Ficha técnica.pdf", title: "Fabricante - Modelo", equipmentNumber });
function contents(pdf, page) {
  const value = pdf.getPage(page).node.Contents();
  const streams = value instanceof PDFArray ? value.asArray().map(ref => pdf.context.lookup(ref)) : [value];
  return streams.map(stream => Array.from(stream.getContents()));
}
test("all original pages follow the dossier with one separator per correct equipment", async () => {
  const base = await source("DOSSIER", [[595, 842], [595, 842]]);
  const first = await source("FICHA A", [[420, 595], [842, 595]], pdf => { pdf.getPage(1).setRotation(degrees(90)); pdf.getPage(0).setCropBox(10, 10, 400, 570); });
  const second = await source("FICHA B", [[600, 800]]);
  const merged = await PDFDocument.load(await mergeDossierPdfs({ dossier: base, sheets: [sheet(first, 2), sheet(second, 4)] }));
  expect(merged.getPageCount()).toBe(7);
  expect(merged.getPage(3).getSize()).toEqual({ width: 420, height: 595 });
  expect(merged.getPage(3).getCropBox()).toEqual({ x: 10, y: 10, width: 400, height: 570 });
  expect(merged.getPage(4).getRotation().angle).toBe(90);
  const original = await PDFDocument.load(await first.arrayBuffer());
  expect(contents(merged, 3)).toEqual(contents(original, 0));
  expect(contents(merged, 4)).toEqual(contents(original, 1));
  expect(contents(merged, 0)).toEqual(contents(await PDFDocument.load(await base.arrayBuffer()), 0));
});
test("no attachments leaves the original PDF bytes unchanged", async () => {
  const base = await source("BASE");
  expect(await mergeDossierPdfs({ dossier: base, sheets: [] })).toEqual(new Uint8Array(await base.arrayBuffer()));
});
test("invalid, encrypted and interactive sheets fail the whole merge with equipment identity", async () => {
  const base = await source("BASE");
  await expect(mergeDossierPdfs({ dossier: base, sheets: [sheet(new Blob(["%PDF-1.7\n%%EOF"]), 3)] })).rejects.toMatchObject({ code: "INVALID", equipmentNumber: 3 });
  const interactive = await source("FORM", [[595, 842]], pdf => pdf.getForm().createTextField("model").addToPage(pdf.getPage(0)));
  await expect(mergeDossierPdfs({ dossier: base, sheets: [sheet(interactive, 2)] })).rejects.toMatchObject({ code: "INTERACTIVE", equipmentNumber: 2 });
  const protectedPdf = await source("ENCRYPTED", [[595, 842]], pdf => { pdf.context.trailerInfo.Encrypt = pdf.context.register(pdf.context.obj({ Filter: "Standard" })); });
  await expect(mergeDossierPdfs({ dossier: base, sheets: [sheet(protectedPdf)] })).rejects.toMatchObject({ code: "ENCRYPTED" });
});
test("limits reject excessive files and pages without returning a partial dossier", async () => {
  const base = await source("BASE");
  await expect(mergeDossierPdfs({ dossier: base, sheets: [sheet({ size: 60 * 1024 * 1024 })] })).rejects.toMatchObject({ code: "LIMIT" });
  const many = await source("PAGES", Array.from({ length: 201 }, () => [200, 200]));
  await expect(mergeDossierPdfs({ dossier: base, sheets: [sheet(many)] })).rejects.toMatchObject({ code: "LIMIT" });
});
test("imported page scripts are removed while ordinary static content stays", async () => {
  const base = await source("BASE");
  const attachment = await source("STATIC", [[595, 842]], pdf => {
    const action = pdf.context.obj({ S: "JavaScript", JS: "app.alert('not allowed')" });
    pdf.getPage(0).node.set(PDFName.of("AA"), pdf.context.obj({ O: action }));
    const annot = pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 20, 20], A: action });
    pdf.getPage(0).node.set(PDFName.of("Annots"), pdf.context.obj([pdf.context.register(annot)]));
  });
  const merged = await PDFDocument.load(await mergeDossierPdfs({ dossier: base, sheets: [sheet(attachment)] }));
  const page = merged.getPage(2);
  expect(page.node.has(PDFName.of("AA"))).toBe(false);
  expect(page.node.lookup(PDFName.of("Annots"), PDFArray).lookup(0, PDFDict).has(PDFName.of("A"))).toBe(false);
});
