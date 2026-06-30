#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const patchRoot = path.resolve(__dirname, "..", "..");
const projectRoot = process.cwd();

const files = [
  "src/assets/expert-label-logo.png",
  "src/components/campaign/CampaignLabel.jsx",
  "src/styles/print.css",
  "server/services/automatic-campaigns/labelHtmlService.js",
  "server/services/automatic-campaigns/pdfGeneratorService.js",
  "docs/EXPERT_LABEL_BRANDING_V2.md",
];

for (const rel of files) {
  const from = path.join(patchRoot, rel);
  const to = path.join(projectRoot, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`✔ ${rel}`);
}

console.log("\n✅ Expert Label Branding V2 aplicado.");
console.log("Valida com: npm run build");
