import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export const DOSSIER_PDF_LIMITS = { bytes: 50 * 1024 * 1024, sheetBytes: 10 * 1024 * 1024, sheets: 50, pages: 200 };
const issue = (code, equipmentNumber) => Object.assign(new Error(code), { code, equipmentNumber });

async function load(bytes, equipmentNumber) {
  try {
    // Inspect the encryption flag and reject before reading/copying any page.
    // pdf-lib 1.17's Error subclasses do not reliably preserve instanceof/name.
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: true, updateMetadata: false });
    if (pdf.isEncrypted) throw issue("ENCRYPTED", equipmentNumber);
    if (!pdf.getPageCount()) throw issue("EMPTY", equipmentNumber);
    if (equipmentNumber && pdf.getForm().getFields().length) throw issue("INTERACTIVE", equipmentNumber);
    return pdf;
  } catch (error) {
    if (error.code) throw error;
    throw issue("INVALID", equipmentNumber);
  }
}

// Keep static annotations and ordinary web links. Never carry launch actions,
// scripts, embedded files or automatic actions into the customer's dossier.
function cleanPage(page) {
  page.node.delete(PDFName.of("AA"));
  const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (!annotations) return;
  for (let i = annotations.size() - 1; i >= 0; i--) {
    const annotation = annotations.lookup(i, PDFDict);
    const subtype = annotation.get(PDFName.of("Subtype"))?.toString();
    if (["/FileAttachment", "/RichMedia", "/Screen", "/Movie", "/Sound", "/3D"].includes(subtype)) { annotations.remove(i); continue; }
    if (subtype === "/Widget") throw issue("INTERACTIVE");
    annotation.delete(PDFName.of("AA"));
    const action = annotation.lookupMaybe(PDFName.of("A"), PDFDict);
    if (!action) continue;
    const uri = action.lookupMaybe(PDFName.of("URI"), PDFString, PDFHexString)?.decodeText();
    if (action.get(PDFName.of("S"))?.toString() === "/URI" && /^https?:\/\//i.test(uri || "")) action.delete(PDFName.of("Next"));
    else annotation.delete(PDFName.of("A"));
  }
}

function printable(value, font) {
  return Array.from(String(value || "").normalize("NFC").replace(/\s+/g, " "), character => {
    try { font.encodeText(character); return character; } catch { return "?"; }
  }).join("");
}
function wrap(value, font, size, width) {
  const lines = []; let line = "";
  for (const character of value) {
    if (line && font.widthOfTextAtSize(line + character, size) > width) {
      const space = line.lastIndexOf(" ");
      if (space > line.length / 2) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
      else { lines.push(line); line = ""; }
    }
    line += character;
  }
  lines.push(line); return lines.join("\n");
}
function separator(pdf, fonts, sheet, number, pageCount) {
  const page = pdf.addPage([595.28, 841.89]), margin = 48, width = 499;
  page.drawRectangle({ x: margin, y: 770, width: 5, height: 30, color: rgb(.92, .40, .03) });
  page.drawText(`ANEXO ${number}  /  FICHA TÉCNICA`, { x: 65, y: 779, size: 11, font: fonts.bold, color: rgb(.20, .31, .40) });
  page.drawText(`Equipamento ${sheet.equipmentNumber}`, { x: margin, y: 707, size: 25, font: fonts.bold, color: rgb(.09, .17, .23) });
  page.drawText(wrap(printable(sheet.title, fonts.bold).slice(0, 220), fonts.bold, 15, width), { x: margin, y: 664, size: 15, lineHeight: 22, font: fonts.bold });
  page.drawLine({ start: { x: margin, y: 430 }, end: { x: margin + width, y: 430 }, thickness: .6, color: rgb(.82, .86, .90) });
  page.drawText(wrap(printable(sheet.name, fonts.regular), fonts.regular, 11, width), { x: margin, y: 403, size: 11, lineHeight: 16, font: fonts.regular });
  page.drawText(`${pageCount} página(s) da ficha nas páginas seguintes.`, { x: margin, y: 320, size: 11, font: fonts.regular });
  page.drawText("PromoPilot - Dossier de equipamentos", { x: margin, y: 47, size: 9, font: fonts.regular, color: rgb(.33, .40, .46) });
}

// Pure merge engine; parsing runs in a terminable browser worker, never on the
// React thread. Blob bytes stay local and original drafts remain immutable.
export async function mergeDossierPdfs({ dossier, sheets, fontBytes }) {
  if (!sheets.length) return new Uint8Array(await dossier.arrayBuffer());
  if (sheets.length > DOSSIER_PDF_LIMITS.sheets || sheets.reduce((n, sheet) => n + sheet.blob.size, dossier.size) > DOSSIER_PDF_LIMITS.bytes) throw issue("LIMIT");
  const pdf = await load(await dossier.arrayBuffer());
  if (!fontBytes?.byteLength) throw issue("FONT");
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const fonts = { regular: font, bold: font };
  let pages = 0;
  for (const [index, sheet] of sheets.entries()) {
    try {
      if (!sheet.blob.size || sheet.blob.size > DOSSIER_PDF_LIMITS.sheetBytes) throw issue("LIMIT", sheet.equipmentNumber);
      const source = await load(await sheet.blob.arrayBuffer(), sheet.equipmentNumber);
      pages += source.getPageCount();
      if (pages > DOSSIER_PDF_LIMITS.pages) throw issue("LIMIT", sheet.equipmentNumber);
      for (const page of source.getPages()) cleanPage(page);
      separator(pdf, fonts, sheet, index + 1, source.getPageCount());
      const copied = await pdf.copyPages(source, source.getPageIndices());
      copied.forEach(page => pdf.addPage(page));
    } catch (error) { throw issue(error.code || "INVALID", sheet.equipmentNumber); }
  }
  return pdf.save();
}
