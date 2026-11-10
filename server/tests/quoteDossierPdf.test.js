import assert from "node:assert/strict";
import { test } from "node:test";
import pdfParse from "pdf-parse";
import { generateQuoteDossierPdf } from "../services/quote-dossiers/quoteDossierPdfService.js";
import { normalizeDossierText, dossierFeatureRows, descriptionSource } from "../services/quote-dossiers/quoteDossierText.js";
import { inferCategory } from "../services/quote-dossiers/quoteDossierParser.js";

const dossier = Object.freeze({ budgetNumber: "QA/2026", customerName: "Cliente de demonstração", date: "2026-11-10", total: "1 234,56" });
const base = Object.freeze({ title: "Equipamento de demonstração", reference: "QA-001", category: "Equipamento", ean: "0000000000000", quantity: "2", total: "123,45" });
async function readPdf(items, metadata = dossier) {
  const buffer = await generateQuoteDossierPdf({ dossier: metadata, items });
  const pages = [];
  const parsed = await pdfParse(buffer, { pagerender: async page => {
    const { items: spans } = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    const text = spans.map(span => span.str).join(" ");
    pages.push({ text, spans });
    return text;
  } });
  return { buffer, pages, text: parsed.text, count: parsed.numpages };
}

test("copied controls and tabs are normalized without losing accents, symbols or zero", () => {
  assert.equal(normalizeDossierText("  Não\t\u0001  e\u0301\r\n230\u202fV\u200b  "), "Não é\n230 V");
  assert.equal(normalizeDossierText("± 2 °C; ≤ 42 dB; 5 µm; 20 Ω; 2 m²; 300 m³/h; 60 × 50 cm"), "± 2 °C; ≤ 42 dB; 5 µm; 20 Ω; 2 m²; 300 m³/h; 60 × 50 cm");
  assert.equal(normalizeDossierText(0), "0");
});

test("features keep label/value pairs from tabs or colons and only remove duplicate rows", () => {
  assert.deepEqual(dossierFeatureRows(["Características Principais", "Zonas Flexíveis:\tNão", "Tipo\tEncastre", "Tipo: Encastre", "Tipo: Livre instalação", "Texto livre"]), [
    ["Zonas Flexíveis", "Não"], ["Tipo", "Encastre"], ["Tipo", "Livre instalação"], ["", "Texto livre"],
  ]);
});

test("tabs from the reported dossier render as readable values in the actual PDF", async () => {
  const features = Object.freeze(["Zonas Flexíveis:\tNão", "Tipo de Instalação:\tEncastre", "Tipo de Controlo:\tTouch", "Potência:\t2 300 W"]);
  const { buffer, text, count } = await readPdf([Object.freeze({ ...base, features })]);
  assert.equal(count, 2);
  for (const value of ["Zonas Flexíveis", "Não", "Encastre", "Touch", "2 300 W"]) assert.ok(text.includes(value), value);
  assert.ok(!/[�]/.test(text));
  assert.ok(buffer.includes(Buffer.from("/FontFile2")), "fonts must be embedded, not dependent on the PDF reader");
  assert.equal(features[0], "Zonas Flexíveis:\tNão", "the input remains unchanged");
});

test("technical symbols survive PDF generation and text extraction", async () => {
  const symbols = "± 2 °C; ≤ 42 dB; 5 µm; 20 Ω; 2 m²; 300 m³/h; 60 × 50 cm";
  const { text } = await readPdf([{ ...base, features: [`Medições:\t${symbols}`] }]);
  // PDF.js maps the visually identical micro sign to Greek mu.
  assert.ok(text.normalize("NFKC").includes(symbols.normalize("NFKC")));
});

test("all features are retained beyond eight rows and every page has one footer", async () => {
  const features = Array.from({ length: 55 }, (_, i) => `Característica ${i + 1}: VALOR-${i + 1}`);
  const { text, pages, count } = await readPdf([{ ...base, features }]);
  assert.ok(count > 2);
  for (let i = 1; i <= features.length; i++) assert.ok(text.includes(`VALOR-${i}`), `missing feature ${i}`);
  pages.forEach((page, index) => {
    assert.equal((page.text.match(/Página \d+/g) || []).length, 1);
    assert.ok(page.text.includes(`Página ${index + 1}`));
    assert.ok(page.text.includes("DOSSIER DE EQUIPAMENTOS"));
    const body = page.spans.filter(span => span.str.trim() && span.transform[5] > 80 && span.transform[5] < 750);
    assert.ok(body.length > 0, "no orphan footer/blank pages");
  });
});

