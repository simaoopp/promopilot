import PDFDocument from "pdfkit";

const PAGE_MARGIN = 42;
const BRAND_COLOR = "#24465f";
const ACCENT_COLOR = "#f97316";
const LIGHT_BORDER = "#d9dee6";
const SOFT_BG = "#f6f8fb";
const TEXT_COLOR = "#17202a";
const MUTED = "#657386";

function text(value = "") {
  return String(value || "").trim();
}

function euro(value = "") {
  const clean = text(value);

  if (!clean) return "—";
  if (clean.includes("€")) return clean;

  return `${clean} €`;
}

function quantity(value = "") {
  const clean = text(value);
  if (!clean) return "—";
  if (/un\.?$/i.test(clean)) return clean.replace(/1,00/i, "1");
  return `${clean.replace(/,00$/, "")} un.`;
}

function safeTitle(value = "") {
  return text(value).replace(/\s+/g, " ");
}

function cleanFeature(value = "") {
  return text(value).replace(/^[-•]\s*/, "");
}

function parseImageDataUrl(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:image\/(png|jpeg|jpg|webp|avif);base64,(.+)$/i);

  if (!match) return null;

  return Buffer.from(match[2], "base64");
}

function itemDisplayName(item = {}) {
  return safeTitle(item.title || item.description || item.rawDescription || [item.brand, item.reference].filter(Boolean).join(" ") || "Equipamento");
}

function noteLines(notes = "") {
  return String(notes || "")
    .split(/\n+/)
    .map((line) => text(line).replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .filter((line) => !/pronto\s+pagamento|condi[çc][aã]o\s+de\s+pagamento/i.test(line));
}

function drawHeader(doc, dossier = {}, pageTitle = "") {
  const top = 24;

  doc.save();

  doc
    .rect(PAGE_MARGIN, top, 86, 28)
    .fill(ACCENT_COLOR);

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("expert", PAGE_MARGIN, top + 7, {
      width: 86,
      align: "center",
      lineBreak: false,
    });

  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      [dossier.budgetNumber, pageTitle].filter(Boolean).join(" - "),
      PAGE_MARGIN + 110,
      top + 9,
      {
        width: doc.page.width - PAGE_MARGIN * 2 - 110,
        align: "right",
        lineBreak: false,
      },
    );

  doc
    .moveTo(PAGE_MARGIN, top + 42)
    .lineTo(doc.page.width - PAGE_MARGIN, top + 42)
    .strokeColor("#e2e8f0")
    .lineWidth(0.8)
    .stroke();

  doc.restore();
  doc.fillColor(TEXT_COLOR);
}

function drawFooter(doc, pageNumber) {
  // Fica dentro da área imprimível do PDFKit. Se for desenhado muito abaixo,
  // o PDFKit cria páginas automáticas quase vazias.
  const y = doc.page.height - PAGE_MARGIN - 13;

  doc.save();

  doc
    .moveTo(PAGE_MARGIN, y - 9)
    .lineTo(doc.page.width - PAGE_MARGIN, y - 9)
    .strokeColor("#e2e8f0")
    .lineWidth(0.8)
    .stroke();

  doc
    .fillColor("#7a8797")
    .font("Helvetica")
    .fontSize(8);

  doc.text("Documento de características dos equipamentos", PAGE_MARGIN, y, {
    width: 280,
    align: "left",
    lineBreak: false,
  });

  doc.text(`Página ${pageNumber}`, doc.page.width - PAGE_MARGIN - 90, y, {
    width: 90,
    align: "right",
    lineBreak: false,
  });

  doc.restore();
  doc.fillColor(TEXT_COLOR);
}

function startPage(doc, dossier, pageTitle) {
  doc.addPage();
  drawHeader(doc, dossier, pageTitle);

  return 86;
}

function drawSectionTitle(doc, title, x, y) {
  doc
    .fillColor(BRAND_COLOR)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(title, x, y);

  doc.fillColor(TEXT_COLOR);
  return y + 25;
}

