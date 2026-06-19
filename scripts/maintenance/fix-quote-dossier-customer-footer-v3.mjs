#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  parser: path.join(root, "server/services/quote-dossiers/quoteDossierParser.js"),
  pdf: path.join(root, "server/services/quote-dossiers/quoteDossierPdfService.js"),
};

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Ficheiro não encontrado: ${path.relative(root, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function patchParser() {
  let source = read(files.parser);

  const robustCustomerFunction = `function extractCustomer(text = "") {
  const lines = normalizeText(text)
    .split("\\n")
    .map((line) => collapseSpaces(line))
    .filter(Boolean);

  function invalidCustomerLine(line = "") {
    return /^(Rua|RUA|Avenida|AVENIDA|Canada|CANADA|Fonte|FONTE|Porto|PORTO|Praia|PRAIA|Santa|SANTA|Portugal|NIB|Telef|Tel\\.?|Fax|Contribuinte|Capital|C\\.R\\.C\\.|Alvar[aá]|Empresa|Produtor|P[aá]g\\.?|Expert|Jos[eé]\\s+Tom[aá]s|Descarga|Carga|N\\/ Morada|V\\/ Morada|Exmo|Original|Or[çc]amentos|Data|Artigo|Este documento|Total|Quadro|Aquando|ATCUD|Respons[aá]vel)/i.test(line)
      || /V\\/N\\.?º?\\s*Contrib|Requisi[çc][aã]o|Desc\\.\\s*Cli|Desc\\.\\s*Fin|Condi[çc][aã]o\\s+Pagamento|Vencimento|Enti?dade|PRONTO\\s+PAGAMENTO/i.test(line);
  }

  function validCustomerLine(line = "") {
    const clean = collapseSpaces(line);
    const words = clean.match(/[A-ZÀ-Ý]{2,}/g) || [];

    if (clean.length < 4 || clean.length > 90) return false;
    if (words.length < 2) return false;
    if (/[@]|https?:|www\\./i.test(clean)) return false;
    if (/\\d/.test(clean)) return false;
    if (invalidCustomerLine(clean)) return false;

    return true;
  }

  const exmoIndex = lines.findIndex((line) => /Exmo\\.\\(s\\)\\s*Sr/i.test(line) || /^Exmo/i.test(line));

  if (exmoIndex >= 0) {
    for (let index = exmoIndex - 1; index >= Math.max(0, exmoIndex - 12); index -= 1) {
      const line = lines[index];
      if (validCustomerLine(line)) return line;
    }

    for (let index = exmoIndex + 1; index <= Math.min(lines.length - 1, exmoIndex + 14); index += 1) {
      const line = lines[index];
      if (validCustomerLine(line)) return line;
    }
  }

  const budgetIndex = lines.findIndex((line) => /Or[çc]amentos\\s+OR\\s+ORC\\./i.test(line));

  if (budgetIndex > 0) {
    for (let index = Math.max(0, budgetIndex - 35); index < budgetIndex; index += 1) {
      const line = lines[index];

      if (validCustomerLine(line) && /^[A-ZÀ-Ý&.,'\\s-]+$/.test(line)) {
        return line;
      }
    }
  }

  return "";
}`;

  const start = source.indexOf("function extractCustomer");
  const end = source.indexOf("function extractTotal", start);

  if (start === -1 || end === -1) {
    fail("Não encontrei o bloco extractCustomer/extractTotal no parser.");
  }

  source = `${source.slice(0, start)}${robustCustomerFunction}\n\n${source.slice(end)}`;

  write(files.parser, source);
}

write(files.pdf, "import PDFDocument from \"pdfkit\";\n\nconst PAGE_MARGIN = 42;\nconst BRAND_COLOR = \"#24465f\";\nconst ACCENT_COLOR = \"#f97316\";\nconst LIGHT_BORDER = \"#d9dee6\";\nconst SOFT_BG = \"#f6f8fb\";\nconst TEXT_COLOR = \"#17202a\";\nconst MUTED = \"#657386\";\n\nfunction text(value = \"\") {\n  return String(value || \"\").trim();\n}\n\nfunction euro(value = \"\") {\n  const clean = text(value);\n\n  if (!clean) return \"\u2014\";\n  if (clean.includes(\"\u20ac\")) return clean;\n\n  return `${clean} \u20ac`;\n}\n\nfunction quantity(value = \"\") {\n  const clean = text(value);\n  if (!clean) return \"\u2014\";\n  if (/un\\.?$/i.test(clean)) return clean.replace(/1,00/i, \"1\");\n  return `${clean.replace(/,00$/, \"\")} un.`;\n}\n\nfunction safeTitle(value = \"\") {\n  return text(value).replace(/\\s+/g, \" \");\n}\n\nfunction cleanFeature(value = \"\") {\n  return text(value).replace(/^[-\u2022]\\s*/, \"\");\n}\n\nfunction parseImageDataUrl(dataUrl = \"\") {\n  const match = String(dataUrl || \"\").match(/^data:image\\/(png|jpeg|jpg|webp|avif);base64,(.+)$/i);\n\n  if (!match) return null;\n\n  return Buffer.from(match[2], \"base64\");\n}\n\nfunction itemDisplayName(item = {}) {\n  return safeTitle(item.title || item.description || item.rawDescription || [item.brand, item.reference].filter(Boolean).join(\" \") || \"Equipamento\");\n}\n\nfunction noteLines(notes = \"\") {\n  return String(notes || \"\")\n    .split(/\\n+/)\n    .map((line) => text(line).replace(/^[-\u2022]\\s*/, \"\"))\n    .filter(Boolean)\n    .filter((line) => !/pronto\\s+pagamento|condi[\u00e7c][a\u00e3]o\\s+de\\s+pagamento/i.test(line));\n}\n\nfunction drawHeader(doc, dossier = {}, pageTitle = \"\") {\n  const top = 24;\n\n  doc.save();\n\n  doc\n    .rect(PAGE_MARGIN, top, 86, 28)\n    .fill(ACCENT_COLOR);\n\n  doc\n    .fillColor(\"#ffffff\")\n    .font(\"Helvetica-Bold\")\n    .fontSize(15)\n    .text(\"expert\", PAGE_MARGIN, top + 7, {\n      width: 86,\n      align: \"center\",\n      lineBreak: false,\n    });\n\n  doc\n    .fillColor(MUTED)\n    .font(\"Helvetica\")\n    .fontSize(8.5)\n    .text(\n      [dossier.budgetNumber, pageTitle].filter(Boolean).join(\" - \"),\n      PAGE_MARGIN + 110,\n      top + 9,\n      {\n        width: doc.page.width - PAGE_MARGIN * 2 - 110,\n        align: \"right\",\n        lineBreak: false,\n      },\n    );\n\n  doc\n    .moveTo(PAGE_MARGIN, top + 42)\n    .lineTo(doc.page.width - PAGE_MARGIN, top + 42)\n    .strokeColor(\"#e2e8f0\")\n    .lineWidth(0.8)\n    .stroke();\n\n  doc.restore();\n  doc.fillColor(TEXT_COLOR);\n}\n\nfunction drawFooter(doc, pageNumber) {\n  // Fica dentro da \u00e1rea imprim\u00edvel do PDFKit. Se for desenhado muito abaixo,\n  // o PDFKit cria p\u00e1ginas autom\u00e1ticas quase vazias.\n  const y = doc.page.height - PAGE_MARGIN - 13;\n\n  doc.save();\n\n  doc\n    .moveTo(PAGE_MARGIN, y - 9)\n    .lineTo(doc.page.width - PAGE_MARGIN, y - 9)\n    .strokeColor(\"#e2e8f0\")\n    .lineWidth(0.8)\n    .stroke();\n\n  doc\n    .fillColor(\"#7a8797\")\n    .font(\"Helvetica\")\n    .fontSize(8);\n\n  doc.text(\"Documento de caracter\u00edsticas dos equipamentos\", PAGE_MARGIN, y, {\n    width: 280,\n    align: \"left\",\n    lineBreak: false,\n  });\n\n  doc.text(`P\u00e1gina ${pageNumber}`, doc.page.width - PAGE_MARGIN - 90, y, {\n    width: 90,\n    align: \"right\",\n    lineBreak: false,\n  });\n\n  doc.restore();\n  doc.fillColor(TEXT_COLOR);\n}\n\nfunction startPage(doc, dossier, pageTitle) {\n  doc.addPage();\n  drawHeader(doc, dossier, pageTitle);\n\n  return 86;\n}\n\nfunction drawSectionTitle(doc, title, x, y) {\n  doc\n    .fillColor(BRAND_COLOR)\n    .font(\"Helvetica-Bold\")\n    .fontSize(15)\n    .text(title, x, y);\n\n  doc.fillColor(TEXT_COLOR);\n  return y + 25;\n}\n\nfunction drawInfoTable(doc, rows = [], x, y, width, { labelWidth = 135, rowHeight = 24 } = {}) {\n  let currentY = y;\n\n  rows.forEach(([label, value]) => {\n    const valueText = text(value) || \"\u2014\";\n    const estimatedHeight = Math.max(rowHeight, doc.heightOfString(valueText, { width: width - labelWidth - 14 }) + 12);\n\n    doc\n      .rect(x, currentY, labelWidth, estimatedHeight)\n      .fillAndStroke(SOFT_BG, LIGHT_BORDER)\n      .rect(x + labelWidth, currentY, width - labelWidth, estimatedHeight)\n      .fillAndStroke(\"#ffffff\", LIGHT_BORDER);\n\n    doc\n      .fillColor(\"#2d3748\")\n      .font(\"Helvetica-Bold\")\n      .fontSize(9)\n      .text(label, x + 7, currentY + 8, { width: labelWidth - 14 });\n\n    doc\n      .fillColor(TEXT_COLOR)\n      .font(\"Helvetica\")\n      .fontSize(9.5)\n      .text(valueText, x + labelWidth + 8, currentY + 7, { width: width - labelWidth - 16 });\n\n    currentY += estimatedHeight;\n  });\n\n  doc.fillColor(TEXT_COLOR);\n  return currentY;\n}\n\nfunction drawParagraph(doc, value, x, y, width, options = {}) {\n  const fontSize = options.fontSize || 10.2;\n  const lineGap = options.lineGap ?? 2;\n  const maxHeight = options.maxHeight || 90;\n  const content = text(value);\n  if (!content) return y;\n\n  doc\n    .font(\"Helvetica\")\n    .fontSize(fontSize)\n    .fillColor(TEXT_COLOR);\n\n  const height = Math.min(doc.heightOfString(content, { width, lineGap }), maxHeight);\n\n  doc.text(content, x, y, {\n    width,\n    lineGap,\n    height,\n    ellipsis: true,\n  });\n\n  return y + height + 8;\n}\n\nfunction uniqueFeatures(features = []) {\n  const seen = new Set();\n\n  return (Array.isArray(features) ? features : String(features || \"\").split(\"\\n\"))\n    .map((feature) => text(feature))\n    .filter(Boolean)\n    .filter((feature) => {\n      const key = feature.toLowerCase();\n      if (seen.has(key)) return false;\n      seen.add(key);\n      return true;\n    });\n}\n\nfunction drawBullets(doc, features = [], x, y, width, { maxItems = 10 } = {}) {\n  let currentY = y;\n\n  uniqueFeatures(features)\n    .slice(0, maxItems)\n    .forEach((feature) => {\n      const bullet = cleanFeature(feature);\n      if (!bullet) return;\n\n      const height = Math.min(doc.heightOfString(bullet, { width: width - 16, lineGap: 1 }), 28);\n\n      doc\n        .font(\"Helvetica\")\n        .fontSize(9.5)\n        .fillColor(TEXT_COLOR)\n        .text(\"\u2022\", x, currentY, { width: 10 })\n        .text(bullet, x + 14, currentY, {\n          width: width - 16,\n          lineGap: 1,\n          height,\n          ellipsis: true,\n        });\n\n      currentY += height + 5;\n    });\n\n  return currentY;\n}\n\nfunction drawImageBox(doc, item, x, y, width, height) {\n  doc\n    .rect(x, y, width, height)\n    .fillAndStroke(\"#ffffff\", LIGHT_BORDER);\n\n  const imageBuffer = parseImageDataUrl(item.imageDataUrl);\n\n  if (imageBuffer) {\n    try {\n      doc.image(imageBuffer, x + 12, y + 12, {\n        fit: [width - 24, height - 24],\n        align: \"center\",\n        valign: \"center\",\n      });\n      return;\n    } catch (error) {\n      console.warn(\"[quote-dossiers] failed to render image:\", error?.message || error);\n    }\n  }\n\n  doc\n    .fillColor(\"#8b95a5\")\n    .font(\"Helvetica\")\n    .fontSize(9)\n    .text(\"Fotografia a inserir pelo utilizador\", x, y + height / 2 - 5, {\n      width,\n      align: \"center\",\n    });\n\n  doc.fillColor(TEXT_COLOR);\n}\n\nfunction drawSummaryPage(doc, dossier = {}, pageNumber) {\n  let y = startPage(doc, dossier, \"Caracter\u00edsticas dos equipamentos\");\n  const x = PAGE_MARGIN;\n  const width = doc.page.width - PAGE_MARGIN * 2;\n\n  y += 28;\n\n  doc\n    .fillColor(BRAND_COLOR)\n    .font(\"Helvetica-Bold\")\n    .fontSize(23)\n    .text(\"Caracter\u00edsticas dos Equipamentos\", x + 50, y, { width: width - 100, align: \"center\" });\n\n  y += 28;\n\n  doc\n    .fillColor(\"#6b7280\")\n    .font(\"Helvetica\")\n    .fontSize(10)\n    .text(\n      [dossier.budgetNumber, dossier.customerName ? `Cliente: ${dossier.customerName}` : \"\", dossier.date ? `Data: ${dossier.date}` : \"\"]\n        .filter(Boolean)\n        .join(\" | \"),\n      x,\n      y,\n      { width, align: \"center\" },\n    );\n\n  y += 30;\n\n  const rows = [\n    [\"Or\u00e7amento\", dossier.budgetNumber],\n    [\"Cliente\", dossier.customerName],\n    [\"Data do or\u00e7amento\", dossier.date],\n    [\"Total do or\u00e7amento\", euro(dossier.total)],\n    [\"N.\u00ba de equipamentos/elementos\", `${(dossier.items || []).length} equipamento(s)`],\n  ];\n\n  y = drawInfoTable(doc, rows, x + 8, y, width - 16, { labelWidth: 160, rowHeight: 23 }) + 28;\n\n  y = drawSectionTitle(doc, \"Enquadramento\", x, y);\n  y = drawParagraph(\n    doc,\n    \"O presente documento re\u00fane, de forma separada e organizada, a identifica\u00e7\u00e3o e as caracter\u00edsticas dos equipamentos constantes do or\u00e7amento. A informa\u00e7\u00e3o encontra-se estruturada de modo claro e objetivo, permitindo a consulta individual de cada elemento inclu\u00eddo.\",\n    x,\n    y,\n    width,\n    { maxHeight: 70 },\n  );\n\n  const notes = noteLines(dossier.notes);\n  if (notes.length) {\n    y = drawSectionTitle(doc, \"Observa\u00e7\u00f5es do or\u00e7amento\", x, y + 6);\n    y = drawBullets(doc, notes, x, y, width, { maxItems: 8 }) + 8;\n  }\n\n  y = drawSectionTitle(doc, \"Equipamentos inclu\u00eddos\", x, y);\n\n  (dossier.items || []).slice(0, 18).forEach((item, index) => {\n    doc\n      .font(\"Helvetica\")\n      .fontSize(10)\n      .fillColor(TEXT_COLOR)\n      .text(`${index + 1}. ${itemDisplayName(item)}`, x, y, { width });\n    y += 19;\n  });\n\n  drawFooter(doc, pageNumber);\n}\n\nfunction drawProductPage(doc, dossier = {}, item = {}, index = 0, pageNumber = 1) {\n  let y = startPage(doc, dossier, \"Caracter\u00edsticas dos equipamentos\");\n  const x = PAGE_MARGIN;\n  const width = doc.page.width - PAGE_MARGIN * 2;\n\n  y += 34;\n\n  const title = `${index + 1}. ${itemDisplayName(item)}`;\n\n  doc\n    .fillColor(BRAND_COLOR)\n    .font(\"Helvetica-Bold\")\n    .fontSize(18)\n    .text(title, x, y, { width });\n\n  y += 32;\n\n  y = drawInfoTable(\n    doc,\n    [\n      [\"Categoria\", item.category],\n      [\"Refer\u00eancia\", item.reference],\n      [\"EAN\", item.ean],\n      [\"Quantidade\", quantity(item.quantity)],\n      [\"Valor no or\u00e7amento\", euro(item.total || item.unitPrice)],\n    ],\n    x,\n    y,\n    width,\n    { labelWidth: 118, rowHeight: 23 },\n  ) + 10;\n\n  doc\n    .fillColor(\"#2d3748\")\n    .font(\"Helvetica-Bold\")\n    .fontSize(9.5)\n    .text(\"Fotografia do equipamento\", x, y);\n\n  y += 14;\n\n  drawImageBox(doc, item, x, y, width, 125);\n  y += 142;\n\n  doc\n    .fillColor(\"#2d3748\")\n    .font(\"Helvetica-Bold\")\n    .fontSize(9.8)\n    .text(\"Descri\u00e7\u00e3o geral\", x, y);\n\n  y += 16;\n\n  y = drawParagraph(\n    doc,\n    item.technicalDescription || \"Descri\u00e7\u00e3o a inserir pelo utilizador.\",\n    x,\n    y,\n    width,\n    { fontSize: 9.7, maxHeight: 74 },\n  );\n\n  doc\n    .fillColor(\"#2d3748\")\n    .font(\"Helvetica-Bold\")\n    .fontSize(9.8)\n    .text(\"Principais caracter\u00edsticas\", x, y + 4);\n\n  y += 22;\n  drawBullets(doc, item.features?.length ? item.features : [\"Caracter\u00edsticas a inserir pelo utilizador.\"], x + 8, y, width - 8, { maxItems: 8 });\n\n  drawFooter(doc, pageNumber);\n}\n\nexport async function generateQuoteDossierPdf({ dossier = {}, items = [] } = {}) {\n  return new Promise((resolve, reject) => {\n    const finalDossier = {\n      ...dossier,\n      items: Array.isArray(items) ? items : [],\n    };\n\n    const doc = new PDFDocument({\n      size: \"A4\",\n      margin: PAGE_MARGIN,\n      autoFirstPage: false,\n      bufferPages: false,\n      info: {\n        Title: `${finalDossier.budgetNumber || \"Or\u00e7amento\"} - Caracter\u00edsticas dos equipamentos`,\n        Author: \"PromoPilot\",\n        Subject: \"Dossier t\u00e9cnico manual\",\n      },\n    });\n\n    const chunks = [];\n\n    doc.on(\"data\", (chunk) => chunks.push(chunk));\n    doc.on(\"error\", reject);\n    doc.on(\"end\", () => resolve(Buffer.concat(chunks)));\n\n    let pageNumber = 1;\n    drawSummaryPage(doc, finalDossier, pageNumber);\n\n    finalDossier.items.forEach((item, index) => {\n      pageNumber += 1;\n      drawProductPage(doc, finalDossier, item, index, pageNumber);\n    });\n\n    doc.end();\n  });\n}\n");
patchParser();

console.log("✅ Cliente e footer do dossier corrigidos v3.");
console.log("Corrige:");
console.log(" - rejeita cabeçalhos tipo V/N.º Contrib. como cliente");
console.log(" - extrai VASCO OLIVEIRA MENDES antes de Exmo.(s) Sr.(s)");
console.log(" - evita páginas vazias do footer fora da área imprimível");
console.log("");
console.log("Alterado:");
console.log(" - server/services/quote-dossiers/quoteDossierParser.js");
console.log(" - server/services/quote-dossiers/quoteDossierPdfService.js");
console.log("");
console.log("Next:");
console.log(" - cd server");
console.log(" - node --check services/quote-dossiers/quoteDossierParser.js");
console.log(" - node --check services/quote-dossiers/quoteDossierPdfService.js");
