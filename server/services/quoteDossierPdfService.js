import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import { normalizeDossierText as text, dossierFeatureRows, descriptionSource } from "./quoteDossierText.js";

const MARGIN = 42;
const TOP = 90;
const INK = "#172b3a";
const MUTED = "#536575";
const ORANGE = "#ec6707";
const BORDER = "#dce4e9";
const SOFT = "#f3f6f8";
const REGULAR = "Dossier-Regular";
const BOLD = "Dossier-Bold";
const regularPath = fileURLToPath(new URL("../../assets/fonts/DejaVuSans.ttf", import.meta.url));
const boldPath = fileURLToPath(new URL("../../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url));

function title(item = {}) {
  return text(item.title || item.description || item.rawDescription || [item.brand, item.reference].filter(Boolean).join(" ") || "Equipamento").replace(/\s+/g, " ");
}
function euro(value) {
  const clean = text(value);
  return !clean ? "Não indicado" : clean.includes("€") ? clean : `${clean} €`;
}
function quantity(value) {
  const clean = text(value);
  return !clean ? "Não indicada" : /un\.?$/i.test(clean) ? clean : `${clean.replace(/,00$/, "")} un.`;
}
function style(doc, { bold = false, size = 10, color = INK } = {}) {
  return doc.font(bold ? BOLD : REGULAR).fontSize(size).fillColor(color);
}
function height(doc, value, width, options = {}) {
  style(doc, options);
  return value ? doc.heightOfString(value, { width, lineGap: 2, paragraphGap: 0 }) : 0;
}
function write(doc, value, x, y, width, options = {}) {
  const h = height(doc, value, width, options);
  doc.text(value, x, y, { width, height: h + 0.1, lineGap: 2, paragraphGap: 0, ...options });
  return h;
}

// Split without ellipsis or losing characters. Measurements use the same
// embedded font and spacing as the final output, including long unbroken codes.
function fittingText(doc, value, width, available, options) {
  if (!value) return ["", ""];
  if (height(doc, value, width, options) <= available) return [value, ""];
  const characters = Array.from(value);
  let low = 0, high = characters.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (height(doc, characters.slice(0, mid).join(""), width, options) <= available) low = mid;
    else high = mid - 1;
  }
  if (!low) throw new Error("Não foi possível paginar o texto do dossier.");
  const prefix = characters.slice(0, low).join("");
  const boundary = Math.max(prefix.lastIndexOf(" "), prefix.lastIndexOf("\n"));
  if (boundary > prefix.length / 2) low = Array.from(prefix.slice(0, boundary)).length;
  return [characters.slice(0, low).join("").trimEnd(), characters.slice(low).join("").trimStart()];
}

class Layout {
  constructor(doc, dossier) {
    this.doc = doc;
    this.dossier = dossier;
    this.width = doc.page?.width || 595.28;
    this.width -= MARGIN * 2;
    this.y = TOP;
    this.pageNumber = 0;
    this.pageTitle = "Resumo do dossier";
  }
  get bottom() { return this.doc.page.height - 82; }
  newPage(pageTitle = this.pageTitle) {
    if (this.pageNumber) this.footer();
    this.doc.addPage();
    this.pageNumber++;
    this.pageTitle = pageTitle;
    const doc = this.doc;
    doc.rect(MARGIN, 26, 82, 28).fill(ORANGE);
    write(doc, "expert", MARGIN, 29, 82, { bold: true, size: 15, color: "#ffffff", align: "center" });
    write(doc, "DOSSIER DE EQUIPAMENTOS", MARGIN + 98, 26, this.width - 98, { bold: true, size: 8, color: MUTED, align: "right" });
    // Header identifiers can be long; full values are retained in the body.
    const header = fittingText(doc, text(this.dossier.budgetNumber), this.width - 98, 14, { size: 9 })[0];
    write(doc, header, MARGIN + 98, 40, this.width - 98, { size: 9, color: MUTED, align: "right" });
    doc.moveTo(MARGIN, 67).lineTo(MARGIN + this.width, 67).lineWidth(0.7).strokeColor(BORDER).stroke();
    this.y = TOP;
    if (this.pageNumber > 1 && /continuação$/.test(pageTitle)) {
      this.y += write(doc, pageTitle, MARGIN, this.y, this.width, { size: 9, color: MUTED }) + 14;
    }
  }
  continuation() {
    const label = this.pageTitle.replace(/ - continuação$/, "");
    this.newPage(`${label} - continuação`);
  }
  ensure(space) { if (this.y + space > this.bottom) this.continuation(); }
  footer() {
    const doc = this.doc, y = doc.page.height - 47;
    doc.moveTo(MARGIN, y - 12).lineTo(MARGIN + this.width, y - 12).lineWidth(0.7).strokeColor(BORDER).stroke();
    write(doc, "Características dos equipamentos", MARGIN, y, this.width - 92, { size: 8, color: MUTED });
    write(doc, `Página ${this.pageNumber}`, MARGIN + this.width - 92, y, 92, { size: 8, color: MUTED, align: "right" });
  }
  paragraph(value, options = {}) {
    let remaining = text(value);
    while (remaining) {
      this.ensure(height(this.doc, "Ag", this.width, options) + 2);
      const [part, rest] = fittingText(this.doc, remaining, this.width, this.bottom - this.y, options);
      this.y += write(this.doc, part, MARGIN, this.y, this.width, options) + 10;
      remaining = rest;
      if (remaining) this.continuation();
    }
  }
  section(value) {
    this.ensure(58);
    this.y += write(this.doc, value, MARGIN, this.y, this.width, { bold: true, size: 12 }) + 12;
  }
  table(rows, { x = MARGIN, width = this.width, labelWidth = 170 } = {}) {
    for (const [labelValue, fieldValue] of rows) {
      let label = text(labelValue), value = text(fieldValue) || "Não indicado";
      const hasLabel = Boolean(label), lw = hasLabel ? labelWidth : 0;
      const labelOptions = { size: 9.5, bold: true }, valueOptions = { size: 10 };
      const lh = () => height(this.doc, label, lw - 18, labelOptions);
      const vh = () => height(this.doc, value, width - lw - 18, valueOptions);
      const wholeHeight = Math.max(hasLabel ? lh() : 0, vh()) + 18;
      // Keep normal rows together; an exceptionally long row can continue.
      if (wholeHeight <= this.bottom - TOP - 38) this.ensure(wholeHeight);
      while (label || value) {
        this.ensure(Math.min(wholeHeight, 44));
        const available = this.bottom - this.y - 18;
        const [labelPart, labelRest] = hasLabel ? fittingText(this.doc, label, lw - 18, available, labelOptions) : ["", ""];
        const [valuePart, valueRest] = fittingText(this.doc, value, width - lw - 18, available, valueOptions);
        const rowHeight = Math.max(hasLabel ? height(this.doc, labelPart, lw - 18, labelOptions) : 0, height(this.doc, valuePart, width - lw - 18, valueOptions)) + 18;
        this.doc.rect(x, this.y, width, rowHeight).fillAndStroke("#ffffff", BORDER);
        if (hasLabel) {
          this.doc.rect(x, this.y, lw, rowHeight).fillAndStroke(SOFT, BORDER);
          write(this.doc, labelPart, x + 9, this.y + 9, lw - 18, labelOptions);
        }
        write(this.doc, valuePart, x + lw + 9, this.y + 9, width - lw - 18, valueOptions);
        this.y += rowHeight;
        label = labelRest; value = valueRest;
        if (label || value) this.continuation();
      }
    }
  }
}

function imageBuffer(value) {
  const match = String(value || "").match(/^data:image\/(?:png|jpe?g);base64,([a-z\d+/=\s]+)$/i);
  return match ? Buffer.from(match[1], "base64") : null;
}
function imageBox(doc, buffer, x, y, width, boxHeight) {
  doc.rect(x, y, width, boxHeight).fillAndStroke("#ffffff", BORDER);
  try {
    doc.image(buffer, x + 10, y + 10, { fit: [width - 20, boxHeight - 20], align: "center", valign: "center" });
  } catch {
    write(doc, "Fotografia indisponível", x + 10, y + boxHeight / 2 - 8, width - 20, { size: 9, color: MUTED, align: "center" });
  }
}

function summary(layout, dossier) {
  layout.newPage("Resumo do dossier");
  layout.paragraph("Características dos equipamentos", { bold: true, size: 23 });
  layout.paragraph("Identificação e informação técnica dos equipamentos incluídos no orçamento.", { size: 10.5, color: MUTED });
  layout.y += 8;
  layout.table([
    ["Orçamento", dossier.budgetNumber], ["Cliente", dossier.customerName],
    ["Data do orçamento", dossier.date], ["Total do orçamento", euro(dossier.total)],
    ["Equipamentos / elementos", String(dossier.items.length)],
  ]);
  layout.y += 24;
  const notes = text(dossier.notes).split(/\n+/).filter(line => !/pronto\s+pagamento|condi[çc][aã]o\s+de\s+pagamento/i.test(line));
  if (notes.some(Boolean)) {
    layout.section("Observações do orçamento");
    layout.paragraph(notes.join("\n"));
    layout.y += 12;
  }
  layout.section("Equipamentos incluídos");
  dossier.items.forEach((item, index) => layout.paragraph(`${index + 1}. ${title(item)}`, { size: 10.5 }));
  if (!dossier.items.length) layout.paragraph("Não foram adicionados equipamentos.", { color: MUTED });
}

function product(layout, item, index) {
  layout.newPage(`Equipamento ${index + 1}`);
  layout.paragraph(`${index + 1}. ${title(item)}`, { bold: true, size: 17 });
  layout.y += 6;
  const rows = [
    ["Categoria", item.category], ["Referência", item.reference], ["EAN", item.ean],
    ["Quantidade", quantity(item.quantity)], ["Valor no orçamento", euro(item.total || item.unitPrice)],
  ];
  const photo = imageBuffer(item.imageDataUrl);
  const photoWidth = 172, photoHeight = 174;
  const infoWidth = layout.width - photoWidth - 16;
  const infoHeight = rows.reduce((sum, [label, value]) => sum + Math.max(
    height(layout.doc, text(label), 92 - 18, { size: 9.5, bold: true }),
    height(layout.doc, text(value) || "Não indicado", infoWidth - 92 - 18, { size: 10 }),
  ) + 18, 0);
  if (photo && infoHeight <= 240) {
    layout.ensure(Math.max(infoHeight, photoHeight));
    const top = layout.y;
    layout.table(rows, { width: infoWidth, labelWidth: 92 });
    imageBox(layout.doc, photo, MARGIN + layout.width - photoWidth, top, photoWidth, photoHeight);
    layout.y = Math.max(layout.y, top + photoHeight) + 22;
  } else {
    layout.table(rows); layout.y += 22;
    if (photo) {
      layout.ensure(photoHeight);
      imageBox(layout.doc, photo, MARGIN, layout.y, layout.width, photoHeight);
      layout.y += photoHeight + 22;
    }
  }
  const description = text(item.technicalDescription), source = descriptionSource(description);
  if (source) {
    layout.section("Fonte de informação");
    layout.paragraph(`Consultar ficha do produto - ${source.label}`, { size: 9.5, color: MUTED, link: source.url, underline: true });
  } else if (description) {
    layout.section("Descrição geral"); layout.paragraph(description);
  }
  layout.y += 8;
  layout.section("Características técnicas");
  const features = dossierFeatureRows(item.features);
  if (features.length) layout.table(features);
  else layout.paragraph("Não foram adicionadas características técnicas.", { color: MUTED });
}

export async function generateQuoteDossierPdf({ dossier = {}, items = [] } = {}) {
  return new Promise((resolve, reject) => {
    const finalDossier = { ...dossier, items: Array.isArray(items) ? items : [] };
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: false, info: {
      Title: `${text(dossier.budgetNumber) || "Orçamento"} - Características dos equipamentos`,
      Author: "PromoPilot", Subject: "Dossier técnico manual",
    } });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk)); doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      // Bundled and subset-embedded: independent of fonts installed on Render or
      // the customer's PDF reader. Preserve accents and technical Unicode units.
      doc.registerFont(REGULAR, regularPath); doc.registerFont(BOLD, boldPath);
      const layout = new Layout(doc, finalDossier);
      summary(layout, finalDossier);
      finalDossier.items.forEach((item, index) => product(layout, item, index));
      layout.footer(); doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