function drawInfoTable(doc, rows = [], x, y, width, { labelWidth = 135, rowHeight = 24 } = {}) {
  let currentY = y;

  rows.forEach(([label, value]) => {
    const valueText = text(value) || "—";
    const estimatedHeight = Math.max(rowHeight, doc.heightOfString(valueText, { width: width - labelWidth - 14 }) + 12);

    doc
      .rect(x, currentY, labelWidth, estimatedHeight)
      .fillAndStroke(SOFT_BG, LIGHT_BORDER)
      .rect(x + labelWidth, currentY, width - labelWidth, estimatedHeight)
      .fillAndStroke("#ffffff", LIGHT_BORDER);

    doc
      .fillColor("#2d3748")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(label, x + 7, currentY + 8, { width: labelWidth - 14 });

    doc
      .fillColor(TEXT_COLOR)
      .font("Helvetica")
      .fontSize(9.5)
      .text(valueText, x + labelWidth + 8, currentY + 7, { width: width - labelWidth - 16 });

    currentY += estimatedHeight;
  });

  doc.fillColor(TEXT_COLOR);
  return currentY;
}

function drawParagraph(doc, value, x, y, width, options = {}) {
  const fontSize = options.fontSize || 10.2;
  const lineGap = options.lineGap ?? 2;
  const maxHeight = options.maxHeight || 90;
  const content = text(value);
  if (!content) return y;

  doc
    .font("Helvetica")
    .fontSize(fontSize)
    .fillColor(TEXT_COLOR);

  const height = Math.min(doc.heightOfString(content, { width, lineGap }), maxHeight);

  doc.text(content, x, y, {
    width,
    lineGap,
    height,
    ellipsis: true,
  });

  return y + height + 8;
}

