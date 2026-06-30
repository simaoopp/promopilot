#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const patchRoot = path.resolve(__dirname, "..", "..");
const projectRoot = process.cwd();

const files = [
  "src/styles/print.css",
  "server/services/automatic-campaigns/labelHtmlService.js",
  "server/services/automatic-campaigns/pdfGeneratorService.js",
  "docs/EXPERT_LABEL_BORDER_COLOR_V3.md",
];

for (const rel of files) {
  const from = path.join(patchRoot, rel);
  const to = path.join(projectRoot, rel);

  if (!fs.existsSync(from)) {
    throw new Error(`Ficheiro em falta no patch: ${rel}`);
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`✔ ${rel}`);
}

console.log("\n✅ Bordas das etiquetas corrigidas para #ec6707.");
console.log("Valida com: npm run build");
