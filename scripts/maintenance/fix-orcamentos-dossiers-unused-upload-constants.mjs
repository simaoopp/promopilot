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

// Remove constantes/função que ficaram órfãs quando a validação de tamanho não foi aplicada.
source = source.replace(
  /\n?const\s+MAX_QUOTE_PDF_SIZE_BYTES\s*=\s*45\s*\*\s*1024\s*\*\s*1024;\s*\n\s*function\s+formatFileSize\s*\(\s*bytes\s*=\s*0\s*\)\s*\{\s*if\s*\(!Number\.isFinite\(bytes\)\s*\|\|\s*bytes\s*<=\s*0\)\s*return\s*["']0 MB["'];\s*return\s*`?\$\{\(bytes\s*\/\s*1024\s*\/\s*1024\)\.toFixed\(1\)\}\s*MB`?;\s*\}\s*/s,
  "\n",
);

// Variante mais tolerante para função formatFileSize multi-linha.
source = source.replace(
  /\n?const\s+MAX_QUOTE_PDF_SIZE_BYTES\s*=\s*45\s*\*\s*1024\s*\*\s*1024;\s*\n\s*function\s+formatFileSize\s*\([^)]*\)\s*\{[\s\S]*?return\s+`?\$\{\(bytes\s*\/\s*1024\s*\/\s*1024\)\.toFixed\(1\)\}\s*MB`?;\s*\}\s*/m,
  "\n",
);

// Se ainda existir apenas a constante e só for usada uma vez, remove para desbloquear CI.
const maxMatches = [...source.matchAll(/\bMAX_QUOTE_PDF_SIZE_BYTES\b/g)].length;
if (maxMatches === 1) {
  source = source.replace(/\n?const\s+MAX_QUOTE_PDF_SIZE_BYTES\s*=\s*[^;]+;\s*/m, "\n");
}

// Se ainda existir apenas a função e só for usada uma vez, remove.
const formatMatches = [...source.matchAll(/\bformatFileSize\b/g)].length;
if (formatMatches === 1) {
  source = source.replace(/\n?function\s+formatFileSize\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*/m, "\n");
}

// Limpa excesso de linhas vazias.
source = source.replace(/\n{4,}/g, "\n\n\n");

if (source === before) {
  console.log("ℹ️ Nenhuma alteração aplicada. O ficheiro pode já estar corrigido.");
} else {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("✅ Removidas constantes/função de upload não usadas em OrcamentosDossiers.jsx.");
}

console.log("Alterado/verificado:");
console.log(" - src/pages/OrcamentosDossiers.jsx");
console.log("");
console.log("Next:");
console.log(" - npm run build");
