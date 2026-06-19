#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  route: path.join(root, "server/routes/quoteDossiers.js"),
  pdfText: path.join(root, "server/services/quote-dossiers/pdfTextService.js"),
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

function patchRoute() {
  let source = read(files.route);

  source = source.replace(
    /export const QUOTE_DOSSIER_RUNTIME_VERSION = "quote-dossier-manual-runtime-v\d+";/,
    'export const QUOTE_DOSSIER_RUNTIME_VERSION = "quote-dossier-manual-runtime-v6";',
  );

  if (source.includes("const extractedCustomer = extractCustomerFromQuoteText(extracted.text);")) {
    source = source.replace(
      "const extractedCustomer = extractCustomerFromQuoteText(extracted.text);",
      `const customerSourceText = [extracted.text, extracted.rawText, extracted.combinedText].filter(Boolean).join("\\n\\n");
      const extractedCustomer = extractCustomerFromQuoteText(customerSourceText);`,
    );
  } else if (!source.includes("const customerSourceText = [extracted.text, extracted.rawText, extracted.combinedText]")) {
    source = source.replace(
      "const parsedDossier = parseQuoteDossierFromText(extracted.text, { filename });",
      `const parsedDossier = parseQuoteDossierFromText(extracted.text, { filename });
      const customerSourceText = [extracted.text, extracted.rawText, extracted.combinedText].filter(Boolean).join("\\n\\n");
      const extractedCustomer = extractCustomerFromQuoteText(customerSourceText);`,
    );
  }

  if (!source.includes("hasRawText: Boolean(extracted.rawText)")) {
    source = source.replace(
      "final: customerName || \"\",",
      `final: customerName || "",
          hasRawText: Boolean(extracted.rawText),
          engine: extracted.engine || "unknown",`,
    );
  }

  write(files.route, source);
}

