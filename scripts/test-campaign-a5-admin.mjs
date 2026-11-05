import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  obterFormatoAutomaticoEtiqueta as formato,
  explicarFormatoAutomaticoEtiqueta as explicar,
  validarTermosEtiquetas,
  buildAutomaticPrintPages,
  normalizarTermoEtiqueta,
} from '../src/shared/campaign-label/formatRules.js';

const categoriaA5 = [
  'Televisão', 'Televisões Samsung', 'TELEVISAO HISENSE', 'TELEVISORES SONY',
  'TELEVISOR LG 48 polegadas', 'SMARTTV TCL 32', 'SMART TV PHILIPS 65',
  'TV 24 POLEGADAS', 'OLED 97', 'ULED 75', 'QNED 43',
  'Máquina de lavar roupa LG 7kg', 'MAQUINAS DE LAVAR ROUPA',
  'Máq. lavar loiça 45cm', 'M.L.L. MIELE', 'MLR 9KG', 'M.S.R. 8KG',
  'Máquina secar roupa', 'Frigorífico', 'FRIGORÍFICOS',
  'FRIG. 2P', 'COMBINADO INOX', 'SBS 2 PORTAS',
  'Fogão 4 bicos', 'FOGOES 5 BOCAS', 'FOGÕES GÁS', 'FOGAO ELETRICO',
  'Esquentadores gás', 'TERMOACUMULADOR 80L', 'Bomba de calor 200L',
  'JATO DE ÁGUA 150BAR', 'HIDROLAVADORA KARCHER',
  'Máquina Lavar Alta Pressão', 'Fogões elétricos', 'TELEVISÃO LED 32',
];
const categoriaA6 = [
  'Teclado', 'TV BOX 4K', 'SUPORTE TV 55', 'CABO HDMI PARA SMART TV',
  'COMANDO TELEVISOR UNIVERSAL', 'SENSOR ESQUENTADOR',
  'MOTOR DE FRIGORIFICO', 'RESISTENCIA MLR', 'PEÇA PARA FOGÃO',
  'MANGUEIRA JATO DE AGUA', 'FILTRO LAVADORA PRESSAO',
  'MÁQUINA DE CAFÉ', 'Ferro de engomar', 'Frigorifico de brinquedo - acessorio',
  'câmara fotográfica', 'ATV 4 rodas', 'estante',
  'Forno de encastre', 'FORNO COMBINADO', 'Placa de cozinha',
  'Placa de indução', 'Monitor OLED', 'Arca congeladora',
  'Mesa de jantar', 'Cadeira', 'Exaustor', 'Garrafeira', 'Chaminé',
];
for (const item of categoriaA5) test(`categoria A5 – ${item}`, () => assert.equal(formato(item), 'a5'));
for (const item of categoriaA6) test(`resto A6 – ${item}`, () => assert.equal(formato(item), 'a6'));

test('expressões personalizadas por organização e sem substring', () => {
  const org1 = { a5: ['Frio Industrial', 'Maq. Especial'], a6: ['TV de brincar'] };
  const org2 = { a5: [], a6: [] };
  assert.equal(formato('Frio Industrial 500L', org1), 'a5');
  assert.equal(formato('Frio Industrial 500L', org2), 'a6');
  assert.equal(formato('Frigorífico', org1), 'a5');
  assert.equal(formato('TV de brincar para crianças', org1), 'a6');
  assert.equal(formato('TV de brincar para crianças', org2), 'a5');
  assert.equal(formato('Frio Industrial', { a5: ['rio'], a6: [] }), 'a6');
  assert.equal(explicar('Maq. Especial 500L', org1).motivo, 'Expressão A5 definida pelo administrador');
  assert.equal(normalizarTermoEtiqueta(' TELEVISÃO--SmartTV '), 'televisao smarttv');
});

test('regras personalizadas aplicadas à paginação manual, preservando 2 A5 e 4 A6 por folha', () => {
  const itens = Array.from({length:3}, (_, i) => ({ descricao:'Frio Industrial', id:i }))
    .concat([{descricao:'Teclado'},{descricao:'Televisão'}]);
  const layouts = buildAutomaticPrintPages(itens, 'automatico', { a5:['frio industrial'], a6:[] });
  assert.deepEqual(layouts.map(x => [x.layout,x.items.length]), [['a6',1],['a5',2],['a5',2]]);
});

test('validacao de abreviaturas personalizadas', () => {
  assert.deepEqual(validarTermosEtiquetas([' TV industrial ','Esq. novo']), ['TV industrial','Esq. novo']);
  assert.throws(() => validarTermosEtiquetas(['TV', 'tv']), /repetidas/);
  assert.throws(() => validarTermosEtiquetas(['a']), /entre 2 e 80/);
  assert.throws(() => validarTermosEtiquetas(Array(101).fill('A5')), /Máximo de 100/);
});

test('Excel chama classificador partilhado em vez de manter uma lista independente', () => {
  const source = readFileSync(new URL('../src/features/campaign/excel/excelCampaignUtils.js', import.meta.url), 'utf8');
  assert.match(source, /formatoA5Partilhado\(descricao, rules\)/);
  assert.doesNotMatch(source, /const palavrasA5\s*=/);
});

test('apenas categorias explicitamente pedidas são A5 por defeito', () => {
  for (const value of ['FORNO DE ENCASTRE','PLACA INDUCAO','FORNO COMBINADO', 'MONITOR QLED', 'ARCA 100L']) {
    assert.equal(formato(value), 'a6', value);
  }
  for (const value of ['TELEVISÃO 32', 'TV LG 97', 'M.L.L. 60cm', 'FRIGORÍFICO', 'FOGÃO 4 BOCAS', 'JATO DE ÁGUA']) {
    assert.equal(formato(value), 'a5', value);
  }
  assert.equal(formato('Placa de cozinha', {a5: ['Placa de cozinha'], a6: []}), 'a5');
  assert.equal(formato('Placa de cozinha', {a5: ['Placa de cozinha'], a6: ['Placa de cozinha']}), 'a6');
});
