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
