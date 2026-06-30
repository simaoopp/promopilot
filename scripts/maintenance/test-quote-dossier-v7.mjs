#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { extractTextFromPdfBase64 } from "../../server/services/quote-dossiers/pdfTextService.js";
import { extractCustomerFromQuoteText } from "../../server/services/quote-dossiers/quoteDossierCustomerService.js";
import { parseQuoteDossierFromText } from "../../server/services/quote-dossiers/quoteDossierParser.js";

const root = process.cwd();
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error("Uso: node scripts/maintenance/test-quote-dossier-v7.mjs <ficheiro.pdf>");
  process.exit(1);
}

const absolutePdfPath = path.isAbsolute(pdfPath) ? pdfPath : path.join(root, pdfPath);

if (!fs.existsSync(absolutePdfPath)) {
  console.error(`❌ PDF não encontrado: ${absolutePdfPath}`);
  process.exit(1);
}

const pdfBase64 = fs.readFileSync(absolutePdfPath).toString("base64");
const extracted = await extractTextFromPdfBase64(pdfBase64);
const parsed = parseQuoteDossierFromText(extracted.text || extracted.rawText || "", {
  filename: path.basename(absolutePdfPath),
});

const combined = [
  extracted.customerCandidate,
  extracted.rawText,
  extracted.combinedText,
  extracted.text,
].filter(Boolean).join("\n\n");

const customer = extractCustomerFromQuoteText(combined) || parsed.customerName || "";

console.log(JSON.stringify({
  ok: true,
  engine: extracted.engine,
  pages: extracted.pages,
  customerCandidate: extracted.customerCandidate || "",
  parsedCustomer: parsed.customerName || "",
  finalCustomer: customer,
  budgetNumber: parsed.budgetNumber || "",
  total: parsed.total || "",
  items: parsed.items?.length || 0,
}, null, 2));

if (!customer) {
  console.error("❌ Cliente não extraído.");
  process.exit(2);
}
