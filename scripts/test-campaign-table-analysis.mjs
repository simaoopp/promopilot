import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { extractTable } from '../src/shared/campaign-price-import/extract.js';
import { detectSimpleColumns, projectRows, validateMapping, mappingMatches, headerLabels } from '../src/shared/campaign-price-import/model.js';
import { excludedCodes } from '../src/shared/campaign-price-import/tableSections.js';
import { analyzeImportDates, readImportDate, importRowDates, validateImportPeriod, campaignDateText } from '../src/shared/campaign-price-import/tableDates.js';

const make = (rows, name = 'Tabela') => ({ name, rows: rows.map(row => row.map(text => typeof text === 'object' ? text : { text: String(text ?? '') })) });
const headers = ['ARTIGO', 'DESCRIÇÃO', 'EAN13', 'PVP2', 'PVP2PROMO', 'DATA INÍCIO', 'DATA FIM', 'INFORMAÇÃO'];
const article = (code = '01.670.001.00003', start = '15/10/2026', end = '02/11/2026', info = 'PROMO') => [code, 'Máquina de lavar', '0123456789012', '349,99', '299,99', start, end, info];
const analyze = sheet => { const mapping = detectSimpleColumns(sheet).mapping; return { sheet, mapping, rows: projectRows(sheet, mapping) }; };

