import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectSimpleColumns, safeWarehouseValues, projectRows, WAREHOUSE_CODES, priceInCents } from '../src/shared/campaign-price-import/model.js';

const headers = ['Código','Descrição','EAN','PVP2','PVP2PROMO','AF','A1','A1E','AE','AEA','A10','AEV'];
const values = ['01.673.003.00205','HAIER QLED','6976454831252','999,99','699,99','1','2','3','4','5','6','7'];
const cells = row => row.map(value => ({text:String(value)}));
const sheet = {name:'TV',rows:[cells(['Notas']),cells(headers),cells(values)]};

test('deteta linha 2 e os campos importantes sem configuração manual',()=>{
 const result=detectSimpleColumns(sheet);
 assert.equal(result.recognized,true);
 assert.equal(result.headerRow,1);
 assert.equal(result.mapping.codeColumn,0);
 assert.equal(result.mapping.priceColumn,4);
 assert.equal(result.mapping.descriptionColumn,1);
 assert.equal(result.mapping.eanColumn,2);
 assert.deepEqual(Object.keys(result.warehouses).sort(),WAREHOUSE_CODES.map(v=>v.toLowerCase()).sort());
});
test('encontra Código, Artigo, Referência, SKU e preços de fornecedor, sem os confundir com PVP2',()=>{
 for(const code of ['Artigo','Código','Código de artigo','Ref.','Referência','SKU','Nosso Código']){
  for(const price of ['PVP2PROMO','PVP2P','PVP2 ATUAL','Preço Promo','Promo']){
    const m=detectSimpleColumns({rows:[cells([code,'PVP2',price]),cells(['111','500','350'])]});
    assert.equal(m.recognized,true,`${code}/${price}`);
    assert.equal(m.mapping.codeColumn,0);
    assert.equal(m.mapping.priceColumn,2);
  }
 }
});
test('não adivinha qual o preço quando existem duas colunas promocionais',()=>{
 const found=detectSimpleColumns({rows:[cells(['Artigo','PROMO','PVP2PROMO'])]});
 assert.equal(found.recognized,false);
});
test('extrai armazéns por nomes exatos e não confunde AE, AEA, AEV',()=>{
 const mapping=detectSimpleColumns(sheet).mapping;
 const fields=safeWarehouseValues(cells(values),mapping.warehouseColumns);
 assert.deepEqual(fields,{af:1,a1:2,a1e:3,ae:4,aea:5,a10:6,aev:7});
 assert.deepEqual(safeWarehouseValues(cells(['','N/A']),{ae:0,aea:1}),{});
});
test('coloca PVP2PROMO como novo preço, preserva código e deixa linhas sem promoção de fora',()=>{
 const m=detectSimpleColumns(sheet).mapping;
 const result=projectRows({rows:[...sheet.rows,cells(['02','Sem promo','','59,99','','0','2'])]},m);
 assert.equal(result.length,1);
 assert.equal(result[0].code,values[0]);
 assert.equal(result[0].cents,69999);
 assert.equal(result[0].extra.ean,values[2]);
 assert.equal(result[0].extra.warehouses.aev,7);
 assert.equal(priceInCents('999,99'),99999);
});
test('armazéns inválidos ou em falta não se transformam falsamente em zero',()=>{
 assert.deepEqual(safeWarehouseValues(cells(['12','-1','1x','5,5']),{af:0,a1:1,ae:2,aea:3}),{af:12,aea:5.5});
});