test("long descriptions, wrapped titles and oversized feature rows continue without truncation", async () => {
  const value = `${"Dados técnicos muito extensos. ".repeat(220)}ULTIMO-VALOR`;
  const { text, count, pages } = await readPdf([{ ...base,
    title: `${"Título longo de equipamento ".repeat(10)}FIM-TITULO`,
    technicalDescription: `${"Descrição longa do equipamento. ".repeat(100)}FIM-DESCRICAO`,
    features: [`Observações: ${value}`, "Última linha: FIM-FICHA"],
  }]);
  assert.ok(count > 3);
  for (const marker of ["FIM-TITULO", "FIM-DESCRICAO", "ULTIMO-VALOR", "FIM-FICHA"]) assert.ok(text.includes(marker), marker);
  const bodyText = pages.flatMap(page => page.spans.filter(span => span.transform[5] > 80 && span.transform[5] < 752 && !/continuação$/.test(span.str)).map(span => span.str)).join(" ");
  assert.equal((bodyText.match(/Dados\s+técnicos\s+muito\s+extensos\./g) || []).length, 220);
});

test("summary retains more than eighteen equipment entries and notes flow onto new pages", async () => {
  const items = Array.from({ length: 21 }, (_, i) => ({ ...base, title: `Equipamento ${i + 1} FIM-RESUMO-${i + 1}` }));
  const { text } = await readPdf(items, { ...dossier, notes: `${"Observação do orçamento.\n".repeat(50)}FIM-NOTAS` });
  assert.equal(text.split("FIM-RESUMO-21").length - 1, 2, "last equipment must be present in the index and its detail");
  assert.ok(text.includes("FIM-NOTAS"));
});

test("a description containing only a web address becomes a short link; it is never fetched", async () => {
  const url = "https://example.test/equipamento/modelo?search_query=QA001&results=1";
  assert.equal(descriptionSource(url).url, url);
  for (const invalid of ["javascript:alert(1)", "file:///etc/passwd", "https://user:password@example.test", "Descrição https://example.test"]) assert.equal(descriptionSource(invalid), null);
  const { buffer, text } = await readPdf([{ ...base, technicalDescription: url }]);
  assert.ok(text.includes("Fonte de informação"));
  assert.ok(text.includes("Consultar ficha do produto - example.test"));
  assert.ok(!text.includes("search_query"));
  assert.ok(buffer.includes(Buffer.from("/URI")));
});

test("missing and malformed images do not drop the equipment or create an empty picture page", async () => {
  const { text, count } = await readPdf([{ ...base, imageDataUrl: "data:image/png;base64,bm90LWFuLWltYWdl", features: ["Teste: VALOR-PRESERVADO"] }]);
  assert.equal(count, 2); assert.ok(text.includes("Fotografia indisponível")); assert.ok(text.includes("VALOR-PRESERVADO"));
  const empty = await readPdf([]); assert.equal(empty.count, 1); assert.ok(empty.text.includes("Não foram adicionados equipamentos"));
});

test("categories do not invent induction, American refrigeration or installation types", () => {
  assert.equal(inferCategory("BOSCH - Placa Vitroceramica Serie 6 PKF631FP3E"), "Placa vitrocerâmica");
  assert.equal(inferCategory("SAMSUNG - Combinado RB33J3515WW/EF"), "Frigorífico combinado");
  assert.equal(inferCategory("Placa de indução"), "Placa de indução");
  assert.equal(inferCategory("Placa Série 4"), "Placa de cozinha");
  assert.equal(inferCategory("Frigorífico Side by Side"), "Frigorífico americano/French Door");
  assert.equal(inferCategory("Micro-ondas"), "Micro-ondas");
  assert.equal(inferCategory("Forno Série 2"), "Forno");
});
