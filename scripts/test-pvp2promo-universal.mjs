import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPromotionMapping, collectPromotionRows, projectPromotionRows, priceInCents } from '../src/shared/campaign-price-import/model.js';
const r = (...cols) => cols.map(text => ({ text: text === null ? '' : String(text) }));
const build = (name, rows) => ({ name, rows });
const sheets = [
 build('ENCASTRE A', [r('ORD','PUB','Artigo','Descricao','PVP2PROMO','PVP2'),r('1','','02.652.004.00283','Forno',null,'494,99')]),
 build('F OK encastre Rogerio', [r('ORD','PUB','Artigo','Descricao','PVP2PROMO','PVP2'),r('2','','06.862.008.00019','Coluna','27,99','68,99')]),
 build('Fclimatização-ambiente, aquecim', [r('Artigo','PVP2PROMO','PVP2'),r('03.631.007.00023','49,99','64,99')]),
 build('F-tv audio som-Vídeo e Imagem e', [r('Artigo','PVP2PROMO','PVP2'),r('01.673.003.00244','699,99','999,99')]),
 build('bose', [r('', '','',''),r('DESCRIÇÃO','CODIGO','PVP1P','PVP2P','PVP3','PVP4P','PVP5','PVP6P','Pç Padrão','Estado','Weip','PVP1','PVP2'),r('BOSE QC Ultra','01.675.010.00082','245,008','349,99','479,99','','','','','','','','479,99'),r('DESCRIÇÃO','CODIGO','PVP1P','PVP2P','PVP3','PVP4P','PVP5','PVP6P','Pç Padrão','Estado','Weip','PVP1','PVP2')]),
 build('mattel', [...Array.from({length:11},()=>r('Notas de campanha')),r('Artigo','Descricao','PVP2','PROMO'),r('12.683.001.00020','UNO','12,99','7,99')]),
 build('LEGO', [...Array.from({length:7},()=>r('Instruções')),r('Artigo','Descricao','Cod Barras','Sub Familia','PVP2','Stk AE','QtdVendAE','Preço promo','Desconto'),r('12.688.045.00002','LEGO Bunnie','','Animal Crossing','19,99',6,9,'13,99','30%')]),
 build('grupo seb',[r('Atenção: instruções'),r('Não é uma tabela')])
];
test('recognizes promotional-price aliases and variable header rows without guessing PVP2',()=>{
 const detected=sheets.map(detectPromotionMapping);
 assert.equal(detected.filter(Boolean).length,7);
 assert.equal(detected[7],null);
 assert.deepEqual(detected.slice(0,7).map(x=>x.mapping.priceColumn),[4,4,1,1,3,3,7]);
 assert.deepEqual(detected.slice(0,7).map(x=>x.mapping.originalColumn),[5,5,2,2,12,2,4]);
 assert.deepEqual(detected.slice(0,7).map(x=>x.mapping.headerRow),[0,0,0,0,1,11,7]);
});
test('skips blank promotional prices and repeated headers; retains source locations',()=>{
 const detected=sheets.map(detectPromotionMapping);
 const {rows,details}=collectPromotionRows(sheets,[0,1,2,3,4,5,6],Object.fromEntries(detected.map((x,i)=>[i,x?.mapping])));
 assert.equal(rows.length,6);
 assert.equal(details[0].totalPromotions,0);
 assert.deepEqual(rows.map(x=>x.cents),[2799,4999,69999,34999,799,1399]);
 assert.equal(rows.find(x=>x.code==='01.675.010.00082').sourceLine,3);
 assert.equal(rows.find(x=>x.code==='01.675.010.00082').originalCents,47999);
 assert.equal(rows[0].line,1);
 assert.equal(rows[5].line,6);
});
test('unfamiliar or ambiguous prices do not turn into a guessed promotion',()=>{
 const ambiguous=build('Ambiguous',[r('Artigo','PVP2P','PROMO','PVP2'),r('1','90','80','100')]);
 assert.equal(detectPromotionMapping(ambiguous),null);
 const bare=build('Prices',[r('Artigo','PVP2'),r('1','90')]);
 assert.equal(detectPromotionMapping(bare),null);
 assert.equal(priceInCents('245,008'),null);
 assert.equal(projectPromotionRows(sheets[0],detectPromotionMapping(sheets[0]).mapping).rows.length,0);
});
test('large supplier workbook is limited to 2000 actual promotions, not blank rows',()=>{
 const sheet=build('Large',[r('Artigo','PVP2PROMO'),...Array.from({length:4000},(_,i)=>r('Art'+i,i===33?'19,99':''))]);
 const mapping=detectPromotionMapping(sheet).mapping;
 assert.equal(projectPromotionRows(sheet,mapping).rows.length,1);
 const sheetTooMany=build('Too many',[r('Artigo','PVP2PROMO'),...Array.from({length:2001},(_,i)=>r('Art'+i,'10,00'))]);
 assert.throws(()=>projectPromotionRows(sheetTooMany,detectPromotionMapping(sheetTooMany).mapping),/mais de 2000/);
});