write(files.pdfText, "import { createRequire } from \"node:module\";\nimport pdfParse from \"pdf-parse\";\n\nconst require = createRequire(import.meta.url);\n\nfunction normalizeBase64Pdf(value = \"\") {\n  return String(value || \"\")\n    .replace(/^data:application\\/pdf;base64,/i, \"\")\n    .replace(/\\s+/g, \"\")\n    .trim();\n}\n\nfunction loadBundledPdfJs() {\n  const candidates = [\n    \"pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js\",\n    \"pdf-parse/lib/pdf.js/v1.9.426/build/pdf.js\",\n  ];\n\n  for (const candidate of candidates) {\n    try {\n      return require(candidate);\n    } catch {\n      // Try next bundled pdf.js path.\n    }\n  }\n\n  return null;\n}\n\nfunction toLoadingTask(pdfjsLib, uint8Data) {\n  const documentOptions = {\n    data: uint8Data,\n    disableWorker: true,\n    isEvalSupported: false,\n    useSystemFonts: true,\n  };\n\n  try {\n    return pdfjsLib.getDocument(documentOptions);\n  } catch {\n    return pdfjsLib.getDocument(uint8Data);\n  }\n}\n\nfunction getTextItemY(item) {\n  return Number(item?.transform?.[5] || 0);\n}\n\nfunction getTextItemX(item) {\n  return Number(item?.transform?.[4] || 0);\n}\n\nfunction makeRowTextFromItems(items = []) {\n  const rows = [];\n\n  for (const item of items) {\n    const text = String(item?.str || \"\").trim();\n\n    if (!text) continue;\n\n    const x = getTextItemX(item);\n    const y = getTextItemY(item);\n    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);\n\n    if (!row) {\n      row = { y, items: [] };\n      rows.push(row);\n    }\n\n    row.items.push({ x, text });\n  }\n\n  rows.sort((a, b) => b.y - a.y);\n\n  return rows\n    .map((row) => {\n      row.items.sort((a, b) => a.x - b.x);\n\n      return row.items\n        .map((item) => item.text)\n        .join(\" \")\n        .replace(/\\s+/g, \" \")\n        .trim();\n    })\n    .filter(Boolean)\n    .join(\"\\n\");\n}\n\nasync function extractTextWithBundledPdfJs(buffer) {\n  const pdfjsLib = loadBundledPdfJs();\n\n  if (!pdfjsLib?.getDocument) {\n    throw new Error(\"pdf.js bundled n\u00e3o dispon\u00edvel.\");\n  }\n\n  const uint8Data = new Uint8Array(buffer);\n  const loadingTask = toLoadingTask(pdfjsLib, uint8Data);\n  const pdf = loadingTask?.promise ? await loadingTask.promise : await loadingTask;\n  const pages = Number(pdf?.numPages || 0);\n  const pageTexts = [];\n\n  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {\n    const page = await pdf.getPage(pageNumber);\n    const content = await page.getTextContent({\n      normalizeWhitespace: true,\n      disableCombineTextItems: false,\n    });\n\n    pageTexts.push(makeRowTextFromItems(content?.items || []));\n  }\n\n  return {\n    text: pageTexts.join(\"\\n\\n\").trim(),\n    pages,\n    engine: \"pdfjs-row-text\",\n  };\n}\n\nfunction looksLikePrimaveraQuoteText(text = \"\") {\n  return /\\bORC\\.[A-Z0-9./-]+/i.test(text) && (\n    /\\bEAN\\s*:?\\s*\\d{8,14}/i.test(text) ||\n    /\\b\\d{2}\\.\\d{3}\\.\\d{3}\\.\\d{5}\\b/.test(text)\n  );\n}\n\nasync function extractRawTextWithPdfParse(buffer) {\n  try {\n    const parsed = await pdfParse(buffer);\n\n    return {\n      rawText: String(parsed?.text || \"\").trim(),\n      rawPages: Number(parsed?.numpages || 0),\n    };\n  } catch (error) {\n    console.warn(\"[quote-dossiers] pdf-parse raw text failed:\", error?.message || error);\n\n    return {\n      rawText: \"\",\n      rawPages: 0,\n    };\n  }\n}\n\nexport async function extractTextFromPdfBase64(pdfBase64) {\n  const normalizedBase64 = normalizeBase64Pdf(pdfBase64);\n\n  if (!normalizedBase64) {\n    throw new Error(\"PDF vazio ou inv\u00e1lido.\");\n  }\n\n  const buffer = Buffer.from(normalizedBase64, \"base64\");\n\n  if (!buffer.length) {\n    throw new Error(\"PDF vazio ou inv\u00e1lido.\");\n  }\n\n  const rawExtraction = await extractRawTextWithPdfParse(buffer);\n\n  try {\n    const rowExtraction = await extractTextWithBundledPdfJs(buffer);\n\n    if (looksLikePrimaveraQuoteText(rowExtraction.text)) {\n      return {\n        text: rowExtraction.text,\n        rawText: rawExtraction.rawText,\n        combinedText: [rowExtraction.text, rawExtraction.rawText].filter(Boolean).join(\"\\n\\n\"),\n        pages: rowExtraction.pages || rawExtraction.rawPages,\n        engine: rawExtraction.rawText ? \"pdfjs-row-text+pdf-parse-raw\" : \"pdfjs-row-text\",\n      };\n    }\n\n    console.warn(\"[quote-dossiers] pdfjs-row-text did not detect quote table; falling back to pdf-parse.\");\n  } catch (error) {\n    console.warn(\"[quote-dossiers] pdfjs-row-text fallback:\", error?.message || error);\n  }\n\n  return {\n    text: rawExtraction.rawText,\n    rawText: rawExtraction.rawText,\n    combinedText: rawExtraction.rawText,\n    pages: rawExtraction.rawPages,\n    engine: \"pdf-parse\",\n  };\n}\n");
patchRoute();

console.log("✅ Dossier customer raw-text fallback v6 aplicado.");
console.log("Alterado:");
console.log(" - server/services/quote-dossiers/pdfTextService.js");
console.log(" - server/routes/quoteDossiers.js");
console.log("");
console.log("Motivo:");
console.log(" - os artigos usam texto por coordenadas;");
console.log(" - o cliente pode aparecer melhor no texto bruto pdf-parse;");
console.log(" - agora o cliente é procurado em text + rawText + combinedText.");
console.log("");
console.log("Prova:");
console.log(" - /api/orcamentos-dossiers/version => quote-dossier-manual-runtime-v6");
console.log(" - resposta de extract traz customerDebug.hasRawText=true");
console.log("");
console.log("Next:");
console.log(" - cd server");
console.log(" - node --check routes/quoteDossiers.js");
console.log(" - node --check services/quote-dossiers/pdfTextService.js");
