#!/usr/bin/env node
// Leitura apenas; valida os ficheiros que o ZIP vai substituir antes de aplicar.
// Uso: node scripts/verificar-base-atualizacao-20261020.mjs C:\PromoPilot\promopilot
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const expected = {
  ".env.example": "0f0b4d9fcb6d382f63b701523cacf0b46b93d4376c470e2434a024ce77238bd7",
  "package.json": "9c1e64a25f8ead8e37433a135c5b82cd945f683845ea2b4c07bca5dbeb9eadae",
  "scripts/import-artigos-to-supabase.mjs": "adbc290388d06ed542338946dfca84b4fc01a66f07e8d175e06ac6722b4d71ee",
  "scripts/migrate-artigos-db-update-to-supabase.mjs": "f17d64d8421590358f3f5de9f3ed9d9160950d2ffc9f2915b1b6c720238aba14",
  "scripts/migrate-artigos-prices-to-supabase.mjs": "7ef3fa9d46679b64b546c7e6af0c058e6ddc0947c0ff1127003134d5b8f0bdd8",
  "scripts/qa_check.py": "5cc92d223a4f540c64643570a0009253863135d35393d75d0ca9e8b89ec3fef5",
  "server/services/articleRepository.js": "93efd388e62b56908207ad291f9429fbbfb2033a7c54a787488e0d961babbb82",
  "scripts/maintenance/apply-article-db-update-migration-script.mjs": "d8ccc352b671030309dbe6a775b74e7aa8a7a36a10684c657794eaf349c16acd"
};
const root = resolve(process.argv[2] || '.');
let errors = 0;
console.log(`A verificar a base em: ${root}`);
for (const [relative, hash] of Object.entries(expected)) {
  const path = join(root, ...relative.split('/'));
  if (!existsSync(path)) { console.error(`DIFERENTE: falta ${relative}`); errors++; continue; }
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (actual !== hash) { console.error(`DIFERENTE: ${relative}`); errors++; }
  else { console.log(`OK: ${relative}`); }
}
try {
  const status = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
  if (status.trim()) {
    console.warn('AVISO: existem alterações locais não guardadas em commit:');
    console.warn(status.trim().split('\n').slice(0,20).join('\n'));
    console.warn('Antes de copiar ficheiros, verifica que não vais sobrescrever trabalho local.');
  }
} catch { console.warn('AVISO: não foi possível confirmar o estado do Git; verifica-o manualmente.'); }
if (errors) {
 console.error(`BLOQUEADO: ${errors} ficheiro(s) não coincidem com o ZIP enviado. Não extraias o pacote por cima da pasta atual.`);
 process.exitCode = 1;
} else {
 console.log('BASE CONFIRMADA: os ficheiros a substituir coincidem com o ZIP enviado. Faz backup antes de aplicar.');
}
