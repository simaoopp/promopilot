#!/usr/bin/env node
// Legacy maintenance entrypoint. The original version embedded an obsolete
// service_role importer and silently overwrote the tenant-scoped source file.
// It must never regenerate the historical global-article implementation.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scriptPath = path.join(root, 'scripts/migrate-artigos-db-update-to-supabase.mjs');
const packagePath = path.join(root, 'package.json');
const command = 'node scripts/migrate-artigos-db-update-to-supabase.mjs';

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exitCode = 1;
}

function isTenantScoped(source) {
  // Check the real, canonical source. No copied or generated code is trusted.
  return /ARTICLE_MIGRATION_ORGANIZATION_ID/.test(source)
    && /\.eq\(['"]organization_id['"],\s*ORGANIZATION_ID\)/.test(source)
    && /onConflict:\s*['"]organization_id,artigo['"]/.test(source)
    && !/onConflict:\s*['"]artigo['"]/.test(source);
}

if (!fs.existsSync(scriptPath)) {
  fail('O importador não existe. Repor a versão revista do projeto; não é seguro recriar código antigo.');
} else if (!fs.existsSync(packagePath)) {
  fail('package.json não encontrado. Não foi efetuada qualquer alteração.');
} else {
  const source = fs.readFileSync(scriptPath, 'utf8');
  if (!isTenantScoped(source)) {
    fail('O importador não passou as verificações de isolamento por organização. Nenhum ficheiro foi alterado.');
  } else {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (pkg.scripts?.['migrate:articles-db-update'] === command) {
      console.log('OK: importador protegido e comando npm já configurado. Nenhum ficheiro alterado.');
    } else {
      // Only the package script may be registered; never overwrite the importer.
      pkg.scripts = { ...(pkg.scripts || {}), 'migrate:articles-db-update': command };
      fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
      console.log('OK: importador protegido. Comando npm registado sem modificar o importador.');
    }
  }
}
