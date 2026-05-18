import * as cheerio from "cheerio";
import { applyAutomaticCampaignPriceRules } from "./priceRulesService.js";
import { parseNumero, parseInteiro } from "./numberUtils.js";

const CODE_RE = /^\d{2}\.\d{3}\.\d{3}\.\d{5}$/;
const CODE_LINE_RE = /^\s*\d{2}\.\d{3}\.\d{3}\.\d{5}\b/;
const EAN_RE = /^\d{8,14}$/;
const MAX_REASONABLE_PRICE = 50000;

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

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function isLikelyEan(value) {
  const digits = digitsOnly(value);
  return EAN_RE.test(digits);
}

function isLikelyArticleCode(value) {
  return CODE_RE.test(cleanText(value));
}

function isLikelyPriceCell(value) {
  const raw = cleanText(value);
  if (!raw) return false;
  if (isLikelyArticleCode(raw) || isLikelyEan(raw)) return false;

  const normalized = raw
    .replace(/€/g, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9,.-]/g, "");

  if (!normalized) return false;
  if (!/^-?\d{1,5}([,.]\d{1,4})?$/.test(normalized)) return false;

  const price = parseNumero(raw);
  return Number.isFinite(price) && price >= 0 && price <= MAX_REASONABLE_PRICE;
}

function isLikelyStoreCell(value) {
  const raw = cleanText(value);
  if (!/^-?\d{1,4}$/.test(raw)) return false;
  const number = parseInteiro(raw);
  return Number.isFinite(number) && number >= 0 && number <= 9999;
}

function isLikelyEstadoCell(value) {
  return /^[A-Z]$/i.test(cleanText(value));
}

function findPriceTripletIndex(cells = []) {
  const maxLookahead = Math.min(cells.length - 2, 8);

  for (let index = 0; index < maxLookahead; index += 1) {
    if (
      isLikelyPriceCell(cells[index]) &&
      isLikelyPriceCell(cells[index + 1]) &&
      isLikelyPriceCell(cells[index + 2])
    ) {
      return index;
    }
  }

  return -1;
}

function findStoreSequenceIndex(cells = [], startIndex = 0) {
  const maxLookahead = Math.min(cells.length - 4, startIndex + 8);

  for (let index = startIndex; index <= maxLookahead; index += 1) {
    if (
      isLikelyStoreCell(cells[index]) &&
      isLikelyStoreCell(cells[index + 1]) &&
      isLikelyStoreCell(cells[index + 2]) &&
      isLikelyStoreCell(cells[index + 3]) &&
      isLikelyStoreCell(cells[index + 4])
    ) {
      return index;
    }
  }

  return -1;
}

function buildProtectedRow({ cells = [], index = 0, source = "email" } = {}) {
  const normalized = (Array.isArray(cells) ? cells : [])
    .map(normalizeHtmlCell)
    .filter((cell, cellIndex) => cell || cellIndex === 0);

  if (!normalized.length) return null;

  const codeIndex = normalized.findIndex((cell) => CODE_RE.test(cell));
  if (codeIndex < 0) return null;

  const codigo = normalized[codeIndex];
  const eanIndex = normalized.findIndex((cell, cellIndex) => cellIndex > codeIndex && isLikelyEan(cell));
  if (eanIndex < codeIndex + 2) return null;

  const ean = digitsOnly(normalized[eanIndex]);
  const beforeEan = normalized.slice(codeIndex + 1, eanIndex).filter(Boolean);
  if (!beforeEan.length) return null;

  const pn = beforeEan.length >= 2 ? beforeEan[beforeEan.length - 1] : "";
  const descricao = beforeEan.length >= 2 ? beforeEan.slice(0, -1).join(" ") : beforeEan.join(" ");

  if (!descricao || descricao.length < 3) return null;

  const afterEan = normalized.slice(eanIndex + 1).filter(Boolean);
  const priceIndex = findPriceTripletIndex(afterEan);
  if (priceIndex < 0) return null;

  const pvp2Antes = afterEan[priceIndex];
  const pvp2Atual = afterEan[priceIndex + 1];
  const pv3 = afterEan[priceIndex + 2];

  const afterPrices = afterEan.slice(priceIndex + 3);
  const estadoOffset = isLikelyEstadoCell(afterPrices[0]) ? 1 : 0;
  const estado = estadoOffset ? afterPrices[0] : "";
  const storeStart = findStoreSequenceIndex(afterPrices, estadoOffset);

  if (storeStart < 0) return null;

  const dataIndex = storeStart + 5;
  const rawItem = {
    id: `auto-${index}-${codigo}`,
    codigo,
    artigo: codigo,
    descricao,
    pn,
    ean,
    pvp2Antes,
    pvp2Atual,
    pv3,
    estado,
    ae: pick(afterPrices, storeStart),
    aea: pick(afterPrices, storeStart + 1),
    aev: pick(afterPrices, storeStart + 2),
    a10: pick(afterPrices, storeStart + 3),
    a1e: pick(afterPrices, storeStart + 4),
    data: pick(afterPrices, dataIndex),
    dataInicio: pick(afterPrices, dataIndex + 1),
    dataFim: pick(afterPrices, dataIndex + 2),
    alterado: pick(afterPrices, dataIndex + 3),
    info: afterPrices.slice(dataIndex + 4).join(" ").trim(),
    parserSource: source,
  };

  const pricedItem = applyAutomaticCampaignPriceRules(rawItem);

  if (!pricedItem.precoValido) return null;
  if (isLikelyEan(pricedItem.pvp2Antes) || isLikelyEan(pricedItem.pvp2Atual) || isLikelyEan(pricedItem.pv3)) return null;

  return pricedItem;
}

