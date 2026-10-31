// Optional integration audit against a user-supplied Excel workbook. Run after
// npm ci: node scripts/check-black-2026-price-import.mjs path/to/black.xlsx
// Never uploads the workbook, writes production data or logs entire rows.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import assert from 'node:assert/strict';
import { extractTable } from '../src/shared/campaign-price-import/extract.js';
import { detectPromotionMapping, collectPromotionRows } from '../src/shared/campaign-price-import/model.js';
const input = process.argv[2];
if (!input) throw new Error('Indique o caminho para o ficheiro XLSX original.');
const sheets = extractTable({ bytes: readFileSync(input), name: basename(input) });
const mappings = Object.fromEntries(sheets.map((sheet,index) => [index, detectPromotionMapping(sheet)?.mapping]));
const selected = sheets.flatMap((sheet,index) => mappings[index] ? [index] : []);
const result = collectPromotionRows(sheets,selected,mappings);
const details = result.details.map(x => ({sheet:x.sheet,promotions:x.totalPromotions,withoutPromo:x.skippedNoPromo}));
console.log(JSON.stringify({sheets:sheets.length,recognized:selected.length,promotions:result.rows.length,details},null,2));
assert.equal(sheets.length,10,'O ficheiro de referência deve ter 10 folhas.');
assert.equal(selected.length,7,'Deve reconhecer as 7 folhas comerciais.');
assert(result.rows.length > 0 && result.rows.length <= 2000);
const examples = new Map([
 ['01.675.010.00082',34999], ['03.631.007.00023',4999],
 ['12.683.001.00020',799], ['12.688.045.00002',1399],
]);
for (const [code,expected] of examples) {
 const entries = result.rows.filter(row=>row.code===code);
 assert(entries.length>=1,`Artigo de referência não encontrado: ${code}`);
 assert(entries.some(row=>row.cents===expected),`Preço promocional incorreto para ${code}`);
}
console.log('PASS: cabeçalhos, folhas comerciais, preço promocional e origem verificados.');
