import assert from 'node:assert/strict';
import test from 'node:test';
import {
  obterFormatoAutomaticoEtiqueta,
  applyAutomaticFormatRules,
  buildAutomaticPrintPages,
  buildManualCampaignPrintPages,
} from '../src/shared/campaign-label/formatRules.js';

const A5 = [
  // Washing, dishwashing and drying appliances, including commercial abbreviations.
  'Máq. Lavar Roupa LG 9kg', 'M.L.R. Bosch 8kg', 'MLR Samsung 10kg',
  'Máquina de lavar roupa 8kg', 'MAQ. LAV. ROUPA 7KG', 'Maq Lavar R. 9Kg',
  'Máq. Lavar Loiça Bosch 13 conjuntos', 'Máq. Lavar Louça 14 talheres',
  'M.L.L. BEKO 60cm', 'MLL Siemens', 'Maq. Lav. Loica 12 talheres',
  'Máq. Secar Roupa Bosch', 'M.S.R. BEKO', 'MSR 9kg',
  'Secador de roupa Bomba de Calor 9 Kg', 'Máquina Lavar/Secar 8/5kg',
  'Máquina de lavar e secar roupa 10/6', 'M.L.S. 8/5kg',
  // Fridges, combis and side-by-side / American refrigerators.
  'Frigorífico 2 portas HAIER', 'Frigorificos LG', 'FRIG. 1P BEKO',
  'Frigor. NO FROST', 'Frigorif. 300L', 'FRIGO 100L',
  'COMBINADO BOSCH 320L', 'COMBINADOS LG', 'COMB. NO FROST',
  'COMBIN. INOX 300L', 'SBS HAIER', 'S.B.S. Samsung',
  'SIDE BY SIDE LG', 'SIDE-BY-SIDE 550L', 'SxS 4 portas',
  'Frigorífico Americano 600L',
  // Water heating: esquentadores, termoacumuladores, bombas de calor.
  'Esquentador Vulcano 11L', 'ESQUENTADORES GÁS NATURAL',
  'ESQUENT. 14L', 'ESQUENTAD. VULCANO', 'ESQ. GN 11L',
  'ESQ. GPL 14L', 'ESQ. ESTQ. WTD11 AM1 E31 S3506',
  'ESQ. ESTANQUE 11L', 'TERMOACUMULADOR 80L', 'TERMOACUMULADORES 100L',
  'TERMOAC. 50L', 'TERMOACUM. 100L', 'TERMO ACUMULADOR ARISTON',
  'T. ACUM. 80L', 'TERMO ELETRICO 100L', 'BOMBA DE CALOR AQS 200L',
  'BOMBA CALOR AQS 300L', 'B. CALOR AQS 150L', 'B/CALOR 270L',
  'BC AQS 200L', 'B.C. AQS 300L', 'HEAT PUMP 200L',
  // Keep existing large-label categories working.
  'TV SAMSUNG 65 QLED', 'TELEVISÃO OLED LG 55',
  // TVs: SmartTV junto, abreviaturas e tecnologias de ecra.
  'Televisor LG 55 Polegadas', 'TELEV. 4K TCL', 'TELEVIS. 43P',
  'LG LED SmartTV FullHD 32LQ630B6LA', 'SAMSUNG SmartTV 4K 65',
  'LG MiniLED SmartTV 55', 'LG QNED 65QNED', 'HISENSE ULED 55U7',
  'LG NanoCell AI 55', 'TV LCD 32', 'LED TV 40', 'TVs 55 Samsung',
  // Jatos de agua e lavadoras de alta pressao.
  'Jato de Água 140 Bar', 'JATOS ÁGUA 120 BAR', 'Jato Água Bosch',
  'Jato de pressão Karcher', 'Jat. Agua 140 BAR', 'JAT. DE AGUA 160 BAR',
  'Lavadora Alta Pressão Kärcher K4',
  'Lavadora de Alta Pressão 160 BAR', 'Lavadora a Pressão 120 BAR',
  'Máquina de Lavar Alta Pressão 1600W', 'Maq. Lav. Pressão 2000W',
  'Maq. Alta Pressão 120 Bar', 'Hidrolavadora 140 bar',
  'Hidro Lavadora Bosch', 'Lava-Jato 120 Bar',
  'Pressure Washer 2000W', 'Jet Washer 140 Bar', 'Lavadora AP 150 Bar',
  'Lav. A. Pressao Kärcher', 'MLAP 2000W', 'M.L.A.P. 150 BAR',
  'MONITOR 32 POLEGADAS', 'MESA DE JANTAR', 'FOGÃO 5 BOCAS',
  'ARCA CONGELADORA', 'EXAUSTOR 60CM', 'GARRAFEIRA 35 GARRAFAS',
];

const A6 = [
  'FILTRO P/ M.L.L.', 'MOTOR FRIG. LG', 'RESISTENCIA M.L.R.',
  'GAVETA DE COMBINADO', 'TERMOSTATO TERMOACUMULADOR',
  'SUPORTE TV 55', 'CABO TV HDMI', 'SENSOR ESQUENTADOR',
  'KIT TERMOACUMULADOR', 'ESQ. ESQUERDO CESTO',
  'BOMBA DE AGUA DE JARDIM', 'BOMBA DE CIRCULAÇÃO',
  'SECADOR DE CABELO', 'MÁQUINA DE CAFÉ EXPRESSO',
  'AUSCULTADORES SEM FIOS', 'SMARTPHONE TVAX', '',
  'BICO P/ JATO DE AGUA', 'Lança jato de água',
  'Pistola p/ lavadora alta pressão', 'Mangueira de lavadora alta pressão',
  'Filtro Lavadora de Alta Pressão', 'Suporte SmartTV de parede',
  'TV Box Android 4K', 'BOX ANDROID TV 4K',
  'Stick TV 4K', 'Fire TV Stick 4K',
  'Lâmpada LED 9W', 'Jato de tinta impressora',
];

for (const description of A5) {
  test(`A5 — ${description}`, () => {
    assert.equal(obterFormatoAutomaticoEtiqueta(description), 'a5');
  });
}
for (const description of A6) {
  test(`A6 — ${description || '(vazio)'}`, () => {
    assert.equal(obterFormatoAutomaticoEtiqueta(description), 'a6');
  });
}

test('auto groups A6 first (4/sheet) then A5 (2/sheet)', () => {
  const items = [
    {descricao: 'M.L.R. 8KG'}, {descricao:'COMB. NO FROST'},
    {descricao:'TERMOAC. 80L'}, {descricao:'B/CALOR 200L'},
    {descricao:'Máquina de café'},
  ];
  const pages = buildAutomaticPrintPages(items, 'automatico');
  assert.deepEqual(pages.map(page => [page.layout, page.items.length]),
    [['a6', 1], ['a5', 2], ['a5', 2]]);
  assert.equal(applyAutomaticFormatRules({descricao: 'M.L.L.'}, 'automatico')._formato, 'a5');
  assert.deepEqual(buildManualCampaignPrintPages(items, false, 'a6').map(page => page.items.length), [4, 1]);
});
