import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { extractTable, readDelimited, MAX_FILE_BYTES } from '../src/shared/campaign-price-import/extract.js';
import { priceInCents, priceState, headerLabels, projectRows, mappingMatches, mergeImportedItems } from '../src/shared/campaign-price-import/model.js';
const mapping={version:1,headerRow:0,codeColumn:0,priceColumn:2};
const table=[['Code','PVP1','Promo','PVP3','Description'],['0010025',900,299.99,1000,'Supplier description is ignored'],['01.673.003.00284',549.99,469.99,629.99,'TV']];
test('integer cents: decimal commas, thousands, currencies, decimal points',()=>{
 for(const [input,cents] of [['349,99 €',34999],['1 049,99',104999],['1\u00a0049,99',104999],['1.049,99',104999],['1,049.99',104999],['EUR 299,99',29999],['10',1000],[299.99,29999],[0.01,1]]) assert.equal(priceInCents(input),cents,input);
});
test('never silently coerce invalid prices or ambiguous separators',()=>{
 for(const input of ['',0,-1,NaN,Infinity,'399 99','1,000','1.000','1.2345','100 USD','price 12,99','-1','1e3','=1+2','12/10','12,34,56',1.001]) assert.equal(priceInCents(input),null,String(input));
});
test('CSV and clipboard preserve exact identifiers, quoted delimiters and multiline cells',()=>{
 const rows=readDelimited('Code;Description;Price\r\n"0010025";"A; B\nC";"299,99"',';');
 assert.equal(rows[1][0].text,'0010025');assert.equal(rows[1][1].text,'A; B\nC');assert.equal(rows[1][2].text,'299,99');
 const sheet=extractTable({text:'Code\tPrice\n01.673.003.00284\t469,99'})[0];
 assert.equal(projectRows(sheet,{...mapping,priceColumn:1})[0].cents,46999);
 assert.throws(()=>readDelimited('a;"unclosed',';'),/aspas/);
});
for(const bookType of ['xlsx','xls','ods']) test(`real ${bookType} workbook: selected price column only, multiple sheets`,()=>{
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(table),'Prices');
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Note'],['Other sheet']]),'Info');
 const sheets=extractTable({bytes:XLSX.write(workbook,{bookType,type:'array'}),name:`fixture.${bookType}`});
 assert.equal(sheets.length,2);const rows=projectRows(sheets[0],mapping);
 assert.equal(rows[0].code,'0010025');assert.equal(rows[0].cents,29999);
 assert.equal(rows[0].description,undefined);assert.equal(rows[0].pvp1,undefined);assert.equal(rows[1].code,'01.673.003.00284');
});
test('Excel custom zero padding is retained for codes',()=>{
 const book=XLSX.utils.book_new();const sheet=XLSX.utils.aoa_to_sheet([['Code','Price'],[123,29.99]]);sheet.A2.z='000000';
 XLSX.utils.book_append_sheet(book,sheet,'Prices');
 const result=extractTable({bytes:XLSX.write(book,{type:'array',bookType:'xlsx'}),name:'zeroes.xlsx'});
 assert.equal(projectRows(result[0],{...mapping,priceColumn:1})[0].code,'000123');
});
test('formula and unsafe numeric identifier are pending, never silently accepted',()=>{
 const book=XLSX.utils.book_new();const sheet=XLSX.utils.aoa_to_sheet([['Code','Price'],[1234567890123456,299.99]]);sheet.B2.f='10+20';
 XLSX.utils.book_append_sheet(book,sheet,'Prices');
 const result=extractTable({bytes:XLSX.write(book,{type:'array',bookType:'xlsx'}),name:'formulas.xlsx'});
 const row=projectRows(result[0],{...mapping,priceColumn:1})[0];assert.equal(row.code,'');assert.equal(row.cents,null);assert.ok(row.warning);
});
test('email HTML is parsed as table data without rendering markup',()=>{
 const sheets=extractTable({text:'<table><tr><th>Code</th><th>Promo</th></tr><tr><td>0010025</td><td>299,99</td></tr></table>'});
 const row=projectRows(sheets[0],{...mapping,priceColumn:1})[0];assert.equal(row.code,'0010025');assert.equal(row.cents,29999);
});
test('unfamiliar formats require explicit distinct price column; saved schema mismatch is detected',()=>{
 const sheet=extractTable({text:'Code;Cost;PVP1;Promo\n001;100;350;299,99'})[0];
 assert.throws(()=>projectRows(sheet,{...mapping,priceColumn:-1}));assert.throws(()=>projectRows(sheet,{...mapping,priceColumn:0}));
 const template={...mapping,headers:headerLabels(sheet,0)};assert.equal(mappingMatches(template,sheet,0),true);
 assert.equal(mappingMatches(template,{rows:[[{text:'Different'}]]},0),false);
});
test('headers after introductory rows and headerless tables use explicit row selection',()=>{
 const sheet=extractTable({text:'Supplier\nOctober\nCode;Promo\n001;299,99',delimiter:';'})[0];
 assert.equal(projectRows(sheet,{...mapping,headerRow:2,priceColumn:1})[0].line,4);
 const plain=extractTable({text:'001;299,99',delimiter:';'})[0];assert.equal(projectRows(plain,{...mapping,headerRow:-1,priceColumn:1})[0].code,'001');
});
test('same, higher and promotional prices have distinct states',()=>{
 assert.equal(priceState(34999,29999),'Promoção');assert.equal(priceState(19999,19999),'Sem alteração');assert.equal(priceState(14999,16999),'Aumento');assert.equal(priceState(100,null),'Pendente');
});
test('existing campaign rows are preserved; duplicates must be excluded explicitly',()=>{
 const existing=[{codigo:'old',antes:50,atual:40,extra:'keep'}],incoming=[{codigo:'new',antes:30,atual:20}];
 assert.deepEqual(mergeImportedItems(existing,incoming),[...existing,...incoming]);assert.throws(()=>mergeImportedItems(existing,[{codigo:'old'}]));assert.equal(existing.length,1);
});
test('file size, cell dimensions and campaign row count are bounded with explicit errors',()=>{
 assert.throws(()=>extractTable({bytes:new Uint8Array(MAX_FILE_BYTES+1),name:'big.xlsx'}),/10 MB/);
 const sheet={name:'Too big',rows:Array.from({length:2002},()=>[{text:'code'},{text:'12,00'}])};
 assert.throws(()=>projectRows(sheet,{...mapping,priceColumn:1}),/2000/);
 assert.throws(()=>extractTable({bytes:new Uint8Array([1,2,3]),name:'scan.pdf'}),/XLSX/);
});