function uniqueFeatures(features = []) {
  const seen = new Set();

  return (Array.isArray(features) ? features : String(features || "").split("\n"))
    .map((feature) => text(feature))
    .filter(Boolean)
    .filter((feature) => {
      const key = feature.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function drawBullets(doc, features = [], x, y, width, { maxItems = 10 } = {}) {
  let currentY = y;

  uniqueFeatures(features)
    .slice(0, maxItems)
    .forEach((feature) => {
      const bullet = cleanFeature(feature);
      if (!bullet) return;

      const height = Math.min(doc.heightOfString(bullet, { width: width - 16, lineGap: 1 }), 28);

      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor(TEXT_COLOR)
        .text("•", x, currentY, { width: 10 })
        .text(bullet, x + 14, currentY, {
          width: width - 16,
          lineGap: 1,
          height,
          ellipsis: true,
        });

      currentY += height + 5;
    });

  return currentY;
}

function drawImageBox(doc, item, x, y, width, height) {
  doc
    .rect(x, y, width, height)
    .fillAndStroke("#ffffff", LIGHT_BORDER);

  const imageBuffer = parseImageDataUrl(item.imageDataUrl);

  if (imageBuffer) {
    try {
      doc.image(imageBuffer, x + 12, y + 12, {
        fit: [width - 24, height - 24],
        align: "center",
        valign: "center",
      });
      return;
    } catch (error) {
      console.warn("[quote-dossiers] failed to render image:", error?.message || error);
    }
  }

  doc
    .fillColor("#8b95a5")
    .font("Helvetica")
    .fontSize(9)
    .text("Fotografia a inserir pelo utilizador", x, y + height / 2 - 5, {
      width,
      align: "center",
    });

  doc.fillColor(TEXT_COLOR);
}

function drawSummaryPage(doc, dossier = {}, pageNumber) {
  let y = startPage(doc, dossier, "Características dos equipamentos");
  const x = PAGE_MARGIN;
  const width = doc.page.width - PAGE_MARGIN * 2;

  y += 28;

  doc
    .fillColor(BRAND_COLOR)
    .font("Helvetica-Bold")
    .fontSize(23)
    .text("Características dos Equipamentos", x + 50, y, { width: width - 100, align: "center" });

  y += 28;

  doc
    .fillColor("#6b7280")
    .font("Helvetica")
    .fontSize(10)
    .text(
      [dossier.budgetNumber, dossier.customerName ? `Cliente: ${dossier.customerName}` : "", dossier.date ? `Data: ${dossier.date}` : ""]
        .filter(Boolean)
        .join(" | "),
      x,
      y,
      { width, align: "center" },
    );

  y += 30;

  const rows = [
    ["Orçamento", dossier.budgetNumber],
    ["Cliente", dossier.customerName],
    ["Data do orçamento", dossier.date],
    ["Total do orçamento", euro(dossier.total)],
    ["N.º de equipamentos/elementos", `${(dossier.items || []).length} equipamento(s)`],
  ];

  y = drawInfoTable(doc, rows, x + 8, y, width - 16, { labelWidth: 160, rowHeight: 23 }) + 28;

  y = drawSectionTitle(doc, "Enquadramento", x, y);
  y = drawParagraph(
    doc,
    "O presente documento reúne, de forma separada e organizada, a identificação e as características dos equipamentos constantes do orçamento. A informação encontra-se estruturada de modo claro e objetivo, permitindo a consulta individual de cada elemento incluído.",
    x,
    y,
    width,
    { maxHeight: 70 },
  );

  const notes = noteLines(dossier.notes);
  if (notes.length) {
    y = drawSectionTitle(doc, "Observações do orçamento", x, y + 6);
    y = drawBullets(doc, notes, x, y, width, { maxItems: 8 }) + 8;
  }

  y = drawSectionTitle(doc, "Equipamentos incluídos", x, y);

  (dossier.items || []).slice(0, 18).forEach((item, index) => {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(TEXT_COLOR)
      .text(`${index + 1}. ${itemDisplayName(item)}`, x, y, { width });
    y += 19;
  });

  drawFooter(doc, pageNumber);
}

function drawProductPage(doc, dossier = {}, item = {}, index = 0, pageNumber = 1) {
  let y = startPage(doc, dossier, "Características dos equipamentos");
  const x = PAGE_MARGIN;
  const width = doc.page.width - PAGE_MARGIN * 2;

  y += 34;

  const title = `${index + 1}. ${itemDisplayName(item)}`;

  doc
    .fillColor(BRAND_COLOR)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(title, x, y, { width });

  y += 32;

  y = drawInfoTable(
    doc,
    [
      ["Categoria", item.category],
      ["Referência", item.reference],
      ["EAN", item.ean],
      ["Quantidade", quantity(item.quantity)],
      ["Valor no orçamento", euro(item.total || item.unitPrice)],
    ],
    x,
    y,
    width,
    { labelWidth: 118, rowHeight: 23 },
  ) + 10;

  doc
    .fillColor("#2d3748")
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text("Fotografia do equipamento", x, y);

  y += 14;

  drawImageBox(doc, item, x, y, width, 125);
  y += 142;

  doc
    .fillColor("#2d3748")
    .font("Helvetica-Bold")
    .fontSize(9.8)
    .text("Descrição geral", x, y);

  y += 16;

  y = drawParagraph(
    doc,
    item.technicalDescription || "Descrição a inserir pelo utilizador.",
    x,
    y,
    width,
    { fontSize: 9.7, maxHeight: 74 },
  );

  doc
    .fillColor("#2d3748")
    .font("Helvetica-Bold")
    .fontSize(9.8)
    .text("Principais características", x, y + 4);

  y += 22;
  drawBullets(doc, item.features?.length ? item.features : ["Características a inserir pelo utilizador."], x + 8, y, width - 8, { maxItems: 8 });

  drawFooter(doc, pageNumber);
}

export async function generateQuoteDossierPdf({ dossier = {}, items = [] } = {}) {
  return new Promise((resolve, reject) => {
    const finalDossier = {
      ...dossier,
      items: Array.isArray(items) ? items : [],
    };

    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE_MARGIN,
      autoFirstPage: false,
      bufferPages: false,
      info: {
        Title: `${finalDossier.budgetNumber || "Orçamento"} - Características dos equipamentos`,
        Author: "PromoPilot",
        Subject: "Dossier técnico manual",
      },
    });

    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    let pageNumber = 1;
    drawSummaryPage(doc, finalDossier, pageNumber);

    finalDossier.items.forEach((item, index) => {
      pageNumber += 1;
      drawProductPage(doc, finalDossier, item, index, pageNumber);
    });

    doc.end();
  });
}
