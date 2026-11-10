import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuoteDossierFromText } from "../services/quote-dossiers/quoteDossierParser.js";
const special = "ORÇ000EXPPV Miele - French Door KFFD 6765 1,00 UN 4 299,9900 0,00 0,00 0,00 0,00 16,00 4 299,99";
const standard = (code, description, ean) => `${code} ${description} 1,00 UN 99,9900 0,00 16,00 99,99\nEAN:${ean}`;
const parse = text => parseQuoteDossierFromText(`Orçamentos OR ORC.QA/1\nArtigo Descrição Qtd. Un. Pr. Unitário IVA Valor\n${text}\nEste documento não serve de fatura`);

test("provisional Primavera code without EAN is retained between catalog items", () => {
  const { items } = parse([standard("02.000.001.00001", "QA - Equipamento A", "0000000000001"), special, standard("02.000.001.00002", "QA - Equipamento B", "0000000000002")].join("\n"));
  assert.equal(items.length, 3);
  assert.equal(items[1].articleCode, "ORÇ000EXPPV");
  assert.equal(items[1].description, "Miele - French Door KFFD 6765");
  assert.equal(items[1].reference, "KFFD 6765");
  assert.equal(items[1].ean, "");
  assert.equal(items[1].totalNumber, 4299.99);
  assert.equal(items[0].ean, "0000000000001"); assert.equal(items[2].ean, "0000000000002");
});
test("an all-provisional quote and decomposed Portuguese accents are supported", () => {
  const { items } = parse(special.normalize("NFD"));
  assert.equal(items.length, 1); assert.equal(items[0].articleCode, "ORÇ000EXPPV");
});
test("repeated codes, including identical codes and EANs, remain distinct quote lines", () => {
  const row = standard("02.000.001.00001", "QA - Equipamento A", "0000000000001");
  const { items } = parse([special, special.replace("6765", "6766"), row, row].join("\n"));
  assert.equal(items.length, 4); assert.equal(items[1].reference, "KFFD 6766");
});
test("metadata, totals and partial alphanumeric rows are not treated as equipment", () => {
  const { items } = parse(`ATCUD: QA-1\nORC.QA/1\nPT123456789 Conta bancária\nTransportado 4 299,99\nTotal ( EUR ) 4 299,99\n${special}\nABC123 Sem quantidade ou preço`);
  assert.equal(items.length, 1); assert.equal(items[0].articleCode, "ORÇ000EXPPV");
});
test("letter-digit supplier codes need no hard-coded ORÇ prefix", () => {
  const { items } = parse(special.replace("ORÇ000EXPPV", "TMP-123/QA"));
  assert.equal(items.length, 1); assert.equal(items[0].articleCode, "TMP-123/QA");
});
