import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatarEuro, parseNumero } from "./numberUtils.js";
import { renderEan13Svg } from "./ean13Svg.js";
import { buildAutomaticPrintPages, normalizeCampaignFormat } from "./formatRulesService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const logoPath = path.join(projectRoot, "src", "logo.png");

const DEFAULT_NOTE =
  "VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock existente e não acumulável com outras promoções.";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getLogoDataUri() {
  try {
    const buffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (_error) {
    return "";
  }
}

function getValidityText(item = {}, anoValidade) {
  const inicio = String(item.dataInicio || "").trim();
  const fim = String(item.dataFim || "").trim();

  if (!inicio && !fim) return "";
  if (inicio && fim) return `Válido de ${inicio} a ${fim}/${anoValidade}`;
  if (fim) return `Válido até ${fim}/${anoValidade}`;
  return `Válido desde ${inicio}/${anoValidade}`;
}

function renderLabel(item, { title, format, anoValidade, note }) {
  const antes = parseNumero(item.antes);
  const atual = parseNumero(item.atual);
  const desconto = Math.max(0, antes - atual);
  const validity = getValidityText(item, anoValidade);

  return `
    <article class="label label-${format}">
      <div class="label-inner">
        <div class="topbar">
          ${getLogoDataUri() ? `<img src="${getLogoDataUri()}" alt="Expert" class="print-logo" />` : `<div class="logo-text">expert</div>`}
        </div>

        <div class="label-content">
          <div class="code-row">${escapeHtml(item.codigo || item.artigo || "")}</div>
          <div class="title-row">${escapeHtml(title || "PROMO")}</div>
          <div class="description">${escapeHtml(item.descricao || "")}</div>

          <div class="prices">
            <div class="price-before">${formatarEuro(antes)}€</div>
            <div class="discount">-${formatarEuro(desconto)}€</div>
            <div class="price-now">${formatarEuro(atual)}€</div>
          </div>

          <div class="footer">
            ${renderEan13Svg(item.ean)}
            ${validity ? `<div class="validity">${escapeHtml(validity)}</div>` : ""}
            <div class="note">${escapeHtml(note || DEFAULT_NOTE)}</div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderSheets(items = [], options = {}) {
  const normalizedFormat = normalizeCampaignFormat(options.format || "automatico");
  const pages = buildAutomaticPrintPages(items, normalizedFormat);

  return pages
    .map((page, pageIndex) => {
      const format = page.layout === "a5" ? "a5" : "a6";
      const perPage = format === "a5" ? 2 : 4;
      const emptySlots = Math.max(0, perPage - page.items.length);

      return `
        <section class="sheet sheet-${format}" data-page="${pageIndex + 1}">
          ${page.items.map((item) => renderLabel(item, { ...options, format })).join("\n")}
          ${Array.from({ length: emptySlots })
            .map(() => `<article class="label label-${format} label-empty"></article>`)
            .join("\n")}
        </section>
      `;
    })
    .join("\n");
}

export function renderAutomaticCampaignHtml({ items = [], title = "PROMO", storeLabel = "", format = "automatico", anoValidade = new Date().getFullYear(), note = DEFAULT_NOTE } = {}) {
  const safeTitle = title || "PROMO";
  const safeStore = storeLabel || "Loja";

  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(safeTitle)} - ${escapeHtml(safeStore)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
    @page { size: A4; margin: 0; }
    .sheet { width: 210mm; height: 297mm; page-break-after: always; display: grid; background: #fff; }
    .sheet:last-child { page-break-after: auto; }
    .sheet-a6 { grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; }
    .sheet-a5 { grid-template-columns: 105mm 105mm; grid-template-rows: 297mm; }
    .label { overflow: hidden; border: 0.2mm dashed #ddd; padding: 5mm; position: relative; }
    .label-empty { border: 0; }
    .label-a5 { padding: 7mm; }
    .label-inner { width: 100%; height: 100%; border: 1.1mm solid #111; border-radius: 5mm; padding: 4mm; display: flex; flex-direction: column; }
    .label-a5 .label-inner { transform-origin: center; }
    .topbar { min-height: 14mm; display: flex; align-items: center; justify-content: center; }
    .print-logo { max-width: 42mm; max-height: 13mm; object-fit: contain; }
    .logo-text { font-size: 24pt; font-weight: 900; text-transform: uppercase; }
    .label-content { flex: 1; display: flex; flex-direction: column; min-height: 0; }
    .code-row { font-size: 10pt; font-weight: 700; text-align: center; letter-spacing: 0.02em; margin-top: 1mm; }
    .title-row { font-size: 22pt; font-weight: 900; text-align: center; margin-top: 1mm; line-height: 1; text-transform: uppercase; }
    .description { font-size: 13pt; font-weight: 700; text-align: center; line-height: 1.05; min-height: 24mm; display: flex; align-items: center; justify-content: center; padding: 1mm 0; }
    .label-a5 .description { font-size: 20pt; min-height: 40mm; }
    .prices { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
    .price-before { font-size: 34pt; font-weight: 900; text-decoration: line-through; }
    .discount { font-size: 36pt; font-weight: 900; margin-top: 1mm; }
    .price-now { font-size: 56pt; font-weight: 950; margin-top: 1mm; letter-spacing: -0.05em; }
    .label-a5 .price-before { font-size: 48pt; }
    .label-a5 .discount { font-size: 54pt; }
    .label-a5 .price-now { font-size: 78pt; }
    .footer { margin-top: auto; text-align: center; }
    .barcode-svg { width: 58mm; max-width: 100%; height: 16mm; display: block; margin: 0 auto; }
    .barcode-fallback { font-size: 9pt; font-weight: 700; margin: 1mm 0; }
    .validity { font-size: 8.5pt; font-weight: 800; margin-top: 0.8mm; }
    .note { font-size: 5.7pt; line-height: 1.1; margin-top: 1mm; text-transform: uppercase; }
    .label-a5 .validity { font-size: 10pt; }
    .label-a5 .note { font-size: 7pt; }
  </style>
</head>
<body>
  ${renderSheets(items, { title: safeTitle, storeLabel: safeStore, format, anoValidade, note })}
</body>
</html>`;
}
