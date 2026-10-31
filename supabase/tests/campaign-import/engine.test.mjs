import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { extractTable } from "../../src/shared/campaign-import/extract.js";
import {
  campaignItems,
  dateIso,
  discount,
  headersFor,
  moneyCents,
  suggestMapping,
  templateCompatible,
  validateConfig,
} from "../../src/shared/campaign-import/model.js";
import { obterPrecoSemPromocaoParaImpressao } from "../../src/shared/campaign-label/promotionPricing.js";
const config = {
  headerStart: 0,
  headerCount: 1,
  dataStart: 1,
  mapping: { code: 0, promo: 2 },
  locale: "auto",
  priceConfirmed: true,
  startDate: "2026-11-01",
  endDate: "2026-11-30",
};
const synthetic = Array.from({ length: 7 }, (_, i) => [
  `00${125 + i}`,
  `Synthetic product ${i + 1}`,
  "299,99",
  "399,99",
  "30",
  "499,99",
]);
for (const format of ["xlsx", "xls", "ods"])
  test(`${format}: real binary fixtures, multiple sheets, blank columns, formatted leading zeros`, () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["SKU", "", "Descrição", "Preço campanha"],
      [125, "", "Produto", 299.99],
    ]);
    sheet.A2.z = "00000";
    sheet.D2.z = "0.00";
    XLSX.utils.book_append_sheet(workbook, sheet, "Fornecedor");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(synthetic),
      "Sem cabeçalhos",
    );
    const bytes = XLSX.write(workbook, { type: "array", bookType: format });
    const parsed = extractTable({ bytes, name: `synthetic.${format}` });
    assert.equal(parsed.sheets.length, 2);
    assert.equal(parsed.sheets[0].rows[1][0], "00125");
    assert.equal(parsed.sheets[0].rows[1][1], "");
    assert.equal(parsed.sheets[1].rows.length, 7);
  });
