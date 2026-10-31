export const MAX_IMPORT_ROWS = 2000;
export const MAX_PRICE_CENTS = 999999999;
export const IMPORT_KIND = "catalog-pvp2-v1";

// Supplier names are hints only. Ambiguous/unknown columns always require mapping.
const HEADER_ALIASES = Object.freeze({
  code: ["artigo", "code", "codigo", "codigo artigo", "nosso codigo", "referencia", "ref", "sku", "item code", "reference"],
  promo: ["pvp2promo", "pvp2 promo", "pvp2p", "pvp 2 promocional", "promo", "promocao", "preco promo", "preco promocional", "preco campanha", "preco black friday", "preco promocao", "sale price"],
  original: ["pvp2", "pvp 2", "pvp2 antes", "preco anterior", "preco normal", "preco original"],
});

export function normalizedHeader(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function headerCandidates(row, field) {
  const aliases = new Set(HEADER_ALIASES[field].map(normalizedHeader));
  return row.flatMap((cell, index) => aliases.has(normalizedHeader(cell?.text)) ? [index] : []);
}

// Never guess by price magnitude, column position, or supplier brand. Auto-map
// only an unambiguous code + promotional-price header pair.
export function detectPromotionMapping(sheet) {
  let best = null;
  for (let headerRow = 0; headerRow < Math.min(sheet.rows.length, 40); headerRow += 1) {
    const row = sheet.rows[headerRow];
    const codes = headerCandidates(row, "code");
    const promos = headerCandidates(row, "promo");
    const originals = headerCandidates(row, "original");
    if (codes.length !== 1 || promos.length !== 1 || codes[0] === promos[0]) continue;
    // Multiple original prices are not guessed, even if a promo match is clear.
    const mapping = { version: 1, headerRow, codeColumn: codes[0], priceColumn: promos[0],
      originalColumn: originals.length === 1 && ![codes[0], promos[0]].includes(originals[0]) ? originals[0] : -1 };
    const candidate = { mapping, sheet: sheet.name, headerRow, confidence: "alta",
      promoLabel: String(row[promos[0]]?.text || ""), codeLabel: String(row[codes[0]]?.text || ""),
      originalLabel: mapping.originalColumn >= 0 ? String(row[mapping.originalColumn]?.text || "") : "",
      candidates: { code: codes.length, promo: promos.length, original: originals.length } };
    if (!best) best = candidate;
    else if (best.headerRow !== headerRow && (best.mapping.codeColumn !== mapping.codeColumn ||
      best.mapping.priceColumn !== mapping.priceColumn || best.mapping.originalColumn !== mapping.originalColumn)) {
      return null; // Conflicting header layouts in one sheet require manual review.
    }
  }
  return best;
}


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

export function headerLabels(sheet, headerRow) {
  const width = Math.max(0, ...sheet.rows.map(row => row.length));
  return Array.from({ length: width }, (_, index) => headerRow >= 0
    ? String(sheet.rows[headerRow]?.[index]?.text || `Coluna ${index + 1}`)
    : `Coluna ${index + 1}`);
}

export function validateMapping(mapping, sheet) {
  const labels = headerLabels(sheet, mapping.headerRow);
  if (!Number.isInteger(mapping.headerRow) || mapping.headerRow < -1 || mapping.headerRow >= sheet.rows.length ||
      !Number.isInteger(mapping.codeColumn) || !Number.isInteger(mapping.priceColumn) ||
      mapping.codeColumn < 0 || mapping.priceColumn < 0 || mapping.codeColumn >= labels.length ||
      mapping.priceColumn >= labels.length || mapping.codeColumn === mapping.priceColumn) {
    throw new Error("Escolha duas colunas distintas: código do artigo e PVP2 Atual.");
  }
  if (mapping.originalColumn !== undefined && mapping.originalColumn !== -1 &&
    (!Number.isInteger(mapping.originalColumn) || mapping.originalColumn < 0 ||
      mapping.originalColumn >= labels.length ||
      [mapping.codeColumn, mapping.priceColumn].includes(mapping.originalColumn))) {
    throw new Error("A coluna PVP2 da tabela deve ser diferente das colunas de artigo e promoção.");
  }
  return labels;
}

export function projectRows(sheet, mapping) {
  validateMapping(mapping, sheet);
  const rows = sheet.rows.slice(mapping.headerRow + 1).map((cells, index) => {
    const codeCell = cells[mapping.codeColumn];
    const priceCell = cells[mapping.priceColumn];
    return {
      line: mapping.headerRow + index + 2,
      code: codeCell?.unsafe ? "" : String(codeCell?.text ?? "").trim(),
      rawCode: String(codeCell?.text ?? ""),
      rawPrice: String(priceCell?.text ?? ""),
      cents: priceCell?.unsafe ? null : priceInCents(priceCell?.number ?? priceCell?.text),
      warning: [codeCell?.unsafe, priceCell?.unsafe].filter(Boolean).join(" · "),
    };
  }).filter(row => row.rawCode || row.rawPrice);
  if (!rows.length || rows.length > MAX_IMPORT_ROWS) throw new Error(`Importe entre 1 e ${MAX_IMPORT_ROWS} linhas de cada vez.`);
  return rows;
}

// Prefer explicit promotional prices. A blank PVP2PROMO is NOT a zero-price
// promotion and must not enter the campaign. Preserve original sheet/row
// coordinates for audit, even when several worksheets are combined.
export function projectPromotionRows(sheet, mapping) {
  validateMapping(mapping, sheet);
  const rows = [];
  let skippedNoPromo = 0;
  const headers = headerLabels(sheet, mapping.headerRow);
  for (let i = mapping.headerRow + 1; i < sheet.rows.length; i += 1) {
    const cells = sheet.rows[i];
    const codeCell = cells[mapping.codeColumn];
    const promoCell = cells[mapping.priceColumn];
    const rawPrice = String(promoCell?.text ?? "").trim();
    if (!rawPrice) { skippedNoPromo += 1; continue; }
    const rawCode = String(codeCell?.text ?? "").trim();
    // Tables such as BOSE repeat the same header between product groups.
    if (normalizedHeader(rawCode) === normalizedHeader(headers[mapping.codeColumn]) &&
        normalizedHeader(rawPrice) === normalizedHeader(headers[mapping.priceColumn])) continue;
    const originalCell = mapping.originalColumn >= 0 ? cells[mapping.originalColumn] : null;
    const originalRaw = String(originalCell?.text ?? "").trim();
    rows.push({
      line: i + 1, sourceLine: i + 1, sourceSheet: sheet.name,
      code: codeCell?.unsafe ? "" : rawCode,
      rawCode, rawPrice,
      cents: promoCell?.unsafe ? null : priceInCents(promoCell?.number ?? promoCell?.text),
      originalRawPrice: originalRaw,
      originalCents: originalCell?.unsafe || !originalRaw ? null : priceInCents(originalCell?.number ?? originalCell?.text),
      warning: [codeCell?.unsafe, promoCell?.unsafe, originalCell?.unsafe].filter(Boolean).join(" · "),
    });
    if (rows.length > MAX_IMPORT_ROWS) throw new Error(`A folha ${sheet.name} tem mais de ${MAX_IMPORT_ROWS} promoções. Divida a importação.`);
  }
  return { rows, skippedNoPromo };
}

// Returns a single bounded batch for all confidently mapped worksheets.
// Row numbers are unique within a batch; original coordinates remain intact.
export function collectPromotionRows(sheets, selectedIndexes, mappings) {
  const result = [], details = [];
  for (const index of selectedIndexes) {
    const sheet = sheets[index], mapping = mappings[index];
    if (!sheet || !mapping) throw new Error("Há folhas sem mapeamento. Reveja as colunas antes de continuar.");
    const projected = projectPromotionRows(sheet, mapping);
    details.push({ sheet: sheet.name, totalPromotions: projected.rows.length,
      skippedNoPromo: projected.skippedNoPromo, mapping: { ...mapping, headers: headerLabels(sheet, mapping.headerRow) } });
    for (const row of projected.rows) {
      result.push({ ...row, line: result.length + 1 });
      if (result.length > MAX_IMPORT_ROWS) throw new Error(`Há mais de ${MAX_IMPORT_ROWS} promoções selecionadas. Divida a importação.`);
    }
  }
  if (!result.length) throw new Error("As folhas selecionadas não contêm preços promocionais preenchidos.");
  return { rows: result, details };
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
