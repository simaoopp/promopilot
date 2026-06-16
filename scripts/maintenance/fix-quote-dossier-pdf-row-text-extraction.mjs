#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const servicePath = path.join(root, "server/services/quote-dossiers/pdfTextService.js");

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!fs.existsSync(servicePath)) {
  fail(`Ficheiro não encontrado: ${path.relative(root, servicePath)}. Aplica primeiro o MVP de Dossiers de Orçamento.`);
}

fs.writeFileSync(servicePath, 'import { createRequire } from "node:module";\nimport pdfParse from "pdf-parse";\n\nconst require = createRequire(import.meta.url);\n\nfunction normalizeBase64Pdf(value = "") {\n  return String(value || "")\n    .replace(/^data:application\\/pdf;base64,/i, "")\n    .replace(/\\s+/g, "")\n    .trim();\n}\n\nfunction loadBundledPdfJs() {\n  const candidates = [\n    "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js",\n    "pdf-parse/lib/pdf.js/v1.9.426/build/pdf.js",\n  ];\n\n  for (const candidate of candidates) {\n    try {\n      return require(candidate);\n    } catch {\n      // Try next bundled pdf.js path.\n    }\n  }\n\n  return null;\n}\n\nfunction toLoadingTask(pdfjsLib, uint8Data) {\n  const documentOptions = {\n    data: uint8Data,\n    disableWorker: true,\n    isEvalSupported: false,\n    useSystemFonts: true,\n  };\n\n  try {\n    return pdfjsLib.getDocument(documentOptions);\n  } catch {\n    return pdfjsLib.getDocument(uint8Data);\n  }\n}\n\nfunction getTextItemY(item) {\n  return Number(item?.transform?.[5] || 0);\n}\n\nfunction getTextItemX(item) {\n  return Number(item?.transform?.[4] || 0);\n}\n\nfunction makeRowTextFromItems(items = []) {\n  const rows = [];\n\n  for (const item of items) {\n    const text = String(item?.str || "").trim();\n\n    if (!text) continue;\n\n    const x = getTextItemX(item);\n    const y = getTextItemY(item);\n    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);\n\n    if (!row) {\n      row = { y, items: [] };\n      rows.push(row);\n    }\n\n    row.items.push({ x, text });\n  }\n\n  rows.sort((a, b) => b.y - a.y);\n\n  return rows\n    .map((row) => {\n      row.items.sort((a, b) => a.x - b.x);\n\n      return row.items\n        .map((item) => item.text)\n        .join(" ")\n        .replace(/\\s+/g, " ")\n        .trim();\n    })\n    .filter(Boolean)\n    .join("\\n");\n}\n\nasync function extractTextWithBundledPdfJs(buffer) {\n  const pdfjsLib = loadBundledPdfJs();\n\n  if (!pdfjsLib?.getDocument) {\n    throw new Error("pdf.js bundled não disponível.");\n  }\n\n  const uint8Data = new Uint8Array(buffer);\n  const loadingTask = toLoadingTask(pdfjsLib, uint8Data);\n  const pdf = loadingTask?.promise ? await loadingTask.promise : await loadingTask;\n  const pages = Number(pdf?.numPages || 0);\n  const pageTexts = [];\n\n  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {\n    const page = await pdf.getPage(pageNumber);\n    const content = await page.getTextContent({\n      normalizeWhitespace: true,\n      disableCombineTextItems: false,\n    });\n\n    pageTexts.push(makeRowTextFromItems(content?.items || []));\n  }\n\n  return {\n    text: pageTexts.join("\\n\\n").trim(),\n    pages,\n    engine: "pdfjs-row-text",\n  };\n}\n\nfunction looksLikePrimaveraQuoteText(text = "") {\n  return /\\bORC\\.[A-Z0-9./-]+/i.test(text) && (\n    /\\bEAN\\s*:?\\s*\\d{8,14}/i.test(text) ||\n    /\\b\\d{2}\\.\\d{3}\\.\\d{3}\\.\\d{5}\\b/.test(text)\n  );\n}\n\nexport async function extractTextFromPdfBase64(pdfBase64) {\n  const normalizedBase64 = normalizeBase64Pdf(pdfBase64);\n\n  if (!normalizedBase64) {\n    throw new Error("PDF vazio ou inválido.");\n  }\n\n  const buffer = Buffer.from(normalizedBase64, "base64");\n\n  if (!buffer.length) {\n    throw new Error("PDF vazio ou inválido.");\n  }\n\n  try {\n    const rowExtraction = await extractTextWithBundledPdfJs(buffer);\n\n    if (looksLikePrimaveraQuoteText(rowExtraction.text)) {\n      return rowExtraction;\n    }\n\n    console.warn("[quote-dossiers] pdfjs-row-text did not detect quote table; falling back to pdf-parse.");\n  } catch (error) {\n    console.warn("[quote-dossiers] pdfjs-row-text fallback:", error?.message || error);\n  }\n\n  const parsed = await pdfParse(buffer);\n\n  return {\n    text: String(parsed?.text || "").trim(),\n    pages: Number(parsed?.numpages || 0),\n    engine: "pdf-parse",\n  };\n}\n', "utf8");

console.log("✅ Extração de texto PDF por linhas/posições aplicada.");
console.log("Alterado:");
console.log(" - server/services/quote-dossiers/pdfTextService.js");
console.log("");
console.log("Objetivo:");
console.log(" - evitar que pdf-parse devolva a tabela Primavera por colunas/desordenada;");
console.log(" - ordenar texto por posição Y/X antes do parser;");
console.log(" - manter fallback para pdf-parse.");
console.log("");
console.log("Nota: warnings 'TT: undefined function: 32' podem continuar a aparecer, mas não são bloqueantes.");
console.log("");
console.log("Next:");
console.log(" - cd server");
console.log(" - node --check services/quote-dossiers/pdfTextService.js");
console.log(" - npm start");
