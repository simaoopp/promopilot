import { classifyTableRows } from "./tableSections.js";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_PRICE_CENTS = 999999999;
export const IMPORT_KIND = "catalog-pvp2-v1";

// Prices are integer cents throughout preparation/review. Never guess a cost,
// PVP1 or PVP3 column and never remove arbitrary letters from a malformed price.
export function priceInCents(value) {
  if (typeof value === "number") {
    const cents = Math.round(value * 100);
    return Number.isFinite(value) && value > 0 && cents <= MAX_PRICE_CENTS &&
      Math.abs(value * 100 - cents) < 0.00001 ? cents : null;
  }
  let text = String(value ?? "").trim().replace(/^(?:EUR|€)\s*|\s*(?:EUR|€)$/gi, "").trim();
  // Spaces are accepted only as correctly grouped thousands, never as decimals.
  if (/\s/.test(text)) {
    if (!/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?$/.test(text)) return null;
    text = text.replace(/[ \u00a0\u202f]/g, "");
  }
  if (text.includes(",") && text.includes(".")) {
    const commaDecimal = text.lastIndexOf(",") > text.lastIndexOf(".");
    const pattern = commaDecimal ? /^\d{1,3}(?:\.\d{3})+,\d{1,2}$/ : /^\d{1,3}(?:,\d{3})+\.\d{1,2}$/;
    if (!pattern.test(text)) return null;
    text = commaDecimal ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else {
    // A lone separator followed by three digits is ambiguous: require review.
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return null;
    text = text.replace(",", ".");
  }
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_PRICE_CENTS ? cents : null;
}

export function priceState(before, after) {
  if (!Number.isInteger(before) || !Number.isInteger(after)) return "Pendente";
  return after < before ? "Promoção" : after === before ? "Sem alteração" : "Aumento";
}

export function money(cents) {
  return Number.isInteger(cents) ? new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(cents / 100) : "—";
}

// Compare the verified catalogue snapshot and the supplier-provided old price
// separately. An apparent discount in Excel may be an increase vs the catalogue.
export function sourceComparison(row, original, currentCents) {
  const catalogDelta = Number.isInteger(row.beforeCents) && Number.isInteger(currentCents)
    ? currentCents - row.beforeCents : null;
  const sourceDelta = Number.isInteger(original?.cents) && Number.isInteger(currentCents)
    ? currentCents - original.cents : null;
  return {
    catalogDelta,
    sourceDelta,
    differs: Number.isInteger(original?.cents) && Number.isInteger(row.beforeCents) &&
      original.cents !== row.beforeCents,
    contradicts: catalogDelta !== null && sourceDelta !== null &&
      (catalogDelta < 0) !== (sourceDelta < 0),
  };
}

export function headerLabels(sheet, headerRow) {
  const width = Math.max(0, ...sheet.rows.map(row => row.length));
  return Array.from({ length: width }, (_, index) => headerRow >= 0
    ? String(sheet.rows[headerRow]?.[index]?.text || `Coluna ${index + 1}`)
    : `Coluna ${index + 1}`);
}


// One-click, header-driven discovery. Only exact normalized names are trusted;
// confusing PVP2 with PVP2PROMO would create misleading discounts.
export const WAREHOUSE_CODES = Object.freeze(["AF", "A1", "A1E", "AE", "AEA", "A10", "AEV"]);
const AUTO_ALIASES = {
  code: ["artigo", "codigo", "cod artigo", "cod de artigo", "codigo artigo", "codigo de artigo", "nosso codigo", "codigo interno", "referencia", "ref", "referencia artigo", "sku", "code", "item code", "product code"],
  description: ["descricao", "designacao", "produto", "nome", "nome produto", "description", "product"],
  ean: ["ean", "ean13", "ean 13", "codigo barras", "codigo de barras", "barcode", "gtin", "gtin13"],
  original: ["pvp2 antes", "pvp 2 antes", "pvp antes", "pvp2 anterior", "pvp anterior", "preco antes", "preco anterior", "preco normal", "preco original", "pvp2", "pvp 2"],
  promo: ["pvp2promo", "pvp2 promo", "pvp 2 promo", "pvp 2 atual", "pvp2p", "pvp2 p", "pvp 2 p", "pvp2 atual", "pvp atual", "preco promo", "preco promocional", "preco de campanha", "preco campanha", "preco black friday", "promo", "promocao", "sale price"],
  start: ["data inicio", "data de inicio", "inicio", "de", "desde", "start"],
  end: ["data fim", "data de fim", "fim", "ate", "validade", "end"],
  information: ["info", "informacao", "informacoes", "tipo de alteracao", "tipo alteracao", "observacoes", "motivo"],
};
const autoHeader = text => String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
export function detectSimpleColumns(sheet, requestedHeaderRow) {
  let winner = null;
  const width = Math.max(0, ...sheet.rows.map(row => row.length));
  const indices = Number.isInteger(requestedHeaderRow) ? [requestedHeaderRow] : sheet.rows.map((_, index) => index);
  for (const headerRow of indices) {
    const normalized = Array.from({ length: width }, (_, i) =>
      autoHeader(sheet.rows[headerRow]?.[i]?.text).replace(/\s+(?:eur|euros)$/, ""));
    const candidates = {}, fields = {}, warehouses = {};
    for (const [key, aliases] of Object.entries(AUTO_ALIASES)) {
      candidates[key] = normalized.flatMap((name, i) => aliases.includes(name) ? [i] : []);
      if (candidates[key].length === 1) fields[key] = candidates[key][0];
    }
    // A dotted internal code is useful evidence; a numeric EAN is never a SKU guess.
    if (!candidates.code.length) {
      const sample = sheet.rows.slice(Math.max(0, headerRow + 1), headerRow + 21);
      const found = Array.from({ length: width }, (_, i) => i).filter(i => {
        if (normalized[i] && !/^coluna \d+$/.test(normalized[i])) return false;
        const values = sample.map(row => row[i]).filter(cell => cell?.text?.trim());
        return values.length >= 2 && values.every(cell => !cell.unsafe && /^\d{2}\.\d{3}\.\d{3}\.\d{5}$/.test(cell.text.trim()));
      });
      if (found.length === 1) { fields.code = found[0]; candidates.code = found; }
    }
    for (const code of WAREHOUSE_CODES) {
      const found = normalized.flatMap((name, i) => name === autoHeader(code) ? [i] : []);
      if (found.length === 1) warehouses[code.toLowerCase()] = found[0];
    }
    const essential = Number(fields.code !== undefined) + Number(fields.promo !== undefined);
    const score = essential * 20 + Number(candidates.code.length > 0) * 8 +
      Number(candidates.promo.length > 0) * 8 + Object.keys(fields).length * 3 + Object.keys(warehouses).length;
    if (!winner || score > winner.score) winner = { headerRow, fields, warehouses, candidates, score, essential };
  }
  if (!winner) return null;
  const { fields } = winner;
  return { ...winner, recognized: winner.essential === 2 && fields.code !== fields.promo,
    mapping: { version: 1, headerRow: winner.headerRow, codeColumn: fields.code ?? -1,
      priceColumn: fields.promo ?? -1, originalColumn: fields.original ?? -1,
      descriptionColumn: fields.description ?? -1, eanColumn: fields.ean ?? -1,
      startColumn: fields.start ?? -1, endColumn: fields.end ?? -1,
      informationColumn: fields.information ?? -1, warehouseColumns: winner.warehouses } };
}
export function safeWarehouseValues(cells, mapping={}) {
  const out={};
  for(const code of WAREHOUSE_CODES){
    const index=mapping[code.toLowerCase()];
    const raw=Number.isInteger(index)?String(cells[index]?.text??"").trim():"";
    if(!/^(?:0|[1-9]\d{0,6})(?:[.,]\d{1,2})?$/.test(raw))continue;
    const number=Number(raw.replace(",","."));
    if(Number.isFinite(number)&&number<=1000000)out[code.toLowerCase()]=number;
  }
  return out;
}

export function validateMapping(mapping, sheet) {
  const labels = headerLabels(sheet, mapping.headerRow);
  if (!Number.isInteger(mapping.headerRow) || mapping.headerRow < -1 || mapping.headerRow >= sheet.rows.length ||
      !Number.isInteger(mapping.codeColumn) || !Number.isInteger(mapping.priceColumn) ||
      mapping.codeColumn < 0 || mapping.priceColumn < 0 || mapping.codeColumn >= labels.length ||
      mapping.priceColumn >= labels.length || mapping.codeColumn === mapping.priceColumn ||
      (Number.isInteger(mapping.originalColumn) && mapping.originalColumn >= 0 &&
       (mapping.originalColumn >= labels.length || mapping.originalColumn === mapping.codeColumn || mapping.originalColumn === mapping.priceColumn))) {
    throw new Error("Escolha duas colunas distintas: código do artigo e PVP2 Atual.");
  }
  const keys = ["codeColumn", "priceColumn", "originalColumn", "descriptionColumn", "eanColumn", "startColumn", "endColumn", "informationColumn"];
  const selected = keys.map(key => mapping[key]).filter(value => value !== undefined && value !== -1);
  if (selected.some(value => !Number.isInteger(value) || value < 0 || value >= labels.length) ||
      new Set(selected).size !== selected.length) throw new Error("Cada campo precisa de uma coluna distinta e válida.");
  return labels;
}

export function projectRows(sheet, mapping) {
  validateMapping(mapping, sheet);
  const rows = classifyTableRows(sheet, mapping).map(({ cells, line, classification, reason }) => {
    const codeCell = cells[mapping.codeColumn];
    const priceCell = cells[mapping.priceColumn];
    const originalCell = Number.isInteger(mapping.originalColumn) && mapping.originalColumn >= 0
      ? cells[mapping.originalColumn] : null;
    return {
      line,
      classification,
      reason,
      code: codeCell?.unsafe ? "" : String(codeCell?.text ?? "").trim(),
      rawCode: String(codeCell?.text ?? ""),
      rawPrice: String(priceCell?.text ?? ""),
      cents: priceCell?.unsafe ? null : priceInCents(priceCell?.number ?? priceCell?.text),
      // Evidence from the supplier table, NEVER the catalog baseline. The SQL
      // import validates a mismatch and requires explicit human review.
      originalRawPrice: String(originalCell?.text ?? ""),
      originalCents: originalCell?.unsafe || !String(originalCell?.text ?? "").trim()
        ? null : priceInCents(originalCell?.number ?? originalCell?.text),
      warning: [codeCell?.unsafe, priceCell?.unsafe, originalCell?.unsafe].filter(Boolean).join(" · "),
      extra: {
        description: mapping.descriptionColumn >= 0 ? String(cells[mapping.descriptionColumn]?.text ?? "").trim() : "",
        ean: mapping.eanColumn >= 0 ? String(cells[mapping.eanColumn]?.text ?? "").trim() : "",
        warehouses: safeWarehouseValues(cells, mapping.warehouseColumns || {}),
        startCell: mapping.startColumn >= 0 ? cells[mapping.startColumn] : null,
        endCell: mapping.endColumn >= 0 ? cells[mapping.endColumn] : null,
      },
    };
  }); // Missing prices remain visible for review; they never use a catalogue fallback.
  if (!rows.length || rows.length > MAX_IMPORT_ROWS) throw new Error(`Importe entre 1 e ${MAX_IMPORT_ROWS} linhas de cada vez.`);
  return rows;
}

export function mappingMatches(template, sheet, headerRow) {
  return template?.version === 1 && JSON.stringify(template.headers) === JSON.stringify(headerLabels(sheet, headerRow));
}

export function isPriceImport(item) {
  return item?.campaignPriceImport?.kind === IMPORT_KIND;
}

export function mergeImportedItems(existing, incoming) {
  const codes = new Set(existing.map(item => String(item.codigo ?? item.artigo ?? "").trim()));
  if (incoming.some(item => codes.has(item.codigo))) throw new Error("Há artigos já presentes na campanha. Exclua essas linhas antes de confirmar.");
  return [...existing, ...incoming];
}
