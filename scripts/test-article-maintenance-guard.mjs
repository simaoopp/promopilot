import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const utility = new URL('./maintenance/apply-article-db-update-migration-script.mjs', import.meta.url);
const protectedScript = new URL('./migrate-artigos-db-update-to-supabase.mjs', import.meta.url);

function fixture(contents, pkg = { name: 'test-app', scripts: { build: 'echo OK' } }) {
  const cwd = mkdtempSync(join(tmpdir(), 'promopilot-maintenance-'));
  mkdirSync(join(cwd, 'scripts'));
  if (contents !== null) writeFileSync(join(cwd, 'scripts/migrate-artigos-db-update-to-supabase.mjs'), contents);
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg));
  return cwd;
}

function execute(cwd) {
  return spawnSync(process.execPath, [fileURLToPath(utility)], { cwd, encoding: 'utf8' });
}

test('maintenance registration never overwrites the verified tenant-scoped importer', () => {
  const original = readFileSync(protectedScript, 'utf8');
  const cwd = fixture(original);
  try {
    const result = execute(cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(cwd, 'scripts/migrate-artigos-db-update-to-supabase.mjs'), 'utf8'), original);
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.build, 'echo OK');
    assert.equal(pkg.scripts['migrate:articles-db-update'], 'node scripts/migrate-artigos-db-update-to-supabase.mjs');
    const again = execute(cwd);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /Nenhum ficheiro alterado/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('maintenance rejects a legacy global upsert without touching files', () => {
  const old = `const table = db.from('articles').upsert(rows, {onConflict: "artigo"});`;
  const original = { name: 'test-app', scripts: { test: 'node test.js' } };
  const cwd = fixture(old, original);
  try {
    const result = execute(cwd);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(cwd, 'scripts/migrate-artigos-db-update-to-supabase.mjs'), 'utf8'), old);
    assert.deepEqual(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')), original);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('maintenance refuses to generate an import script when none exists', () => {
  const cwd = fixture(null);
  try {
    const result = execute(cwd);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /não existe/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
