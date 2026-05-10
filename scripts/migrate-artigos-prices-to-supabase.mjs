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
const BATCH_SIZE = Number(process.env.ARTICLE_MIGRATION_BATCH_SIZE || 500);

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

async function loadArticles(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed?.artigos) ? parsed.artigos : Array.isArray(parsed) ? parsed : [];

  // If the JSON contains duplicate article codes, keep the last occurrence, matching the CSV migration behaviour.
  const byArticle = new Map();
  let skippedWithoutCode = 0;
  for (const item of list) {
    const row = normalizeArticle(item);
    if (!row.artigo) {
      skippedWithoutCode += 1;
      continue;
    }
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
    .select("artigo,pvp1,pvp2,pvp3")
    .in("artigo", codes);

  if (error) throw error;

  return new Map((data || []).map((row) => [row.artigo, row]));
}

function pricesChanged(nextRow, currentRow) {
  if (!currentRow) return false;

  return (
    text(currentRow.pvp1) !== nextRow.pvp1 ||
    text(currentRow.pvp2) !== nextRow.pvp2 ||
    text(currentRow.pvp3) !== nextRow.pvp3
  );
}

async function updateExistingPrices(rows) {
  if (!rows.length) return;

  const priceRows = rows.map((row) => ({
    artigo: row.artigo,
    pvp1: row.pvp1,
    pvp2: row.pvp2,
    pvp3: row.pvp3,
  }));

  // Safe partial upsert: because these artigos already exist, only the submitted columns
  // are updated on conflict. Archived metadata columns are not included, so they are not overwritten.
  const { error } = await supabase
    .from(ARTICLES_TABLE)
    .upsert(priceRows, { onConflict: "artigo" });

  if (error) throw error;
}

async function insertNewArticles(rows) {
  if (!rows.length) return;

  const { error } = await supabase.from(ARTICLES_TABLE).insert(rows);
  if (error) throw error;
}

async function main() {
  const inputPath = path.resolve(process.argv[2] || DEFAULT_JSON_PATH);
  const dryRun = process.argv.includes("--dry-run");
  const startedAt = new Date();
  const { articles, totalInJson, skippedWithoutCode, duplicateCount } = await loadArticles(inputPath);

  console.log(`Ficheiro: ${inputPath}`);
  console.log(`Artigos no JSON: ${totalInJson}`);
  console.log(`Artigos únicos válidos: ${articles.length}`);
  if (duplicateCount) console.log(`Duplicados no JSON ignorados: ${duplicateCount}`);
  if (skippedWithoutCode) console.log(`Sem código de artigo ignorados: ${skippedWithoutCode}`);
  if (dryRun) console.log("Modo dry-run ativo: nada será gravado no Supabase.");

  let totalExistingFound = 0;
  let totalExistingUpdated = 0;
  let totalExistingUnchanged = 0;
  let totalNewInserted = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const codes = batch.map((row) => row.artigo);
    const existingMap = await getExistingArticles(codes);
    const existingRows = batch.filter((row) => existingMap.has(row.artigo));
    const changedExistingRows = existingRows.filter((row) => pricesChanged(row, existingMap.get(row.artigo)));
    const unchangedExistingRows = existingRows.length - changedExistingRows.length;
    const newRows = batch.filter((row) => !existingMap.has(row.artigo));

    if (!dryRun) {
      await updateExistingPrices(changedExistingRows);
      await insertNewArticles(newRows);
    }

    totalExistingFound += existingRows.length;
    totalExistingUpdated += changedExistingRows.length;
    totalExistingUnchanged += unchangedExistingRows;
    totalNewInserted += newRows.length;

    console.log(
      `Batch ${i + 1}-${Math.min(i + BATCH_SIZE, articles.length)}: ` +
        `${changedExistingRows.length} existentes alterados, ` +
        `${unchangedExistingRows} já estavam iguais, ` +
        `${newRows.length} novos inseridos`,
    );
  }

  const seconds = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log("Migração concluída.");
  console.log(`Existentes encontrados: ${totalExistingFound}`);
  console.log(`Existentes com PVP alterado: ${totalExistingUpdated}`);
  console.log(`Existentes já iguais: ${totalExistingUnchanged}`);
  console.log(`Novos artigos inseridos: ${totalNewInserted}`);
  console.log(`Duração: ${seconds}s`);
}

main().catch((error) => {
  console.error("Erro na migração de artigos:", error);
  process.exit(1);
});
