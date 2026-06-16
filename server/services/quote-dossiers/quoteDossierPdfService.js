import PDFDocument from "pdfkit";

const PAGE_MARGIN = 42;
const BRAND_COLOR = "#24465f";
const ACCENT_COLOR = "#f97316";
const LIGHT_BORDER = "#d9dee6";
const SOFT_BG = "#f6f8fb";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function euro(value = "") {
  const text = normalizeText(value);

  if (!text) return "—";
  if (text.includes("€")) return text;

  return `${text} €`;
}

function drawHeader(doc, dossier = {}, pageTitle = "") {
  const top = 26;

  doc
    .rect(PAGE_MARGIN, top, 80, 28)
    .fill(ACCENT_COLOR);

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("expert", PAGE_MARGIN, top + 7, { width: 80, align: "center" });

  doc
    .fillColor("#657386")
    .font("Helvetica")
    .fontSize(8)
    .text(
      [dossier.budgetNumber, pageTitle].filter(Boolean).join(" - "),
      PAGE_MARGIN + 95,
      top + 9,
      { width: 410, align: "right" },
    );

  doc
    .moveTo(PAGE_MARGIN, top + 38)
    .lineTo(doc.page.width - PAGE_MARGIN, top + 38)
    .strokeColor("#e2e8f0")
    .lineWidth(0.8)
    .stroke();

  doc.fillColor("#111827");
}

function drawFooter(doc, pageNumber) {
  const y = doc.page.height - 34;

  doc
    .moveTo(PAGE_MARGIN, y - 10)
    .lineTo(doc.page.width - PAGE_MARGIN, y - 10)
    .strokeColor("#e2e8f0")
    .lineWidth(0.8)
    .stroke();

  doc
    .fillColor("#7a8797")
    .font("Helvetica")
    .fontSize(8)
    .text("Documento de características dos equipamentos", PAGE_MARGIN, y, {
      width: 260,
      align: "left",
    })
    .text(`Página ${pageNumber}`, doc.page.width - PAGE_MARGIN - 90, y, {
      width: 90,
      align: "right",
    });

  doc.fillColor("#111827");
}

function addPage(doc, dossier, title, pageNumber) {
  if (pageNumber > 1) {
    doc.addPage();
  }

  drawHeader(doc, dossier, title);
  drawFooter(doc, pageNumber);

  return 82;
}

function drawInfoTable(doc, rows, x, y, width) {
  const labelWidth = 170;
  const rowHeight = 25;
  let cursorY = y;

  rows.forEach(([label, value]) => {
    doc
      .rect(x, cursorY, labelWidth, rowHeight)
      .fillAndStroke(SOFT_BG, LIGHT_BORDER)
      .rect(x + labelWidth, cursorY, width - labelWidth, rowHeight)
      .fillAndStroke("#ffffff", LIGHT_BORDER);

    doc
      .fillColor("#374151")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(label, x + 8, cursorY + 8, { width: labelWidth - 16 });

    doc
      .fillColor("#111827")
      .font("Helvetica")
      .fontSize(9)
      .text(value || "—", x + labelWidth + 8, cursorY + 8, { width: width - labelWidth - 16 });

    cursorY += rowHeight;
  });

  return cursorY;
}

function fitText(doc, text, x, y, width, options = {}) {
  const {
    font = "Helvetica",
    size = 10,
    color = "#111827",
    lineGap = 2,
    height,
    continued = false,
  } = options;

  doc.fillColor(color).font(font).fontSize(size);

  const textOptions = {
    width,
    lineGap,
    continued,
  };

  if (height) textOptions.height = height;

  doc.text(text || "—", x, y, textOptions);
  return doc.y;
}

function dataUrlToImageBuffer(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);

  if (!match) return null;

  return Buffer.from(match[2], "base64");
}

function drawImageBox(doc, item, x, y, width, height) {
  doc.rect(x, y, width, height).strokeColor(LIGHT_BORDER).lineWidth(1).stroke();

  const imageBuffer = dataUrlToImageBuffer(item.imageDataUrl);

  if (imageBuffer) {
    try {
      doc.image(imageBuffer, x + 10, y + 10, {
        fit: [width - 20, height - 20],
        align: "center",
        valign: "center",
      });
      return;
    } catch {
      // fallback below
    }
  }

  doc
    .fillColor("#8a94a6")
    .font("Helvetica")
    .fontSize(10)
    .text("Fotografia não carregada", x, y + height / 2 - 6, {
      width,
      align: "center",
    });
}

function drawBullets(doc, features = [], x, y, width) {
  let cursorY = y;
  const cleanFeatures = features.map(normalizeText).filter(Boolean);

  if (!cleanFeatures.length) {
    cleanFeatures.push("Características a confirmar.");
  }

  cleanFeatures.forEach((feature) => {
    doc
      .fillColor("#111827")
      .font("Helvetica")
      .fontSize(10)
      .text("•", x, cursorY, { width: 12 });

    doc
      .fillColor("#111827")
      .font("Helvetica")
      .fontSize(10)
      .text(feature, x + 14, cursorY, { width: width - 14, lineGap: 2 });

    cursorY = doc.y + 3;
  });

  return cursorY;
}

