import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { chromium } from "playwright";
import { formatarEuro, parseNumero } from "./numberUtils.js";
import { normalizeEan13, buildEan13Bits } from "./ean13Svg.js";
import { buildAutomaticPrintPages, normalizeCampaignFormat } from "./formatRulesService.js";
import { renderAutomaticCampaignHtml, DEFAULT_NOTE } from "./labelHtmlService.js";
import { getAutomaticCampaignConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const labelLogoCandidates = [
  path.join(projectRoot, "src", "assets", "expert-label-logo.png"),
  path.join(projectRoot, "src", "logo.png"),
];
const EXPERT_LABEL_ORANGE = "#ec6707";

const A4 = { width: 595.28, height: 841.89 };

function bufferFromPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function getExistingLogoPath() {
  return labelLogoCandidates.find((candidatePath) => fs.existsSync(candidatePath)) || null;
}

function getLayout(format) {
  if (format === "a5") {
    return {
      perPage: 2,
      slots: [
        { x: 0, y: 0, width: A4.width / 2, height: A4.height },
        { x: A4.width / 2, y: 0, width: A4.width / 2, height: A4.height },
      ],
    };
  }

  return {
    perPage: 4,
    slots: [
      { x: 0, y: 0, width: A4.width / 2, height: A4.height / 2 },
      { x: A4.width / 2, y: 0, width: A4.width / 2, height: A4.height / 2 },
      { x: 0, y: A4.height / 2, width: A4.width / 2, height: A4.height / 2 },
      { x: A4.width / 2, y: A4.height / 2, width: A4.width / 2, height: A4.height / 2 },
    ],
  };
}

function fitFontSize(doc, text, maxWidth, start, min) {
  let size = start;

  while (size > min) {
    doc.fontSize(size);
    if (doc.widthOfString(String(text || "")) <= maxWidth) break;
    size -= 1;
  }

  return Math.max(size, min);
}

function textCentered(doc, text, x, y, width, options = {}) {
  const { font = "Helvetica", size = 12, color = "#111", height, lineGap = 0 } = options;
  doc.fillColor(color).font(font).fontSize(size);
  doc.text(String(text || ""), x, y, {
    width,
    height,
    align: "center",
    lineGap,
    ellipsis: true,
  });
}

function drawLogo(doc, x, y, width, height) {
  const logoPath = getExistingLogoPath();

  if (logoPath) {
    doc.image(logoPath, x, y, {
      fit: [width, height],
      align: "center",
      valign: "center",
    });
    return;
  }

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("EXPERT", x, y + 8, { width, align: "center" });
}

function getValidityText(item = {}, anoValidade) {
  const inicio = String(item.dataInicio || "").trim();
  const fim = String(item.dataFim || "").trim();

  if (!inicio && !fim) return "";
  if (inicio && fim) return `Válido de ${inicio} a ${fim}/${anoValidade}`;
  if (fim) return `Válido até ${fim}/${anoValidade}`;
  return `Válido desde ${inicio}/${anoValidade}`;
}

function drawEan13Barcode(doc, value, x, y, width, height) {
  const ean = normalizeEan13(value);

  if (!ean) {
    textCentered(doc, value || "", x, y + height / 2 - 5, width, {
      font: "Helvetica-Bold",
      size: 9,
    });
    return;
  }

  const bits = buildEan13Bits(ean);
  const moduleWidth = width / bits.length;
  const barHeight = height - 12;

  doc.save();
  doc.fillColor("#111");

  for (let index = 0; index < bits.length; index += 1) {
    if (bits[index] !== "1") continue;
    doc.rect(x + index * moduleWidth, y, Math.max(moduleWidth, 0.65), barHeight).fill();
  }

  doc.restore();
  // O layout manual/HTML não mostra o número do EAN por baixo do código de barras.
  // Mantemos o fallback PDFKit consistente com esse comportamento.
  void ean;
}

function drawCampaignLabel(doc, item, slot, options = {}) {
  const isA5 = options.format === "a5";
  const margin = isA5 ? 18 : 14;
  const x = slot.x + margin;
  const y = slot.y + margin;
  const width = slot.width - margin * 2;
  const height = slot.height - margin * 2;
  const borderRadius = isA5 ? 18 : 14;

  doc.save();
  doc.lineWidth(2.6).roundedRect(x, y, width, height, borderRadius).stroke("#111");

  const innerX = x + 12;
  const innerW = width - 24;
  const headerH = isA5 ? 60 : 46;
  const logoW = innerW * (isA5 ? 0.78 : 0.84);
  const logoH = headerH * 0.74;

  doc.save();
  doc.roundedRect(x, y, width, headerH, borderRadius).fill(EXPERT_LABEL_ORANGE);
  doc.rect(x, y + headerH - borderRadius, width, borderRadius).fill(EXPERT_LABEL_ORANGE);
  doc.restore();

  drawLogo(doc, innerX + (innerW - logoW) / 2, y + (headerH - logoH) / 2, logoW, logoH);
  let cursorY = y + headerH + (isA5 ? 14 : 10);

  textCentered(doc, item.codigo || item.artigo || "", innerX, cursorY, innerW, {
    font: "Helvetica-Bold",
    size: isA5 ? 13 : 9.5,
    height: isA5 ? 16 : 12,
  });
  cursorY += isA5 ? 19 : 15;

  textCentered(doc, options.title || "PROMOÇÃO", innerX, cursorY, innerW, {
    font: "Helvetica-Bold",
    size: isA5 ? 34 : 24,
    height: isA5 ? 40 : 28,
  });
  cursorY += isA5 ? 43 : 31;

  const descFont = fitFontSize(doc, item.descricao || "", innerW, isA5 ? 25 : 15, isA5 ? 15 : 10);
  textCentered(doc, item.descricao || "", innerX, cursorY, innerW, {
    font: "Helvetica-Bold",
    size: descFont,
    height: isA5 ? 88 : 48,
    lineGap: 1,
  });
  cursorY += isA5 ? 96 : 54;

  const antes = parseNumero(item.antes);
  const atual = parseNumero(item.atual);
  const desconto = Math.max(0, antes - atual);
  const priceAreaTop = cursorY;
  const priceAreaBottom = y + height - (isA5 ? 126 : 92);
  const priceAreaHeight = Math.max(130, priceAreaBottom - priceAreaTop);

  const beforeSize = isA5 ? 48 : 34;
  const discountSize = isA5 ? 53 : 36;
  const nowSize = isA5 ? 78 : 55;
  const priceY = priceAreaTop + Math.max(0, (priceAreaHeight - (beforeSize + discountSize + nowSize) * 0.82) / 2);

  doc.font("Helvetica-Bold").fontSize(beforeSize).fillColor("#111");
  const beforeText = `${formatarEuro(antes)}€`;
  const beforeWidth = doc.widthOfString(beforeText);
  const beforeX = innerX + (innerW - beforeWidth) / 2;
  doc.text(beforeText, beforeX, priceY, { lineBreak: false });
  doc.moveTo(beforeX, priceY + beforeSize * 0.55).lineTo(beforeX + beforeWidth, priceY + beforeSize * 0.55).lineWidth(3).stroke("#111");

  textCentered(doc, `-${formatarEuro(desconto)}€`, innerX, priceY + beforeSize * 0.72, innerW, {
    font: "Helvetica-Bold",
    size: discountSize,
    height: discountSize,
  });

  textCentered(doc, `${formatarEuro(atual)}€`, innerX, priceY + beforeSize * 0.72 + discountSize * 0.82, innerW, {
    font: "Helvetica-Bold",
    size: nowSize,
    height: nowSize,
  });

  const barcodeW = Math.min(innerW * 0.78, isA5 ? 230 : 164);
  const barcodeH = isA5 ? 54 : 42;
  const barcodeX = innerX + (innerW - barcodeW) / 2;
  const barcodeY = y + height - (isA5 ? 112 : 80);
  drawEan13Barcode(doc, item.ean, barcodeX, barcodeY, barcodeW, barcodeH);

  const validity = getValidityText(item, options.anoValidade);
  if (validity) {
    textCentered(doc, validity, innerX, barcodeY + barcodeH + 3, innerW, {
      font: "Helvetica-Bold",
      size: isA5 ? 10 : 8,
      height: 13,
    });
  }

  textCentered(doc, options.note || DEFAULT_NOTE, innerX, y + height - (isA5 ? 34 : 25), innerW, {
    font: "Helvetica",
    size: isA5 ? 7 : 5.4,
    height: isA5 ? 20 : 16,
  });

  doc.restore();
}

async function generateWithPlaywright({ items, title, storeLabel, format = "automatico", anoValidade } = {}) {
  const html = renderAutomaticCampaignHtml({
    items,
    title,
    storeLabel,
    format,
    anoValidade,
    note: DEFAULT_NOTE,
  });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
    await page.emulateMedia({ media: "print" });
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__automaticCampaignLabelsReady === true, null, { timeout: 10000 });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
  }
}

