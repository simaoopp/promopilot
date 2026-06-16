#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "src/pages/OrcamentosDossiers.jsx");

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!fs.existsSync(pagePath)) {
  fail(`Ficheiro não encontrado: ${path.relative(root, pagePath)}`);
}

let source = fs.readFileSync(pagePath, "utf8");

const before = source;

// O patch anterior inseriu constantes antes de "function fileToBase64",
// mas em alguns ficheiros a declaração era "async function fileToBase64".
// Resultado: "async const MAX_QUOTE_PDF_SIZE_BYTES...", que quebra o build.
source = source.replace(
  /\basync\s+const\s+MAX_QUOTE_PDF_SIZE_BYTES\s*=\s*/g,
  "const MAX_QUOTE_PDF_SIZE_BYTES = ",
);

// Garante que a função volta a ser async se tiver ficado sem o prefixo.
source = source.replace(
  /(\n|\r\n)function\s+fileToBase64\s*\(/,
  "$1async function fileToBase64(",
);

// Evita duplicar async caso já esteja correto.
source = source.replace(
  /\basync\s+async\s+function\s+fileToBase64\s*\(/g,
  "async function fileToBase64(",
);

if (source === before) {
  console.log("ℹ️ Nenhuma alteração aplicada. O ficheiro pode já estar corrigido.");
} else {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("✅ Corrigido SyntaxError async const em OrcamentosDossiers.jsx.");
}

console.log("Alterado/verificado:");
console.log(" - src/pages/OrcamentosDossiers.jsx");
console.log("");
console.log("Next:");
console.log(" - npm run build");
