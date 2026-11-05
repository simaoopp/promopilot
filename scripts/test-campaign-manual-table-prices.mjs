import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { detectSimpleColumns, projectRows, priceState, priceInCents } from '../src/shared/campaign-price-import/model.js';

const file = new URL('../supabase/migrations/20261105183000_manual_campaign_prices_from_table.sql', import.meta.url);
const sql = readFileSync(file, 'utf8');
const cell = text => ({ text: String(text ?? '') });
const sheet = rows => ({ name: 'Origem', rows: rows.map(row => row.map(cell)) });

test('campanha manual reconhece ambas as colunas sem recorrer ao catálogo', () => {
  const data = sheet([['Artigo', 'Descrição', 'PVP2 ANTES', 'PVP2 ATUAL'],
    ['04.701.001.00107', 'Galaxy Tab S11', '1099,99', '799,99']]);
  const mapping = detectSimpleColumns(data).mapping;
  assert.equal(mapping.originalColumn, 2);
  assert.equal(mapping.priceColumn, 3);
  const [row] = projectRows(data, mapping);
  assert.equal(row.originalCents, 109999);
  assert.equal(row.cents, 79999);
  assert.equal(priceState(row.originalCents, row.cents), 'Promoção');
  assert.equal(row.cents - row.originalCents, -30000);
});

test('campanha manual também aceita PVP2 e PVP2PROMO', () => {
  const data = sheet([['Código', 'PVP2', 'PVP2PROMO'], ['A.01', '1449,99', '1399,99']]);
  const [row] = projectRows(data, detectSimpleColumns(data).mapping);
  assert.equal(row.originalCents, 144999);
  assert.equal(row.cents, 139999);
});

test('preço anterior em falta ou inválido não pode ser inventado', () => {
  const empty = sheet([['Artigo', 'PVP2 ANTES', 'PVP2 ATUAL'], ['A.01', '', '899,99']]);
  assert.equal(projectRows(empty, detectSimpleColumns(empty).mapping)[0].originalCents, null);
  assert.equal(priceInCents('1.999'), null);
});

test('a função SQL seleciona apenas identificação e descrição na consulta manual', () => {
  const section = sql.slice(sql.indexOf("if p_payload->>'mode'='manual' then"), sql.indexOf('    else\n     select count(*),(jsonb_agg(to_jsonb(a)))->0', sql.indexOf("if p_payload->>'mode'='manual' then")));
  assert.match(section, /a\.article_id/);
  assert.doesNotMatch(section, /a\.pvp2|to_jsonb\(a\)/i);
  assert.match(sql, /problem:='missing_table_before'/);
  assert.match(sql, /problem:='invalid_table_before'/);
  assert.match(sql, /prior:=\(v->>'originalCents'\)::bigint/);
  assert.match(sql, /if p_payload->>'mode'='excel' and coalesce\(v->>'originalRawPrice',''\)<>'' then/);
});

test('migração só substitui a RPC, sem editar articles, triggers ou tabelas', () => {
  assert.match(sql, /create or replace function public\.campaign_price_import\(/i);
  assert.doesNotMatch(sql, /update\s+public\.articles|alter\s+table|create\s+trigger|delete\s+from\s+public\.articles/i);
});