async function generateWithPdfKit({ items, title, storeLabel, format = "automatico", anoValidade } = {}) {
  const normalizedFormat = normalizeCampaignFormat(format);
  const printPages = buildAutomaticPrintPages(items, normalizedFormat);

  if (!printPages.length) {
    throw new Error("Não existem páginas de impressão para gerar PDF.");
  }

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: `${title || "PROMOÇÃO"} - ${storeLabel || "Loja"}`,
      Author: "Expert",
      Subject: "Etiquetas de campanha automáticas",
    },
  });
  const done = bufferFromPdf(doc);

  printPages.forEach((page) => {
    const pageFormat = page.layout === "a5" ? "a5" : "a6";
    const layout = getLayout(pageFormat);

    doc.addPage({ size: "A4", margin: 0 });

    page.items.forEach((item, itemIndex) => {
      drawCampaignLabel(doc, item, layout.slots[itemIndex], {
        title,
        storeLabel,
        format: pageFormat,
        anoValidade: anoValidade || new Date().getFullYear(),
      });
    });
  });

  doc.end();
  return done;
}

export async function generateAutomaticCampaignPdf({ items, title, storeLabel, format = "automatico", anoValidade } = {}) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Não existem artigos para gerar PDF.");
  }

  const config = getAutomaticCampaignConfig();
  const engine = config.pdfEngine || "playwright";

  if (engine === "pdfkit") {
    return generateWithPdfKit({ items, title, storeLabel, format, anoValidade });
  }

  if (engine !== "playwright") {
    throw new Error(`CAMPAIGN_PDF_ENGINE inválido: ${engine}. Usa "playwright" ou "pdfkit".`);
  }

  try {
    return await generateWithPlaywright({ items, title, storeLabel, format, anoValidade });
  } catch (error) {
    if (config.allowApproxPdfFallback) {
      console.warn("[campanhas-automaticas] Fallback aproximado para PDFKit porque o render via Playwright falhou:", error?.message || error);
      return generateWithPdfKit({ items, title, storeLabel, format, anoValidade });
    }

    throw new Error(
      `Falha ao gerar PDF com o layout oficial das Etiquetas Campanha. O Chromium/Playwright é obrigatório para manter o estilo exato. Detalhe: ${error?.message || error}`,
    );
  }
}