test('headers in first row; all exact fields including EAN and distinct PVP2', () => {
  const { mapping, rows } = analyze(make([headers, article()]));
  assert.deepEqual([mapping.codeColumn, mapping.eanColumn, mapping.originalColumn, mapping.priceColumn, mapping.startColumn, mapping.endColumn], [0, 2, 3, 4, 5, 6]);
  assert.equal(rows[0].code, '01.670.001.00003'); assert.equal(rows[0].originalCents, 34999); assert.equal(rows[0].cents, 29999);
});
test('titles before row 50 and arbitrary column order do not change meanings', () => {
  const order = [6, 4, 1, 3, 0, 7, 2, 5];
  const result = analyze(make([...Array.from({ length: 50 }, () => ['Fornecedor']), order.map(i => headers[i]), order.map(i => article()[i])]));
  assert.equal(result.mapping.headerRow, 50); assert.equal(result.mapping.codeColumn, 4); assert.equal(result.rows[0].cents, 29999); assert.equal(result.rows[0].originalCents, 34999);
});
test('accents, abbreviated titles, currencies and case are normalized safely', () => {
  const result = analyze(make([['cód. artigo', 'DESIGNAÇÃO', 'GTIN', 'Preço anterior (€)', 'PVP2P (EUR)', 'Desde', 'Até'], article().slice(0, 7)]));
  assert.equal(result.mapping.codeColumn, 0); assert.equal(result.mapping.priceColumn, 4); assert.equal(result.mapping.originalColumn, 3);
});
test('ambiguous real price columns require a choice; costs/PVP1/PVP3 are not promoted', () => {
  const sheet = make([['Artigo', 'PVP2', 'PVP2 Atual', 'Preço promo', 'PVP1', 'Custo'], ['001', '100', '80', '70', '110', '30']]);
  const found = detectSimpleColumns(sheet);
  assert.equal(found.mapping.priceColumn, -1); assert.deepEqual(found.candidates.promo, [2, 3]);
  assert.throws(() => projectRows(sheet, found.mapping));
  assert.equal(projectRows(sheet, { ...found.mapping, priceColumn: 3 })[0].cents, 7000);
  assert.equal(detectSimpleColumns(make([['EAN', 'PVP1', 'PVP3', 'Custo'], ['0123456789012', '12', '10', '9']])).mapping.codeColumn, -1);
});
test('only a safely structured internal code may supply an unnamed code column', () => {
  const result = detectSimpleColumns(make([['', 'PVP2', 'PVP2PROMO'], ['01.670.001.00003', '20', '10'], ['01.670.001.00004', '30', '15']]));
  assert.equal(result.mapping.codeColumn, 0);
  assert.equal(detectSimpleColumns(make([['', 'PVP2', 'PVP2PROMO'], ['0123456789012', '20', '10'], ['0123456789013', '30', '15']])).mapping.codeColumn, -1);
});
test('duplicate field assignments are rejected, including date/identity overlaps', () => {
  const sheet = make([headers, article()]), mapping = detectSimpleColumns(sheet).mapping;
  assert.throws(() => validateMapping({ ...mapping, eanColumn: mapping.codeColumn }, sheet));
});
for (const type of ['xlsx', 'xls', 'ods']) test(`${type} multi-sheet, native dates and leading zeroes survive extraction`, () => {
  const book = XLSX.utils.book_new();
  for (const name of ['Promo A', 'Promo B']) {
    const sheet = XLSX.utils.aoa_to_sheet([headers, ['0010025', 'Product', '0123456789012', 349.99, 299.99, new Date(2026, 9, 15), new Date(2026, 10, 2), 'PROMO']]);
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  const extracted = extractTable({ bytes: XLSX.write(book, { type: 'array', bookType: type }), name: `source.${type}` });
  assert.equal(extracted.length, 2);
  for (const sheet of extracted) {
    const entry = analyze(sheet); assert.equal(entry.rows[0].code, '0010025'); assert.equal(entry.rows[0].extra.ean, '0123456789012');
    const dates = analyzeImportDates([entry], 2026); assert.equal(dates.start, '2026-10-15'); assert.equal(dates.end, '2026-11-02');
  }
});
test('1904 date system is interpreted without a four-year shift', () => {
  const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([headers, article()]);
  book.Workbook = { WBProps: { date1904: true } };
  sheet.F2 = { t: 'n', v: 44848, z: 'dd/mm/yyyy' }; // 2026-10-15 in 1904 system
  XLSX.utils.book_append_sheet(book, sheet, 'Dates');
  const extracted = extractTable({ bytes: XLSX.write(book, { type: 'array', bookType: 'xlsx' }), name: 'dates.xlsx' });
  assert.equal(readImportDate(extracted[0].rows[1][5]), '2026-10-15');
});
test('unique period in titles and sheet name fills dates automatically', () => {
  for (const title of ['Campanha de 15/10/2026 a 02/11/2026', 'Válido de 15-10-2026 até 02-11-2026', 'Período 15/10 a 02/11/2026']) {
    const entry = analyze(make([[title], headers, article('001', '', '')]));
    const dates = analyzeImportDates([entry], 2026); assert.equal(dates.start, '2026-10-15', title); assert.equal(dates.end, '2026-11-02', title);
  }
  const entry = analyze(make([headers, article('001', '', '')], '15-10-2026 a 02-11-2026'));
  assert.equal(analyzeImportDates([entry], 2026).start, '2026-10-15');
});
test('separate labelled metadata cells and validity footer are read', () => {
  const entry = analyze(make([['Data início', '15/10/2026', 'Data fim', '02/11/2026'], headers, article('001', '', '')]));
  assert.equal(analyzeImportDates([entry], 2026).end, '2026-11-02');
  const footer = analyze(make([headers, article('001', '', ''), ['Validade: de 15/10/2026 até 02/11/2026']]));
  assert.equal(footer.rows.length, 1); assert.equal(analyzeImportDates([footer], 2026).start, '2026-10-15');
});
test('per-article dates remain distinct and are not a document conflict', () => {
  const entry = analyze(make([headers, article('001'), article('002', '20/10/2026', '04/11/2026')]));
  const dates = analyzeImportDates([entry], 2026); assert.equal(dates.perItem, true); assert.equal(dates.conflict, false);
  assert.equal(importRowDates(entry.rows[1], { start: '2026-01-01', end: '2026-01-05' }, 2026).start, '2026-10-20');
  assert.equal(importRowDates(entry.rows[1], { start: '2026-01-01', end: '2026-01-05', overrideRows: true }, 2026).start, '2026-01-01');
});
test('conflicting metadata or confirmed dates require review; never overwrite confirmed input', () => {
  const entry = analyze(make([['Campanha de 01/10/2026 a 20/10/2026'], ['Válido de 02/10/2026 até 25/10/2026'], headers, article('001', '', '')]));
  const dates = analyzeImportDates([entry], 2026); assert.equal(dates.conflict, true); assert.equal(dates.start, '');
  const kept = analyzeImportDates([entry], 2026, { dataInicio: '2026-10-07', dataFim: '2026-10-27' });
  assert.equal(kept.start, '2026-10-07'); assert.equal(kept.end, '2026-10-27'); assert.equal(kept.conflict, true);
});
test('no dates, invalid dates and reversed ranges never fabricate a period', () => {
  const entry = analyze(make([headers, article('001', '', '')]));
  assert.equal(analyzeImportDates([entry], 2026).start, ''); assert.ok(importRowDates(entry.rows[0], { start: '', end: '' }, 2026).error);
  for (const value of ['31/02/2026', '29/02/2025', '17/13/2026', '15/10 lixo', '01/02/9999']) assert.equal(readImportDate(value, 2026), '', value);
  assert.equal(readImportDate('15/10'), ''); assert.equal(readImportDate('15-10', 2026), '2026-10-15');
  assert.equal(readImportDate('02/nov.', 2026), '2026-11-02'); assert.equal(readImportDate('15 de outubro de 2026'), '2026-10-15');
  assert.ok(validateImportPeriod('2026-11-02', '2026-10-15')); assert.equal(campaignDateText('2027-01-15'), '15/01/2027');
});
test('formula dates are pending and excluded-section dates cannot seed a campaign', () => {
  const row = article('001', '', ''); row[5] = { text: '15/10/2026', unsafe: 'Fórmula' };
  const entry = analyze(make([headers, row, ['ATUALIZAÇÃO DE PVP'], article('002', '15/10/2026', '02/11/2026', '')]));
  assert.equal(analyzeImportDates([entry], 2026).start, '');
  assert.ok(importRowDates(entry.rows[0], { start: '2026-10-01', end: '2026-10-30' }, 2026).error);
});
test('trailing update/replacement sections exclude their articles, retain exact unique pipe codes', () => {
  const entry = analyze(make([headers, article(), ['ATUALIZAÇÃO DE PVP'], article('13.731.001.00044', '', '', ''), ['REPOSIÇÃO'], article('05.609.003.00042', '', '', ''), article('13.731.001.00044', '', '', '')]));
  assert.equal(entry.rows[0].classification, 'promotion'); assert.equal(entry.rows.filter(row => row.classification === 'excluded').length, 3);
  assert.equal(excludedCodes(entry.rows), '13.731.001.00044|05.609.003.00042');
});
test('descriptions never exclude; explicit metadata and ambiguous section boundaries differ', () => {
  const product = article('001'); product[1] = 'Produto com atualização de PVP e reposição';
  const entry = analyze(make([headers, product, article('002', '', '', 'ATUALIZAÇÃO DE PVP'), ['Possível reposição de PVP'], article('003'), ['REPOSIÇÃO DE PVP'], article('004'), ['Nova seleção'], article('005'), ['PROMOÇÕES'], article('006')]));
  assert.deepEqual(entry.rows.map(row => row.classification), ['promotion', 'excluded', 'review', 'review', 'review', 'promotion']);
});
test('normal tables, blank rows, repeated headers and observations do not create phantom articles', () => {
  const entry = analyze(make([['Fornecedor'], headers, article(), [], headers, ['Observações: preços sujeitos a confirmação 2026'], article('00001')]));
  assert.equal(entry.rows.length, 2); assert.ok(entry.rows.every(row => row.classification === 'promotion'));
});
test('insufficient rows remain pending instead of disappearing or receiving invented prices', () => {
  const missingPrice = article('00001'); missingPrice[4] = '';
  const missingBefore = article('00002'); missingBefore[3] = '';
  const missingCode = article('');
  const entry = analyze(make([headers, missingPrice, missingBefore, missingCode]));
  assert.equal(entry.rows.length, 3); assert.equal(entry.rows[0].cents, null); assert.equal(entry.rows[1].originalCents, null); assert.equal(entry.rows[2].code, '');
});
test('new date/info mappings fit existing supplier model version and retain header compatibility', () => {
  const { sheet, mapping } = analyze(make([headers, article()]));
  const template = { ...mapping, headers: headerLabels(sheet, mapping.headerRow) };
  assert.equal(mappingMatches(template, sheet, 0), true); assert.equal(template.version, 1); assert.equal(template.startColumn, 5);
  assert.equal(mappingMatches(template, make([headers.slice().reverse(), article()]), 0), false);
});
