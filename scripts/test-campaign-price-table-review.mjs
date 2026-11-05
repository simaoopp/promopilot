import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectSimpleColumns,
  projectRows,
  priceState,
  sourceComparison,
  priceInCents,
  money,
} from '../src/shared/campaign-price-import/model.js';

const cell = text => ({text:String(text ?? '')});
const makeSheet = (name,rows) => ({name,rows:rows.map(row=>row.map(cell))});

// The same field layout as the real "Sem título 1.ods" file supplied by the user.
const campaign = makeSheet('Folha1', [
  ['CODIGO','DESCRICAO','PN','EAN','PVP2 ANTES','PVP2 ATUAL','PV3','ESTADO','AE','AEA','AEV','A10','A1E','DATA','DATA INICIO','DATA FIM','ALTERADO PRIMAVERA','INFORMAÇÃO'],
  ['04.701.001.00163','SAMSUNG - Galaxy Tab S12+ 5G 256GB Cinzento SM-X846BZAREUB','SM-X846BZAREUB','8806099400415','1449,99','1399,99','1449,9','A','0','0','0','0','0','02/nov.','02/11','15/11','SIM','PROMO'],
  ['04.701.001.00107','SAMSUNG - Galaxy Tab S11 WiFi 128GB SM-X730NZAREUB','SM-X730NZAREUB','8806097712237','1099,99','799,99','999,9','P','0','0','0','0','0','02/nov.','02/11','15/11','SIM','PROMO'],
  ['04.701.001.00072','SAMSUNG -Galaxy Tab S10 FE Wifi 256 SM-X520NZAPEUB','SM-X520NZAPEUB','8806097194576','749,99','549,99','749,9','A','1','0','0','0','0','02/nov.','02/11','15/11','SIM','PROMO'],
]);

test('identifica automaticamente as duas colunas PVP2 distintas no ODS', () => {
  const d=detectSimpleColumns(campaign);
  assert.equal(d.recognized,true);
  assert.equal(d.mapping.headerRow,0);
  assert.equal(d.mapping.codeColumn,0);
  assert.equal(d.mapping.descriptionColumn,1);
  assert.equal(d.mapping.eanColumn,3);
  assert.equal(d.mapping.originalColumn,4);
  assert.equal(d.mapping.priceColumn,5);
  assert.equal(d.mapping.warehouseColumns.ae,8);
  assert.equal(d.mapping.warehouseColumns.a1e,12);
});

test('lê o preço novo da coluna ATUAL e preserva o preço ANTES apenas como evidência', () => {
  const rows=projectRows(campaign,detectSimpleColumns(campaign).mapping);
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(r=>r.cents),[139999,79999,54999]);
  assert.deepEqual(rows.map(r=>r.originalCents),[144999,109999,74999]);
  assert.equal(rows[0].rawPrice,'1399,99');
  assert.equal(rows[0].originalRawPrice,'1449,99');
  assert.equal(rows[0].extra.ean,'8806099400415');
  assert.equal(rows[2].extra.warehouses.ae,1);
  assert.equal(rows[1].extra.warehouses.ae,0);
});

test('distingue desconto da tabela de aumento em relação ao catálogo', () => {
  const mockCatalog={beforeCents:69999};
  const original={cents:109999};
  const c=sourceComparison(mockCatalog,original,79999);
  assert.deepEqual(c, {catalogDelta:10000,sourceDelta:-30000,differs:true,contradicts:true});
  assert.equal(priceState(mockCatalog.beforeCents,79999),'Aumento');
  assert.equal(priceState(original.cents,79999),'Promoção');
  assert.equal(money(c.catalogDelta).includes('100'),true);
});

test('não confunde PVP2 normal com o preço promocional de fornecedores', () => {
  const sheet=makeSheet('supplier',[['Artigo','PVP2','PVP2PROMO'],['A.001','999,99','699,99']]);
  const detected=detectSimpleColumns(sheet).mapping;
  assert.equal(detected.originalColumn,1);
  assert.equal(detected.priceColumn,2);
  const row=projectRows(sheet,detected)[0];
  assert.equal(row.cents,69999);
  assert.equal(row.originalCents,99999);
});

test('sem preço anterior na origem não gera comparação inventada', () => {
  const sheet=makeSheet('supplier',[['Artigo','Preço Promo'],['A.001','29,99']]);
  const mapping=detectSimpleColumns(sheet).mapping;
  assert.equal(mapping.originalColumn,-1);
  const row=projectRows(sheet,mapping)[0];
  assert.equal(row.originalRawPrice,'');
  assert.equal(row.originalCents,null);
  const comparison=sourceComparison({beforeCents:3499},null,row.cents);
  assert.equal(comparison.differs,false);
  assert.equal(comparison.sourceDelta,null);
});

test('não interpreta preços ambíguos ou fórmulas como preço anterior confirmado', () => {
  const sheet=makeSheet('supplier',[['Artigo','PVP2 ANTES','PVP2 ATUAL'],['A.001','1.999','999,99']]);
  const row=projectRows(sheet,detectSimpleColumns(sheet).mapping)[0];
  assert.equal(priceInCents('1.999'),null);
  assert.equal(row.originalCents,null);
  assert.equal(row.originalRawPrice,'1.999');
});
