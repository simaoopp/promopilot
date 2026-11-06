import { normalizeCampaignDate } from "../campaign-label/campaignDates.js";

const MONTHS = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const fold = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const DATE_TOKEN = "(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}(?:[-/.]\\d{4})?|\\d{1,2}(?:\\s+de\\s+|[/ -])[a-z]{3,10}\\.?(?:(?:\\s+de\\s+|[/ -])\\d{4})?)";
const START = /^(?:data\s+(?:de\s+)?)?inicio$|^(?:de|desde)$/;
const END = /^(?:data\s+(?:de\s+)?)?fim$|^(?:ate|validade)$/;

export function readImportDate(cell, year) {
  if (cell === null || cell === undefined || cell === "") return "";
  const value = typeof cell === "object" ? cell : { text: String(cell) };
  // A serial date is legitimate in a date column, but remains unsafe as a code
  // or a price. Formula-derived dates are not trusted without a correction.
  if (value.date) return readImportDate(value.date);
  if (value.unsafe) return "";
  const text = fold(value.text);
  if (/^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{4})?)$/.test(text)) {
    return normalizeCampaignDate(text, year ?? NaN);
  }
  const match = /^(\d{1,2})(?:\s+de\s+|[/ -])([a-z]{3,10})\.?(?:(?:\s+de\s+|[/ -])(\d{4}))?$/.exec(text);
  const month = match && MONTHS[match[2].slice(0, 3)];
  return month ? normalizeCampaignDate(`${match[1]}/${month}/${match[3] || year || ""}`, NaN) : "";
}

function metadataDates(sheet, mapping, year) {
  const starts = new Set(), ends = new Set();
  let invalid = false;
  const addText = value => {
    const text = fold(value);
    const ranges = new RegExp(`(?:^|\\b)(?:campanha|valido|valida|validade|periodo)?\\s*(?:de|desde)?\\s*(${DATE_TOKEN})\\s+(?:a|ate|[-–—])\\s+(${DATE_TOKEN})(?![\\d/.-])`, "g");
    for (const match of text.matchAll(ranges)) {
      const explicitYear = /\b(20\d{2}|21\d{2}|2200)\b/.exec(`${match[1]} ${match[2]}`)?.[1];
      const start = readImportDate(match[1], explicitYear || year), end = readImportDate(match[2], explicitYear || year);
      if (!start || !end || end < start) invalid = true;
      starts.add(start); ends.add(end);
    }
    const labelled = new RegExp(`(?:^|\\b)(data (?:de )?inicio|inicio|desde|data (?:de )?fim|fim|ate|validade)\\s*[:=]?\\s*(${DATE_TOKEN})(?![\\d/.-])`, "g");
    for (const match of text.matchAll(labelled)) {
      (START.test(match[1]) ? starts : ends).add(readImportDate(match[2], year));
    }
  };
  addText(sheet.name);
  for (const row of sheet.rows.slice(0, Math.max(0, mapping.headerRow))) {
    addText([...new Set(row.filter(cell => !cell.unsafe).map(cell => cell.text).filter(Boolean))].join(" "));
    row.forEach((cell, index) => {
      const label = fold(cell.text).replace(/:$/, "").trim();
      if (START.test(label) || END.test(label)) {
        const date = readImportDate(row[index + 1], year);
        if (date) (START.test(label) ? starts : ends).add(date);
      }
    });
  }
  // Standalone validity/footer text can follow the articles. Never scan a
  // product description as document metadata.
  for (const row of sheet.rows.slice(Math.max(0, mapping.headerRow + 1))) {
    const values = [...new Set(row.filter(cell => !cell.unsafe).map(cell => String(cell.text || "").trim()).filter(Boolean))];
    if (values.length === 1 && /^(?:valido|valida|validade|periodo|campanha)\b/.test(fold(values[0]))) addText(values[0]);
  }
  return { starts: [...starts].filter(Boolean), ends: [...ends].filter(Boolean), invalid };
}

// No current-date fallback: a DD/MM uses the campaign's explicitly displayed
// year. Different valid row periods are preserved; contradictory headers need
// a choice, not a silent "first date wins" rule.
export function analyzeImportDates(entries, year, confirmed = {}) {
  const starts = new Set(), ends = new Set(), rowStarts = new Set(), rowEnds = new Set();
  let datedRows = 0, invalidMetadata = false;
  for (const { sheet, mapping, rows } of entries) {
    const metadata = metadataDates(sheet, mapping, year);
    if (metadata.invalid) invalidMetadata = true;
    metadata.starts.forEach(value => starts.add(value)); metadata.ends.forEach(value => ends.add(value));
    for (const row of rows) {
      if (row.classification === "excluded") continue;
      const start = readImportDate(row.extra?.startCell, year), end = readImportDate(row.extra?.endCell, year);
      if (start || end) datedRows++;
      if (start) rowStarts.add(start);
      if (end) rowEnds.add(end);
    }
  }
  const start = readImportDate(confirmed.dataInicio, year), end = readImportDate(confirmed.dataFim, year);
  const conflict = invalidMetadata || starts.size > 1 || ends.size > 1 ||
    [...rowStarts].some(value => starts.size && !starts.has(value)) ||
    [...rowEnds].some(value => ends.size && !ends.has(value)) ||
    Boolean(start && [...starts, ...rowStarts].some(value => value !== start)) ||
    Boolean(end && [...ends, ...rowEnds].some(value => value !== end));
  const unique = (metadata, article) => metadata.size === 1 ? [...metadata][0] : article.size === 1 ? [...article][0] : "";
  return {
    start: start || (conflict ? "" : unique(starts, rowStarts)),
    end: end || (conflict ? "" : unique(ends, rowEnds)),
    conflict, datedRows, perItem: rowStarts.size > 1 || rowEnds.size > 1,
    candidates: { starts: [...new Set([...starts, ...rowStarts])], ends: [...new Set([...ends, ...rowEnds])] },
  };
}

export function importRowDates(row, period, year, allowNoDates = false) {
  if (allowNoDates) return { start: "", end: "", error: "" };
  const startCell = row.extra?.startCell, endCell = row.extra?.endCell;
  const hasStart = Boolean(String(startCell?.text ?? "").trim()), hasEnd = Boolean(String(endCell?.text ?? "").trim());
  const start = period.overrideRows || !hasStart ? period.start : readImportDate(startCell, year);
  const end = period.overrideRows || !hasEnd ? period.end : readImportDate(endCell, year);
  return { start: start || "", end: end || "", error: validateImportPeriod(start, end) };
}

export function validateImportPeriod(start, end) {
  if (!readImportDate(start) || !readImportDate(end)) return "Indique as datas de início e fim.";
  return end < start ? "A data de fim não pode ser anterior à data de início." : "";
}

export function campaignDateText(iso) {
  const date = readImportDate(iso);
  return date ? date.split("-").reverse().join("/") : "";
}