test("CSV quoted semicolon, Portuguese decimals, embedded newline, BOM and escaped quotes", () => {
  const rows = extractTable({
    name: "test.csv",
    text: '\uFEFFSKU;Produto;Promo\r\n00125;"Produto; com\nlinha e ""aspas""";299,99',
  }).sheets[0].rows;
  assert.deepEqual(rows[1], [
    "00125",
    'Produto; com\nlinha e "aspas"',
    "299,99",
  ]);
});
test("TSV / spreadsheet clipboard / Markdown preserve codes and do not infer ambiguous price", () => {
  for (const input of [
    { name: "test.tsv", text: synthetic.map((r) => r.join("\t")).join("\n") },
    { text: synthetic.map((r) => r.join("\t")).join("\n") },
  ]) {
    const rows = extractTable(input).sheets[0].rows;
    assert.equal(rows.length, 7);
    assert.equal(rows[0][0], "00125");
    assert.equal(
      suggestMapping(["", "", "", "", "", ""], rows).mapping.promo,
      undefined,
    );
  }
  const rows = extractTable({
    name: "test.md",
    text: "| SKU | Promo |\n| --- | ---: |\n| ABC-001 | 2,99 |",
  }).sheets[0].rows;
  assert.deepEqual(rows, [
    ["SKU", "Promo"],
    ["ABC-001", "2,99"],
  ]);
});
test("HTML/email: inert extraction, entities, rowspans, colspans and multiple tables", () => {
  const result = extractTable({
    name: "test.html",
    text: '<img src="https://invalid.test/a"><script>throw Error("must not run")</script><table><tr><th rowspan="2">SKU</th><th colspan="2">Preço</th></tr><tr><th>Antes</th><th>Promo</th></tr><tr><td>00125</td><td>349,99</td><td>299,99 &euro;</td></tr></table><table><tr><td>B-1</td><td>12</td></tr></table>',
  });
  assert.equal(result.sheets.length, 2);
  assert.deepEqual(result.sheets[0].rows[1], ["SKU", "Antes", "Promo"]);
  assert.equal(result.sheets[0].rows[2][2], "299,99 €");
  const headers = headersFor(result.sheets[0], {
    headerStart: 0,
    headerCount: 2,
  });
  assert.equal(headers[2], "Preço · Promo");
});
test("mapping synonyms, arbitrary order, competing promo columns, costs and PVP1/2/3 never guessed", () => {
  assert.deepEqual(
    suggestMapping([
      "Preço campanha",
      "Custo",
      "SKU",
      "Produto",
      "PVP2",
      "PVP3",
    ]).mapping,
    { code: 2, description: 3, promo: 0 },
  );
  assert.equal(suggestMapping(["Promo", "Oferta"]).mapping.promo, undefined);
  assert.equal(
    suggestMapping([
      "PVP",
      "PVP1",
      "PVP2",
      "PVP3",
      "Valor líquido",
      "Preço recomendado",
    ]).mapping.promo,
    undefined,
  );
  assert.throws(
    () => validateConfig({ ...config, priceConfirmed: false }),
    /Confirme/,
  );
  assert.throws(
    () => validateConfig({ ...config, mapping: { code: 0, promo: 0 } }),
    /dois/,
  );
  assert.doesNotThrow(() =>
    validateConfig({ ...config, manualPrice: true, mapping: { code: 0 } }),
  );
});
test("precise money, ambiguous separators, empty/invalid/negative values", () => {
  for (const v of ["349,99", "349.99", "349,99 €", "EUR 349.99"])
    assert.equal(moneyCents(v), 34999);
  assert.equal(moneyCents("1 049,99"), 104999);
  assert.equal(moneyCents("1.049,99"), 104999);
  assert.equal(moneyCents("1,049.99"), 104999);
  for (const v of [
    "",
    null,
    "-1",
    "0",
    "NaN",
    "Infinity",
    "12abc",
    "1,234",
    "1.234",
    "1,2,3",
    "1.2345",
    "1e3",
    "1000000000",
  ])
    assert.equal(moneyCents(v), null, String(v));
  assert.equal(moneyCents("1.234", "pt"), 123400);
  assert.equal(moneyCents("1,234", "en"), 123400);
  assert.deepEqual(discount(34999, 29999), { saving: 5000, basisPoints: 1429 });
  assert.equal(discount(100, 100), null);
  assert.equal(discount(100, 101), null);
});
test("bounded inputs, bad quotes, zip damage, OCR/PDF explicitly unsupported", () => {
  assert.throws(
    () => extractTable({ name: "test.pdf", text: "%PDF" }),
    /não suportado/,
  );
  assert.throws(
    () =>
      extractTable({
        name: "test.csv",
        text: 'a;"unterminated',
        separator: ";",
      }),
    /aspas/,
  );
  assert.throws(
    () => extractTable({ name: "test.csv", text: "x".repeat(1001) }),
    /1000/,
  );
  assert.throws(
    () =>
      extractTable({
        name: "test.xlsx",
        bytes: new Uint8Array([80, 75, 1, 2]),
      }),
    /ZIP/,
  );
  assert.throws(
    () =>
      extractTable({
        name: "test.html",
        text: '<table><tr><td colspan="100000">x</td></tr></table>',
      }),
    /limites/,
  );
});
test("formula cache and potentially rounded numeric identifiers require review", () => {
  const wb = XLSX.utils.book_new(),
    ws = XLSX.utils.aoa_to_sheet([
      ["SKU", "Preço"],
      [1234567890123456, 10],
    ]);
  ws.B2.f = "5+5";
  XLSX.utils.book_append_sheet(wb, ws, "Sheet");
  const result = extractTable({
    name: "test.xlsx",
    bytes: XLSX.write(wb, { type: "array", bookType: "xlsx" }),
  });
  assert.equal(result.sheets[0].flags[1].length, 2);
});
test("templates require matching type, sheet and headers; arbitrary amounts/rows may change", () => {
  const template = {
    config: {
      ...config,
      fileType: "csv",
      sheet: "Sheet",
      headers: ["SKU", "Descrição", "Promo"],
    },
  };
  assert.equal(
    templateCompatible(
      template,
      {
        name: "Sheet",
        rows: [
          template.config.headers,
          ...synthetic.map((row) => row.slice(0, 3)),
        ],
      },
      "csv",
    ),
    true,
  );
  assert.equal(
    templateCompatible(
      template,
      { name: "Sheet", rows: [["Promo", "SKU", "Descrição"]] },
      "csv",
    ),
    false,
  );
});
test("campaign handover: existing items untouched, UUID/provenance, PVP2 snapshot overrides legacy PVP3", () => {
  const row = {
    state: "valid",
    row_index: 0,
    article_id: "uuid",
    code: "00125",
    description: "Product",
    before_cents: 34999,
    promo_cents: 29999,
    start_date: "2026-12-20",
    end_date: "2027-01-05",
    captured_at: "now",
  };
  const session = {
    id: "session",
    organization_id: "org",
    source: { hash: "hash" },
    config,
  };
  assert.equal(
    campaignItems([row], session, [{ codigo: "00125", antes: 1 }]).length,
    0,
  );
  const item = campaignItems([row], session)[0];
  assert.equal(item.article_id, "uuid");
  assert.equal(item.importacao.beforeCents, 34999);
  assert.equal(item.atual, 299.99);
  assert.equal(
    obterPrecoSemPromocaoParaImpressao({ ...item, pv3: 999 }, "pvp3"),
    349.99,
  );
  assert.equal(dateIso("15-10", "2026"), "2026-10-15");
  assert.equal(dateIso("31-02", "2026"), "");
  assert.equal(dateIso("29/02/2028"), "2028-02-29");
});
test("multirow headers and ISO campaign years are preserved; ambiguous dates cannot pass config", () => {
  assert.deepEqual(
    suggestMapping(["SKU · SKU", "Preço · Antes", "Preço · Promo"]).mapping,
    { code: 0, promo: 2, previous: 1 },
  );
  assert.throws(
    () => validateConfig({ ...config, startDate: "15/10/2026" }),
    /período/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...config,
        startDate: "1999-12-01",
        endDate: "1999-12-31",
      }),
    /período/,
  );
  const row = {
    state: "valid",
    row_index: 0,
    article_id: "uuid",
    code: "00125",
    description: "Product",
    before_cents: 34999,
    promo_cents: 29999,
    start_date: "2026-12-20",
    end_date: "2027-01-05",
  };
  const items = campaignItems([row, row], {
    id: "session",
    source: {},
    config,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].dataFim, "2027-01-05");
});
test("ZIP entry lies about expansion: rejected before SheetJS decoding", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["SKU", "Promo"],
      ["00125", 12],
    ]),
    "Sheet",
  );
  const bytes = new Uint8Array(
    XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      compression: true,
    }),
  );
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.length - 46; i++)
    if (
      view.getUint32(i, true) === 0x02014b50 &&
      view.getUint16(i + 10, true) === 8
    ) {
      view.setUint32(i + 24, 1, true);
      break;
    }
  assert.throws(() => extractTable({ bytes, name: "tampered.xlsx" }), /ZIP/);
});
test("columns after long introductory sections remain available for manual mapping", () => {
  const sheet = {
    rows: [
      ...Array.from({ length: 120 }, () => ["Title"]),
      ["SKU", "", "Promo"],
    ],
  };
  assert.deepEqual(headersFor(sheet, { headerStart: 120, headerCount: 1 }), [
    "SKU",
    "",
    "Promo",
  ]);
});
