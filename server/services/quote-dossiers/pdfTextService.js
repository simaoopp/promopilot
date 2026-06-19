import { createRequire } from "node:module";
import pdfParse from "pdf-parse";
import { extractCustomerFromQuoteText, normalizeCustomerName } from "./quoteDossierCustomerService.js";

const require = createRequire(import.meta.url);

function normalizeBase64Pdf(value = "") {
  return String(value || "")
    .replace(/^data:application\/pdf;base64,/i, "")
    .replace(/\s+/g, "")
    .trim();
}

function loadBundledPdfJs() {
  const candidates = [
    "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js",
    "pdf-parse/lib/pdf.js/v1.9.426/build/pdf.js",
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try next bundled pdf.js path.
    }
  }

  return null;
}

function toLoadingTask(pdfjsLib, uint8Data) {
  const documentOptions = {
    data: uint8Data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  };

  try {
    return pdfjsLib.getDocument(documentOptions);
  } catch {
    return pdfjsLib.getDocument(uint8Data);
  }
}

function getTextItemY(item) {
  return Number(item?.transform?.[5] || 0);
}

function getTextItemX(item) {
  return Number(item?.transform?.[4] || 0);
}

function rowsFromItems(items = []) {
  const rows = [];

  for (const item of items) {
    const text = String(item?.str || "").trim();

    if (!text) continue;

    const x = getTextItemX(item);
    const y = getTextItemY(item);
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);

    if (!row) {
      row = { y, x: 0, items: [] };
      rows.push(row);
    }

    row.items.push({ x, text });
  }

  rows.forEach((row) => {
    row.items.sort((a, b) => a.x - b.x);
    row.x = row.items[0]?.x || 0;
    row.text = row.items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
  });

  rows.sort((a, b) => b.y - a.y);

  return rows.filter((row) => row.text);
}

function makeRowTextFromItems(items = []) {
  return rowsFromItems(items)
    .map((row) => row.text)
    .filter(Boolean)
    .join("\n");
}

function extractCustomerFromSpatialRows(items = []) {
  const rows = rowsFromItems(items);

  if (!rows.length) return "";

  const exmoIndex = rows.findIndex((row) => /Exmo\.\(s\)\s*Sr/i.test(row.text) || /^Exmo/i.test(row.text));

  if (exmoIndex < 0) {
    return extractCustomerFromQuoteText(rows.map((row) => row.text).join("\n"));
  }

  const exmoX = rows[exmoIndex].x || 0;

  // Candidatos no mesmo bloco visual do destinatário.
  const neighborhood = [
    rows[exmoIndex - 1],
    rows[exmoIndex + 1],
    rows[exmoIndex - 2],
    rows[exmoIndex + 2],
    rows[exmoIndex - 3],
    rows[exmoIndex + 3],
    rows[exmoIndex - 4],
    rows[exmoIndex + 4],
  ].filter(Boolean);

  for (const row of neighborhood) {
    if (Math.abs((row.x || 0) - exmoX) > 80) continue;

    const customer = normalizeCustomerName(row.text);
    if (customer) return customer;
  }

  return extractCustomerFromQuoteText(rows.map((row) => row.text).join("\n"));
}

async function extractTextWithBundledPdfJs(buffer) {
  const pdfjsLib = loadBundledPdfJs();

  if (!pdfjsLib?.getDocument) {
    throw new Error("pdf.js bundled não disponível.");
  }

  const uint8Data = new Uint8Array(buffer);
  const loadingTask = toLoadingTask(pdfjsLib, uint8Data);
  const pdf = loadingTask?.promise ? await loadingTask.promise : await loadingTask;
  const pages = Number(pdf?.numPages || 0);
  const pageTexts = [];
  const customerCandidates = [];

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });

    const items = content?.items || [];

    pageTexts.push(makeRowTextFromItems(items));

    const customerCandidate = extractCustomerFromSpatialRows(items);
    if (customerCandidate) customerCandidates.push(customerCandidate);
  }

  return {
    text: pageTexts.join("\n\n").trim(),
    pages,
    engine: "pdfjs-row-text",
    customerCandidate: customerCandidates[0] || "",
  };
}

function looksLikePrimaveraQuoteText(text = "") {
  return /\bORC\.[A-Z0-9./-]+/i.test(text) && (
    /\bEAN\s*:?\s*\d{8,14}/i.test(text) ||
    /\b\d{2}\.\d{3}\.\d{3}\.\d{5}\b/.test(text)
  );
}

async function extractRawTextWithPdfParse(buffer) {
  try {
    const parsed = await pdfParse(buffer);

    return {
      rawText: String(parsed?.text || "").trim(),
      rawPages: Number(parsed?.numpages || 0),
      rawCustomerCandidate: extractCustomerFromQuoteText(String(parsed?.text || "")),
    };
  } catch (error) {
    console.warn("[quote-dossiers] pdf-parse raw text failed:", error?.message || error);

    return {
      rawText: "",
      rawPages: 0,
      rawCustomerCandidate: "",
    };
  }
}

export async function extractTextFromPdfBase64(pdfBase64) {
  const normalizedBase64 = normalizeBase64Pdf(pdfBase64);

  if (!normalizedBase64) {
    throw new Error("PDF vazio ou inválido.");
  }

  const buffer = Buffer.from(normalizedBase64, "base64");

  if (!buffer.length) {
    throw new Error("PDF vazio ou inválido.");
  }

  const rawExtraction = await extractRawTextWithPdfParse(buffer);

  try {
    const rowExtraction = await extractTextWithBundledPdfJs(buffer);
    const combinedText = [rowExtraction.text, rawExtraction.rawText].filter(Boolean).join("\n\n");
    const customerCandidate =
      rowExtraction.customerCandidate ||
      rawExtraction.rawCustomerCandidate ||
      extractCustomerFromQuoteText(combinedText);

    if (looksLikePrimaveraQuoteText(rowExtraction.text)) {
      return {
        text: rowExtraction.text,
        rawText: rawExtraction.rawText,
        combinedText,
        pages: rowExtraction.pages || rawExtraction.rawPages,
        engine: rawExtraction.rawText ? "pdfjs-row-text+pdf-parse-raw" : "pdfjs-row-text",
        customerCandidate,
      };
    }

    console.warn("[quote-dossiers] pdfjs-row-text did not detect quote table; falling back to pdf-parse.");
  } catch (error) {
    console.warn("[quote-dossiers] pdfjs-row-text fallback:", error?.message || error);
  }

  return {
    text: rawExtraction.rawText,
    rawText: rawExtraction.rawText,
    combinedText: rawExtraction.rawText,
    pages: rawExtraction.rawPages,
    engine: "pdf-parse",
    customerCandidate: rawExtraction.rawCustomerCandidate || "",
  };
}
