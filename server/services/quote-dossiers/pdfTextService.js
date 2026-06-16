import { createRequire } from "node:module";
import pdfParse from "pdf-parse";

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

function makeRowTextFromItems(items = []) {
  const rows = [];

  for (const item of items) {
    const text = String(item?.str || "").trim();

    if (!text) continue;

    const x = getTextItemX(item);
    const y = getTextItemY(item);
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);

    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }

    row.items.push({ x, text });
  }

  rows.sort((a, b) => b.y - a.y);

  return rows
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x);

      return row.items
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean)
    .join("\n");
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

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });

    pageTexts.push(makeRowTextFromItems(content?.items || []));
  }

  return {
    text: pageTexts.join("\n\n").trim(),
    pages,
    engine: "pdfjs-row-text",
  };
}

function looksLikePrimaveraQuoteText(text = "") {
  return /\bORC\.[A-Z0-9./-]+/i.test(text) && (
    /\bEAN\s*:?\s*\d{8,14}/i.test(text) ||
    /\b\d{2}\.\d{3}\.\d{3}\.\d{5}\b/.test(text)
  );
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

  try {
    const rowExtraction = await extractTextWithBundledPdfJs(buffer);

    if (looksLikePrimaveraQuoteText(rowExtraction.text)) {
      return rowExtraction;
    }

    console.warn("[quote-dossiers] pdfjs-row-text did not detect quote table; falling back to pdf-parse.");
  } catch (error) {
    console.warn("[quote-dossiers] pdfjs-row-text fallback:", error?.message || error);
  }

  const parsed = await pdfParse(buffer);

  return {
    text: String(parsed?.text || "").trim(),
    pages: Number(parsed?.numpages || 0),
    engine: "pdf-parse",
  };
}
