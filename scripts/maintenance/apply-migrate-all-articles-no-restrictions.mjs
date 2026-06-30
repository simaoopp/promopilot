#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "scripts/migrate-artigos-db-update-to-supabase.mjs");

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!fs.existsSync(target)) {
  fail("Não encontrei scripts/migrate-artigos-db-update-to-supabase.mjs");
}

let code = fs.readFileSync(target, "utf8");

code = code.replace(
  'const VALID_ARTICLE_RE = /^\\d{2}\\.\\d{3}\\.\\d{3}\\.\\d{5}$/;\\n',
  '',
);

code = code.replace(
  `function articleHasValidFormat(row) {
  return VALID_ARTICLE_RE.test(row.artigo);
}

`,
  '',
);

code = code.replace(
  `    const newRowsAll = batch.filter((row) => !existingMap.has(row.artigo));
    const newRows = newRowsAll.filter(articleHasValidFormat);
    const skippedInvalidNewRows = newRowsAll.length - newRows.length;`,
  `    const newRows = batch.filter((row) => !existingMap.has(row.artigo));
    const skippedInvalidNewRows = 0;`,
);

code = code.replaceAll(
  "novos ignorados por formato",
  "novos ignorados",
);

code = code.replaceAll(
  "Novos ignorados por formato inválido",
  "Novos ignorados",
);

fs.writeFileSync(target, code, "utf8");

console.log("✅ Migração atualizada para inserir todos os artigos novos, sem restrição de formato.");
console.log("Ficheiro alterado:");
console.log(" - scripts/migrate-artigos-db-update-to-supabase.mjs");
console.log("");
console.log("Testa primeiro:");
console.log("ARTICLE_DB_UPDATE_BATCH_SIZE=50 NODE_OPTIONS=--dns-result-order=ipv4first npm run migrate:articles-db-update -- src/data/artigos.json --dry-run");