function rowFromCells(cells = [], index = 0, source = "cells") {
  return buildProtectedRow({ cells, index, source });
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

    const row = rowFromCells(cells, rowIndex, "html-table");
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
  return rowFromCells(cells, index, "tab-line");
}

function buildRowFromLooseLine(line = "", index = 0) {
  const tokens = cleanText(line).split(/\s+/).filter(Boolean);
  return rowFromCells(tokens, index, "loose-line");
}

function lineLooksLikeCampaignBoundary(line = "") {
  const normalized = cleanText(line).toLowerCase();
  return (
    !normalized ||
    normalized.startsWith("cumprimentos") ||
    normalized.includes("comercial") ||
    normalized.includes("expert praia") ||
    normalized.includes("susiarte") ||
    normalized.includes("www.") ||
    normalized.includes("facebook.com")
  );
}

function cellsFromCampaignBlock(blockLines = []) {
  const joinedWithTabs = blockLines.join("\t");
  const tabCells = splitTabRow(joinedWithTabs);
  if (tabCells.length >= 12 && CODE_RE.test(tabCells[0] || "")) {
    return tabCells;
  }

  const firstLineCells = splitTabRow(blockLines[0] || "");
  if (firstLineCells.length >= 12 && CODE_RE.test(firstLineCells[0] || "")) {
    return firstLineCells;
  }

  const normalizedLines = blockLines.map(cleanText).filter(Boolean);
  if (!normalizedLines.length) return [];

  if (normalizedLines.length >= 12 && CODE_RE.test(normalizedLines[0] || "")) {
    return normalizedLines;
  }

  return [];
}

function extractRowsFromMultilineBlocks(text = "") {
  const normalized = normalizeEmailText(text);
  const rawLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = [];

  for (let index = 0; index < rawLines.length; index += 1) {
    if (!CODE_LINE_RE.test(rawLines[index])) continue;

    const block = [rawLines[index]];

    for (let next = index + 1; next < rawLines.length; next += 1) {
      const nextLine = rawLines[next];
      if (CODE_LINE_RE.test(nextLine)) break;
      if (lineLooksLikeCampaignBoundary(nextLine) && block.length >= 10) break;
      block.push(nextLine);
    }

    const cells = cellsFromCampaignBlock(block);
    const row = rowFromCells(cells, rows.length, "multiline-block") || buildRowFromLooseLine(block.join(" "), rows.length);
    if (row) rows.push(row);
  }

  return rows;
}

function extractRowsFromText(text = "") {
  const normalized = normalizeEmailText(text);
  const lines = normalized.split("\n").filter((line) => CODE_LINE_RE.test(line));

  const rowsFromSingleLines = lines
    .map((line, index) => rowFromTabLine(line, index) || buildRowFromLooseLine(line, index))
    .filter(Boolean);

  const rowsFromMultilineBlocks = extractRowsFromMultilineBlocks(normalized);

  return dedupeRows([...rowsFromSingleLines, ...rowsFromMultilineBlocks]);
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
