import { supabaseAdminClient } from "../lib/supabaseClients.js";

export const ARTICLES_TABLE = process.env.ARTICLES_TABLE || "articles";

const ARTICLE_SELECT = [
  "artigo",
  "descricao",
  "pvp2",
  "codigo_barras",
  "fonte_oficial",
  "raw_hash",
  "ultima_atualizacao",
  "titulo_oficial",
  "descricao_oficial",
  "caracteristicas_tecnicas",
  "documentos_oficiais",
  "resumo_vendedor",
  "observacoes_ia",
  "marca",
  "modelo",
  "brand",
  "categoria",
  "subcategory",
  "texto_grounding",
  "search_terms",
  "created_at",
  "updated_at",
].join(", ");

function getArticlesClient() {
  if (!supabaseAdminClient) {
    throw new Error(
      "Supabase não configurado para artigos. Define SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return supabaseAdminClient;
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

function normalizeJsonObject(value, fallback) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return fallback;
}

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const text = String(value).replace(/\s/g, "").replace(",", ".").trim();
  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : null;
}

export function mapRowToArticle(row = {}) {
  return {
    artigo: row.artigo || "",
    descricao: row.descricao || "",
    pvp2:
      typeof row.pvp2 === "number"
        ? String(row.pvp2)
        : row.pvp2 != null
          ? String(row.pvp2)
          : "",
    codigoBarras: row.codigo_barras || "",
    fonte_oficial: row.fonte_oficial || "",
    raw_hash: row.raw_hash || "",
    ultima_atualizacao: row.ultima_atualizacao || "",
    titulo_oficial: row.titulo_oficial || "",
    descricao_oficial: row.descricao_oficial || "",
    caracteristicas_tecnicas: normalizeJsonObject(row.caracteristicas_tecnicas, {}),
    documentos_oficiais: normalizeJsonArray(row.documentos_oficiais),
    resumo_vendedor: row.resumo_vendedor || "",
    observacoes_ia: row.observacoes_ia || "",
    marca: row.marca || "",
    modelo: row.modelo || "",
    brand: row.brand || "",
    categoria: row.categoria || "",
    subcategory: row.subcategory || "",
    texto_grounding: row.texto_grounding || "",
  };
}

export function mapArticleToRow(article = {}) {
  const nowIso = new Date().toISOString();
  const articleCode = String(article.artigo || article.artigo_interno || "").trim();
  const barcode = String(article.codigoBarras || article.codigo_barras || "").trim();
  const descricao = String(article.descricao || "").trim();
  const tituloOficial = String(article.titulo_oficial || "").trim();
  const descricaoOficial = String(article.descricao_oficial || "").trim();
  const marca = String(article.marca || "").trim();
  const modelo = String(article.modelo || "").trim();
  const brand = String(article.brand || "").trim();
  const categoria = String(article.categoria || "").trim();
  const subcategory = String(article.subcategory || "").trim();

  return {
    artigo: articleCode,
    descricao,
    pvp2: parseNullableNumber(article.pvp2),
    codigo_barras: barcode,
    fonte_oficial: String(article.fonte_oficial || "").trim(),
    raw_hash: String(article.raw_hash || "").trim(),
    ultima_atualizacao: article.ultima_atualizacao || nowIso,
    titulo_oficial: tituloOficial,
    descricao_oficial: descricaoOficial,
    caracteristicas_tecnicas: normalizeJsonObject(article.caracteristicas_tecnicas, {}),
    documentos_oficiais: normalizeJsonArray(article.documentos_oficiais),
    resumo_vendedor: String(article.resumo_vendedor || "").trim(),
    observacoes_ia: String(article.observacoes_ia || "").trim(),
    marca,
    modelo,
    brand,
    categoria,
    subcategory,
    texto_grounding: String(article.texto_grounding || "").trim(),
    search_terms: [
      normalizeSearchValue(
        [
          articleCode,
          barcode,
          descricao,
          tituloOficial,
          descricaoOficial,
          marca,
          modelo,
          brand,
          categoria,
          subcategory,
        ].join(" "),
      ),
      normalizeCompactSearchValue(articleCode),
      normalizeCompactSearchValue(barcode),
      normalizeCompactSearchValue(descricao),
      normalizeCompactSearchValue(marca),
      normalizeCompactSearchValue(modelo),
      normalizeCompactSearchValue(brand),
    ]
      .filter(Boolean)
      .join(" "),
    updated_at: nowIso,
  };
}

function applySearch(queryBuilder, rawQuery) {
  const query = normalizeSearchValue(rawQuery || "");

  if (!query) {
    return queryBuilder;
  }

  const compact = normalizeCompactSearchValue(rawQuery || "");
  const escaped = query.replace(/,/g, " ").replace(/%/g, "");
  const ilike = `%${escaped}%`;
  const clauses = [
    `artigo.ilike.${ilike}`,
    `codigo_barras.ilike.${ilike}`,
    `descricao.ilike.${ilike}`,
    `marca.ilike.${ilike}`,
    `modelo.ilike.${ilike}`,
    `brand.ilike.${ilike}`,
    `search_terms.ilike.${ilike}`,
  ];

  if (compact) {
    clauses.push(`search_terms.ilike.%${compact}%`);
  }

  return queryBuilder.or(clauses.join(","));
}

export async function listArticles({ q = "", limit = 100, offset = 0 } = {}) {
  const client = getArticlesClient();
  let query = client
    .from(ARTICLES_TABLE)
    .select(ARTICLE_SELECT, { count: "exact" })
    .order("artigo", { ascending: true })
    .range(offset, offset + limit - 1);

  query = applySearch(query, q);

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  const items = Array.isArray(data) ? data.map(mapRowToArticle) : [];

  return {
    items,
    total: typeof count === "number" ? count : items.length,
    limit,
    offset,
    hasMore:
      offset + items.length < (typeof count === "number" ? count : items.length),
  };
}

export async function findArticleByIdentifiers({ artigoInterno = "", codigoBarras = "" } = {}) {
  const client = getArticlesClient();
  const artigo = String(artigoInterno || "").trim();
  const barcode = String(codigoBarras || "").trim();

  if (!artigo && !barcode) {
    return null;
  }

  let query = client.from(ARTICLES_TABLE).select(ARTICLE_SELECT).limit(1);

  if (artigo && barcode) {
    query = query.or(`artigo.eq.${artigo},codigo_barras.eq.${barcode}`);
  } else if (artigo) {
    query = query.eq("artigo", artigo);
  } else {
    query = query.eq("codigo_barras", barcode);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapRowToArticle(data) : null;
}

export async function upsertArticle(article = {}) {
  const client = getArticlesClient();
  const row = mapArticleToRow(article);

  if (!row.artigo) {
    throw new Error("O artigo precisa de um código interno antes de ser gravado.");
  }

  const { data, error } = await client
    .from(ARTICLES_TABLE)
    .upsert(row, { onConflict: "artigo" })
    .select(ARTICLE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return mapRowToArticle(data);
}

export async function getArticlesHealthcheck() {
  const client = getArticlesClient();
  const { count, error } = await client
    .from(ARTICLES_TABLE)
    .select("artigo", { count: "exact", head: true });

  if (error) {
    throw error;
  }

  return {
    ok: true,
    total: typeof count === "number" ? count : 0,
  };
}
