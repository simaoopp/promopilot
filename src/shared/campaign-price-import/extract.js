import * as XLSX from "xlsx";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_ROWS = 5000;
const MAX_COLUMNS = 200;
const MAX_CELLS = 500000;

// Preserve quoted delimiters/newlines and leading zeroes; do not let a CSV
// parser coerce identifiers, scientific notation or comma decimals to numbers.
export function readDelimited(text, delimiter) {
  const rows = []; let row = [], cell = "", quoted = false, closed = false;
  const push = () => { row.push({ text: cell }); cell = ""; closed = false; };
  text = String(text).replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') { quoted = false; closed = true; }
      else cell += ch;
    } else if (ch === delimiter) push();
    else if (ch === "\n") { push(); rows.push(row); row = []; }
    else if (ch === '"' && !cell && !closed) quoted = true;
    else { if (closed) throw new Error("CSV inválido: caracteres após aspas de fecho."); cell += ch; }
    if (rows.length > MAX_SOURCE_ROWS || row.length > MAX_COLUMNS || cell.length > 10000) throw new Error("Tabela demasiado extensa. Divida o ficheiro.");
  }
  if (quoted) throw new Error("CSV inválido: falta fechar aspas.");
  if (cell || row.length || closed) { push(); rows.push(row); }
  return rows;
}

function detectDelimiter(text) {
  const candidates = ["\t", ";", ",", "|"].map(delimiter => {
    try {
      const rows = readDelimited(text, delimiter).filter(row => row.length > 1);
      const widths = new Map();
      rows.forEach(row => widths.set(row.length, (widths.get(row.length) || 0) + 1));
      const score = Math.max(0, ...widths.values());
      return { delimiter, score };
    } catch { return { delimiter, score: 0 }; }
  }).sort((a, b) => b.score - a.score);
  return candidates[0].delimiter;
}

function checkZip(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 4 || view.getUint32(0, true) !== 0x04034b50) return;
  // Bound declared expansion before SheetJS allocates worksheet data. Parsing
  // also runs in a terminable worker and bounds cells/rows independently.
  let expanded = 0, entries = 0;
  for (let i = 0; i + 46 <= data.length; i += 1) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;
    const size = view.getUint32(i + 24, true);
    expanded += size; entries += 1;
    if (expanded > 50 * 1024 * 1024 || entries > 3000) throw new Error("Ficheiro comprimido demasiado grande. Divida o documento.");
    i += 45 + view.getUint16(i + 28, true) + view.getUint16(i + 30, true) + view.getUint16(i + 32, true);
  }
}

function workbookSheets(workbook) {
  if (workbook.SheetNames.length > 30) throw new Error("Escolha um ficheiro com até 30 folhas.");
  let cells = 0;
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
    if (range.e.r >= MAX_SOURCE_ROWS || range.e.c >= MAX_COLUMNS) throw new Error("Folha demasiado extensa. Remova linhas/colunas vazias formatadas ou divida o ficheiro.");
    cells += (range.e.r + 1) * (range.e.c + 1);
    if (cells > MAX_CELLS) throw new Error("Demasiadas células. Divida o ficheiro.");
    const rows = Array.from({ length: range.e.r + 1 }, (_, r) => Array.from({ length: range.e.c + 1 }, (_, c) => {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) return { text: "" };
      let unsafe = cell.f ? "Fórmula: introduza um valor verificado." : "";
      if (cell.t === "e") unsafe = "Erro na célula de origem.";
      if (cell.t === "d" || (cell.t === "n" && XLSX.SSF.is_date(cell.z || ""))) unsafe = "Célula interpretada como data.";
      if (cell.t === "n" && (!Number.isFinite(cell.v) || Math.abs(cell.v) >= 1e15)) unsafe = "Precisão do código não garantida. Use texto.";
      return { text: cell.t === "n" ? XLSX.utils.format_cell(cell) : String(cell.v ?? ""),
        ...(cell.t === "n" ? { number: cell.v } : {}), ...(unsafe ? { unsafe } : {}) };
    }));
    return { name, rows };
  }).filter(sheet => sheet.rows.some(row => row.some(cell => cell.text)));
}

export function extractTable({ bytes, text, name = "Tabela colada", delimiter = "auto" }) {
  const data = bytes ? new Uint8Array(bytes) : null;
  if ((data?.length ?? new TextEncoder().encode(text || "").length) > MAX_FILE_BYTES) throw new Error("O limite por ficheiro é 10 MB.");
  const isText = !data || /\.(csv|tsv|txt)$/i.test(name);
  if (isText) {
    if (data) {
      const utf16 = data[0] === 0xff && data[1] === 0xfe;
      text = new TextDecoder(utf16 ? "utf-16le" : "utf-8", { fatal: true }).decode(data);
    }
    if (!String(text || "").trim()) throw new Error("Adicione uma tabela para continuar.");
    // SheetJS parses HTML tables as data; no supplier markup enters the DOM.
    if (/^\s*(?:<!doctype|<html|<table|<div|<!--)/i.test(text) && /<table[\s>]/i.test(text)) {
      return workbookSheets(XLSX.read(text, { type: "string", raw: true, cellNF: true, sheetRows: MAX_SOURCE_ROWS + 1 }));
    }
    const chosen = delimiter === "auto" ? detectDelimiter(text) : delimiter;
    return [{ name: "Tabela", rows: readDelimited(text, chosen) }];
  }
  if (!/\.(xlsx|xls|ods)$/i.test(name)) throw new Error("Use XLSX, XLS, ODS, CSV ou uma tabela colada.");
  checkZip(data);
  return workbookSheets(XLSX.read(data, { type: "array", cellNF: true, cellFormula: true, cellDates: false, sheetRows: MAX_SOURCE_ROWS + 1 }));
}
