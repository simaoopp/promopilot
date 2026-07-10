import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve("server/.env") });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ARTICLES_TABLE = process.env.ARTICLES_TABLE || "articles";
const DEFAULT_JSON_PATH = "src/data/artigos.json";
const BATCH_SIZE = Number(process.env.ARTICLE_DB_UPDATE_BATCH_SIZE || 500);
const VALID_ARTICLE_RE = /^\d{2}\.\d{3}\.\d{3}\.\d{5}$/;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no server/.env ou .env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function text(value) {
  return String(value ?? "").trim();
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeSearchValue(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompactSearchValue(value = "") {
  return normalizeSearchValue(value).replace(/[^a-z0-9]/g, "");
}

function buildSearchTerms(row) {
  return [
    normalizeSearchValue(
      [
        row.artigo,
        row.codigo_barras,
        row.descricao,
        row.titulo_oficial,
        row.descricao_oficial,
        row.marca,
        row.modelo,
        row.brand,
        row.categoria,
        row.subcategory,
      ].join(" "),
    ),
    normalizeCompactSearchValue(row.artigo),
    normalizeCompactSearchValue(row.codigo_barras),
    normalizeCompactSearchValue(row.descricao),
    normalizeCompactSearchValue(row.marca),
    normalizeCompactSearchValue(row.modelo),
    normalizeCompactSearchValue(row.brand),
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizePriceComparable(value) {
  const clean = text(value)
    .replace(/[^\d,.\-]/g, "")
    .trim();

  if (!clean || clean === "-") return "";

  if (clean.includes(",")) {
    return clean.replace(/\./g, "").replace(",", ".");
  }

  return clean;
}

function toNumericPrice(value) {
  const normalized = normalizePriceComparable(value);

  if (!normalized) return null;

  const numberValue = Number(normalized);

  if (!Number.isFinite(numberValue)) return null;

  return numberValue;
}

function normalizeArticle(item) {
  const artigo = text(item.artigo || item.artigo_interno);
  const codigoBarras = text(item.codigoBarras || item.codigo_barras);

  const row = {
    artigo,
    descricao: text(item.descricao),
    pvp1: text(item.pvp1),
    pvp2: text(item.pvp2),
    pvp3: text(item.pvp3),
    codigo_barras: codigoBarras,
    fonte_oficial: text(item.fonte_oficial),
    raw_hash: text(item.raw_hash),
    ultima_atualizacao: text(item.ultima_atualizacao) || null,
    titulo_oficial: text(item.titulo_oficial),
    descricao_oficial: text(item.descricao_oficial),
    caracteristicas_tecnicas: objectOrEmpty(item.caracteristicas_tecnicas),
    documentos_oficiais: arrayOrEmpty(item.documentos_oficiais),
    resumo_vendedor: text(item.resumo_vendedor),
    observacoes_ia: text(item.observacoes_ia),
    marca: text(item.marca),
    modelo: text(item.modelo),
    brand: text(item.brand),
    categoria: text(item.categoria),
    subcategory: text(item.subcategory),
    texto_grounding: text(item.texto_grounding),
  };

  row.search_terms = buildSearchTerms(row);

  return row;
}

function articleHasValidFormat(row) {
  return VALID_ARTICLE_RE.test(row.artigo);
}

async function loadArticles(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed?.artigos) ? parsed.artigos : Array.isArray(parsed) ? parsed : [];

  const byArticle = new Map();
  let skippedWithoutCode = 0;

  for (const item of list) {
    const row = normalizeArticle(item);

    if (!row.artigo) {
      skippedWithoutCode += 1;
      continue;
    }

    // Mantém a última ocorrência, tal como fazemos na geração do JSON a partir do ODS.
    byArticle.set(row.artigo, row);
  }

  return {
    articles: [...byArticle.values()],
    totalInJson: list.length,
    skippedWithoutCode,
    duplicateCount: list.length - skippedWithoutCode - byArticle.size,
  };
}

async function getExistingArticles(codes) {
  const { data, error } = await supabase
    .from(ARTICLES_TABLE)
    .select("artigo,descricao,pvp1,pvp2,pvp3,codigo_barras")
    .in("artigo", codes);

  if (error) throw error;

  return new Map((data || []).map((row) => [row.artigo, row]));
}

function rowChanged(nextRow, currentRow) {
  if (!currentRow) return false;

  return (
    text(currentRow.descricao) !== nextRow.descricao ||
    text(currentRow.pvp1) !== nextRow.pvp1 ||
    normalizePriceComparable(currentRow.pvp2) !== normalizePriceComparable(nextRow.pvp2) ||
    text(currentRow.pvp3) !== nextRow.pvp3 ||
    text(currentRow.codigo_barras) !== nextRow.codigo_barras
  );
}

function getChangedFields(nextRow, currentRow) {
  const changes = {};

  if (!currentRow) return changes;

  const checks = [
    ["descricao", text(currentRow.descricao), nextRow.descricao],
    ["pvp1", text(currentRow.pvp1), nextRow.pvp1],
    ["pvp2", normalizePriceComparable(currentRow.pvp2), normalizePriceComparable(nextRow.pvp2)],
    ["pvp3", text(currentRow.pvp3), nextRow.pvp3],
    ["codigo_barras", text(currentRow.codigo_barras), nextRow.codigo_barras],
  ];

  for (const [field, before, after] of checks) {
    if (before !== after) {
      changes[field] = {
        before: field === "pvp2" ? text(currentRow.pvp2) : before,
        after: field === "pvp2" ? nextRow.pvp2 : after,
      };
    }
  }

  return changes;
}

function makeExistingUpdateRows(rows, { pvp2Mode = "text" } = {}) {
  return rows.map((row) => ({
    artigo: row.artigo,
    descricao: row.descricao,
    pvp1: row.pvp1,
    pvp2: pvp2Mode === "numeric" ? toNumericPrice(row.pvp2) : row.pvp2,
    pvp3: row.pvp3,
    codigo_barras: row.codigo_barras,
    search_terms: row.search_terms,
  }));
}

function makeInsertRows(rows, { pvp2Mode = "text" } = {}) {
  return rows.map((row) => ({
    ...row,
    pvp2: pvp2Mode === "numeric" ? toNumericPrice(row.pvp2) : row.pvp2,
  }));
}

function isNumericPvp2Error(error) {
  const message = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    message.includes("invalid input syntax for type numeric") ||
    message.includes("column \"pvp2\" is of type numeric") ||
    message.includes("numeric")
  );
}

async function upsertWithPvp2Fallback(rows, makeRows, options = {}) {
  if (!rows.length) return "none";

  const initialMode = process.env.ARTICLE_PVP2_MODE === "numeric" ? "numeric" : "text";
  const payload = makeRows(rows, { pvp2Mode: initialMode });

  const { error } = await supabase
    .from(ARTICLES_TABLE)
    .upsert(payload, { onConflict: "artigo" });

  if (!error) return initialMode;

  if (!isNumericPvp2Error(error) || initialMode === "numeric") {
    throw error;
  }

  const numericPayload = makeRows(rows, { pvp2Mode: "numeric" });
  const retry = await supabase
    .from(ARTICLES_TABLE)
    .upsert(numericPayload, { onConflict: "artigo" });

  if (retry.error) throw retry.error;

  return "numeric";
}

async function insertWithPvp2Fallback(rows, makeRows) {
  if (!rows.length) return "none";

  const initialMode = process.env.ARTICLE_PVP2_MODE === "numeric" ? "numeric" : "text";
  const payload = makeRows(rows, { pvp2Mode: initialMode });

  const { error } = await supabase
    .from(ARTICLES_TABLE)
    .insert(payload);

  if (!error) return initialMode;

  if (!isNumericPvp2Error(error) || initialMode === "numeric") {
    throw error;
  }

  const numericPayload = makeRows(rows, { pvp2Mode: "numeric" });
  const retry = await supabase
    .from(ARTICLES_TABLE)
    .insert(numericPayload);

  if (retry.error) throw retry.error;

  return "numeric";
}

function printChangedExamples(examples) {
  if (!examples.length) return;

  console.log("\nExemplos de alterações:");
  for (const example of examples.slice(0, 10)) {
    console.log(`- ${example.artigo}: ${Object.keys(example.changes).join(", ")}`);
  }
}

async function main() {
  const inputArg = process.argv.find((arg) => !arg.startsWith("--") && arg !== process.argv[1] && arg !== process.argv[0]);
  const inputPath = path.resolve(inputArg || DEFAULT_JSON_PATH);
  const dryRun = process.argv.includes("--dry-run");
  const startedAt = new Date();

  const { articles, totalInJson, skippedWithoutCode, duplicateCount } = await loadArticles(inputPath);

  console.log(`Ficheiro: ${inputPath}`);
  console.log(`Tabela Supabase: ${ARTICLES_TABLE}`);
  console.log(`Artigos no JSON: ${totalInJson}`);
  console.log(`Artigos únicos com código: ${articles.length}`);
  if (duplicateCount) console.log(`Duplicados no JSON ignorados: ${duplicateCount}`);
  if (skippedWithoutCode) console.log(`Sem código de artigo ignorados: ${skippedWithoutCode}`);
  if (dryRun) console.log("Modo dry-run ativo: nada será gravado no Supabase.");

  let totalExistingFound = 0;
  let totalExistingUpdated = 0;
  let totalExistingUnchanged = 0;
  let totalNewInserted = 0;
  let totalNewSkippedInvalidFormat = 0;
  let pvp2FallbackMode = "unknown";
  const changedFieldCounts = {
    descricao: 0,
    pvp1: 0,
    pvp2: 0,
    pvp3: 0,
    codigo_barras: 0,
  };
  const changedExamples = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const codes = batch.map((row) => row.artigo);
    const existingMap = await getExistingArticles(codes);
    const existingRows = batch.filter((row) => existingMap.has(row.artigo));
    const changedExistingRows = existingRows.filter((row) => rowChanged(row, existingMap.get(row.artigo)));
    const unchangedExistingRows = existingRows.length - changedExistingRows.length;
    const newRowsAll = batch.filter((row) => !existingMap.has(row.artigo));
    const newRows = newRowsAll.filter(articleHasValidFormat);
    const skippedInvalidNewRows = newRowsAll.length - newRows.length;

    for (const row of changedExistingRows) {
      const changes = getChangedFields(row, existingMap.get(row.artigo));

      for (const field of Object.keys(changes)) {
        changedFieldCounts[field] += 1;
      }

      if (changedExamples.length < 10) {
        changedExamples.push({
          artigo: row.artigo,
          changes,
        });
      }
    }

    if (!dryRun) {
      const updateMode = await upsertWithPvp2Fallback(changedExistingRows, makeExistingUpdateRows);
      const insertMode = await insertWithPvp2Fallback(newRows, makeInsertRows);

      if (updateMode !== "none") pvp2FallbackMode = updateMode;
      if (insertMode !== "none") pvp2FallbackMode = insertMode;
    }

    totalExistingFound += existingRows.length;
    totalExistingUpdated += changedExistingRows.length;
    totalExistingUnchanged += unchangedExistingRows;
    totalNewInserted += newRows.length;
    totalNewSkippedInvalidFormat += skippedInvalidNewRows;

    console.log(
      `Batch ${i + 1}-${Math.min(i + BATCH_SIZE, articles.length)}: ` +
        `${changedExistingRows.length} existentes alterados, ` +
        `${unchangedExistingRows} já iguais, ` +
        `${newRows.length} novos inseridos, ` +
        `${skippedInvalidNewRows} novos ignorados por formato`,
    );
  }

  const seconds = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);

  console.log("\nMigração concluída.");
  console.log(`Existentes encontrados: ${totalExistingFound}`);
  console.log(`Existentes alterados: ${totalExistingUpdated}`);
  console.log(`Existentes já iguais: ${totalExistingUnchanged}`);
  console.log(`Novos artigos inseridos: ${totalNewInserted}`);
  console.log(`Novos ignorados por formato inválido: ${totalNewSkippedInvalidFormat}`);
  console.log(`Campos alterados: ${JSON.stringify(changedFieldCounts)}`);
  if (!dryRun) console.log(`Modo pvp2 usado: ${pvp2FallbackMode}`);
  console.log(`Duração: ${seconds}s`);

  printChangedExamples(changedExamples);
}

main().catch((error) => {
  console.error("Erro na migração de artigos DB:", error);
  process.exit(1);
});