function normalizeItems(items = []) {
  return Array.isArray(items)
    ? items.map((item, index) => ({
        number: index + 1,
        articleCode: normalizeText(item.articleCode),
        rawDescription: normalizeText(item.rawDescription || item.description),
        description: normalizeText(item.description || item.rawDescription),
        technicalDescription: normalizeText(item.technicalDescription),
        brand: normalizeText(item.brand),
        category: normalizeText(item.category || "Equipamento"),
        reference: normalizeText(item.reference),
        ean: normalizeText(item.ean),
        quantity: normalizeText(item.quantity || "1,00"),
        unitPrice: normalizeText(item.unitPrice),
        total: normalizeText(item.total),
        features: Array.isArray(item.features)
          ? item.features.map(normalizeText).filter(Boolean)
          : String(item.features || "")
              .split("\n")
              .map(normalizeText)
              .filter(Boolean),
        imageDataUrl: normalizeText(item.imageDataUrl),
      }))
    : [];
}

function drawIntroPage(doc, dossier, items) {
  let y = addPage(doc, dossier, "Características dos equipamentos", 1);

  doc
    .fillColor(BRAND_COLOR)
    .font("Helvetica-Bold")
    .fontSize(24)
    .text("Características dos Equipamentos", PAGE_MARGIN + 54, y + 16);

  doc
    .fillColor("#64748b")
    .font("Helvetica")
    .fontSize(11)
    .text(
      [dossier.budgetNumber, dossier.customerName ? `Cliente: ${dossier.customerName}` : "", dossier.date ? `Data: ${dossier.date}` : ""]
        .filter(Boolean)
        .join(" | "),
      PAGE_MARGIN + 54,
      y + 46,
    );

  y += 82;

  y = drawInfoTable(
    doc,
    [
      ["Orçamento", dossier.budgetNumber],
      ["Cliente", dossier.customerName],
      ["Data do orçamento", dossier.date],
      ["Total do orçamento", euro(dossier.total)],
      ["N.º de equipamentos/elementos", `${items.length} equipamento${items.length === 1 ? "" : "s"}`],
    ],
    PAGE_MARGIN,
    y,
    doc.page.width - PAGE_MARGIN * 2,
  );

  y += 28;

  doc
    .fillColor(BRAND_COLOR)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("Enquadramento", PAGE_MARGIN, y);

  y += 24;

  y = fitText(
    doc,
    "O presente documento reúne, de forma separada e organizada, a identificação e as características dos equipamentos constantes do orçamento. A informação encontra-se estruturada para consulta individual de cada elemento incluído.",
    PAGE_MARGIN,
    y,
    doc.page.width - PAGE_MARGIN * 2,
    { size: 10.5, lineGap: 3 },
  );

  y += 22;

  doc.fillColor(BRAND_COLOR).font("Helvetica-Bold").fontSize(16).text("Equipamentos incluídos", PAGE_MARGIN, y);
  y += 24;

  items.forEach((item) => {
    doc
      .fillColor("#111827")
      .font("Helvetica")
      .fontSize(10.5)
      .text(`${item.number}. ${item.brand ? `${item.brand} ` : ""}${item.reference || item.rawDescription}`, PAGE_MARGIN, y, {
        width: doc.page.width - PAGE_MARGIN * 2,
      });

    y = doc.y + 8;
  });

  if (dossier.notes) {
    y += 14;
    doc.fillColor(BRAND_COLOR).font("Helvetica-Bold").fontSize(16).text("Observações", PAGE_MARGIN, y);
    y += 22;
    fitText(doc, dossier.notes, PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, { size: 10 });
  }
}

function drawItemPage(doc, dossier, item, pageNumber) {
  let y = addPage(doc, dossier, `${item.number}. ${item.brand} ${item.reference}`.trim(), pageNumber);

  doc
    .fillColor(BRAND_COLOR)
    .font("Helvetica-Bold")
    .fontSize(19)
    .text(`${item.number}. ${[item.brand, item.reference].filter(Boolean).join(" ") || item.rawDescription}`, PAGE_MARGIN, y + 18, {
      width: doc.page.width - PAGE_MARGIN * 2,
    });

  y += 54;

  y = drawInfoTable(
    doc,
    [
      ["Categoria", item.category],
      ["Referência", item.reference],
      ["EAN", item.ean],
      ["Quantidade", `${item.quantity} un.`],
      ["Valor no orçamento", euro(item.total || item.unitPrice)],
    ],
    PAGE_MARGIN,
    y,
    doc.page.width - PAGE_MARGIN * 2,
  );

  y += 16;

  doc.fillColor("#374151").font("Helvetica-Bold").fontSize(10).text("Fotografia do equipamento", PAGE_MARGIN, y);
  y += 16;

  drawImageBox(doc, item, PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, 142);

  y += 158;

  doc.fillColor("#374151").font("Helvetica-Bold").fontSize(11).text("Descrição geral", PAGE_MARGIN, y);
  y += 18;

  y = fitText(
    doc,
    item.technicalDescription || item.description || item.rawDescription,
    PAGE_MARGIN,
    y,
    doc.page.width - PAGE_MARGIN * 2,
    { size: 10.2, lineGap: 3 },
  );

  y += 18;

  doc.fillColor("#374151").font("Helvetica-Bold").fontSize(11).text("Principais características", PAGE_MARGIN, y);
  y += 16;

  drawBullets(doc, item.features, PAGE_MARGIN + 10, y, doc.page.width - PAGE_MARGIN * 2 - 10);
}

export async function generateQuoteDossierPdf({ dossier = {}, items = [] } = {}) {
  const normalizedItems = normalizeItems(items);

  if (!normalizedItems.length) {
    throw new Error("Não existem equipamentos para gerar o dossier.");
  }

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    info: {
      Title: `Dossier ${dossier.budgetNumber || ""}`.trim(),
      Author: "Expert Administração",
      Subject: "Características dos equipamentos",
    },
    bufferPages: false,
  });

  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  drawIntroPage(doc, dossier, normalizedItems);

  normalizedItems.forEach((item, index) => {
    drawItemPage(doc, dossier, item, index + 2);
  });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
