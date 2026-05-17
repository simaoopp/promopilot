import * as cheerio from "cheerio";
import { applyAutomaticCampaignPriceRules } from "./priceRulesService.js";

const CODE_RE = /^\d{2}\.\d{3}\.\d{3}\.\d{5}$/;
const CODE_LINE_RE = /^\s*\d{2}\.\d{3}\.\d{3}\.\d{5}\b/;
const EAN_RE = /^\d{8,14}$/;

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeHtmlCell(value) {
  return cleanText(value).replace(/\s+/g, " ");
}

function stripHtml(html = "") {
  if (!html) return "";
  return cheerio.load(html).text("\n");
}

function normalizeEmailText(text = "") {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

function pick(cells, index) {
  return cleanText(cells[index] || "");
}

function rowFromCells(cells = [], index = 0) {
  const normalized = cells.map(normalizeHtmlCell);

  if (!CODE_RE.test(normalized[0] || "")) return null;
  if (normalized.length < 17) return null;

  return applyAutomaticCampaignPriceRules({
    id: `auto-${index}-${normalized[0]}`,
    codigo: pick(normalized, 0),
    artigo: pick(normalized, 0),
    descricao: pick(normalized, 1),
    pn: pick(normalized, 2),
    ean: pick(normalized, 3).replace(/\D/g, ""),
    pvp2Antes: pick(normalized, 4),
    pvp2Atual: pick(normalized, 5),
    pv3: pick(normalized, 6),
    estado: pick(normalized, 7),
    ae: pick(normalized, 8),
    aea: pick(normalized, 9),
    aev: pick(normalized, 10),
    a10: pick(normalized, 11),
    a1e: pick(normalized, 12),
    data: pick(normalized, 13),
    dataInicio: pick(normalized, 14),
    dataFim: pick(normalized, 15),
    alterado: pick(normalized, 16),
    info: normalized.slice(17).join(" ").trim(),
  });
}

function extractRowsFromHtml(html = "") {
  if (!html) return [];

  const $ = cheerio.load(html);
  const rows = [];

  $("tr").each((rowIndex, tr) => {
    const cells = [];

    $(tr)
      .find("th,td")
      .each((_cellIndex, cell) => {
        cells.push($(cell).text(" "));
      });

    const row = rowFromCells(cells, rowIndex);
    if (row) rows.push(row);
  });

  return rows;
}

function splitTabRow(line = "") {
  return line
    .split("\t")
    .map((cell) => cell.trim())
    .filter((cell, index, arr) => cell || index < arr.length - 1);
}

function rowFromTabLine(line = "", index = 0) {
  const cells = splitTabRow(line);
  return rowFromCells(cells, index);
}

function buildRowFromLooseLine(line = "", index = 0) {
  const tokens = cleanText(line).split(/\s+/).filter(Boolean);

  if (!CODE_RE.test(tokens[0] || "")) return null;

  const eanIndex = tokens.findIndex((token, tokenIndex) => tokenIndex > 0 && EAN_RE.test(token));
  if (eanIndex < 3) return null;

  const priceStartIndex = eanIndex + 1;
  const requiredAfterEan = 14;
  if (tokens.length < priceStartIndex + requiredAfterEan) return null;

  const afterEan = tokens.slice(priceStartIndex);
  const beforeEan = tokens.slice(1, eanIndex);
  const pn = beforeEan.slice(-1).join(" ");
  const descricao = beforeEan.slice(0, -1).join(" ") || beforeEan.join(" ");

  const infoStartIndex = priceStartIndex + 13;

  return applyAutomaticCampaignPriceRules({
    id: `auto-${index}-${tokens[0]}`,
    codigo: tokens[0],
    artigo: tokens[0],
    descricao,
    pn,
    ean: tokens[eanIndex].replace(/\D/g, ""),
    pvp2Antes: afterEan[0],
    pvp2Atual: afterEan[1],
    pv3: afterEan[2],
    estado: afterEan[3],
    ae: afterEan[4],
    aea: afterEan[5],
    aev: afterEan[6],
    a10: afterEan[7],
    a1e: afterEan[8],
    data: afterEan[9],
    dataInicio: afterEan[10],
    dataFim: afterEan[11],
    alterado: afterEan[12],
    info: tokens.slice(infoStartIndex).join(" "),
  });
}

function extractRowsFromText(text = "") {
  const normalized = normalizeEmailText(text);
  const lines = normalized.split("\n").filter((line) => CODE_LINE_RE.test(line));

  return lines
    .map((line, index) => rowFromTabLine(line, index) || buildRowFromLooseLine(line, index))
    .filter(Boolean);
}

function dedupeRows(rows = []) {
  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    const key = `${row.codigo || ""}__${row.ean || ""}__${row.dataInicio || ""}__${row.dataFim || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...row, id: row.id || `auto-${deduped.length}-${row.codigo}` });
  }

  return deduped;
}

function extractDateFromSubject(subject = "") {
  const match = String(subject || "").match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return "";

  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${fullYear}`;
}

export function parseAutomaticCampaignEmail({ text = "", html = "", subject = "" } = {}) {
  const rowsFromHtml = extractRowsFromHtml(html);
  const textSource = text || stripHtml(html);
  const rowsFromText = extractRowsFromText(textSource);
  const rows = dedupeRows([...rowsFromHtml, ...rowsFromText]);

  if (!rows.length) {
    throw new Error("Não foi encontrada uma tabela válida de campanha no email.");
  }

  return {
    title: String(subject || "").trim() || "Campanha automática",
    subjectDate: extractDateFromSubject(subject),
    rows,
    totalItems: rows.length,
  };
}
