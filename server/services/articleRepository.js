import { createSupabaseUserClient, supabaseAdminClient } from "../lib/supabaseClients.js";

export const ARTICLES_TABLE = process.env.ARTICLES_TABLE || "articles";

const ALL_ARTICLES_CACHE_TTL_MS = Number(process.env.ARTICLES_CACHE_TTL_MS || 30 * 60 * 1000);
const SUPABASE_MAX_ROWS_PER_REQUEST = Math.min(
  1000,
  Math.max(1, Number(process.env.ARTICLES_SUPABASE_MAX_ROWS || 1000)),
);
const ALL_ARTICLES_PAGE_SIZE = Math.min(
  SUPABASE_MAX_ROWS_PER_REQUEST,
  Math.max(1, Number(process.env.ARTICLES_CACHE_PAGE_SIZE || 1000)),
);
const ALL_ARTICLES_MAX_CONCURRENCY = Math.min(
  4,
  Math.max(1, Number(process.env.ARTICLES_CACHE_CONCURRENCY || 2)),
);
const FULL_CATALOG_ENABLED = String(process.env.ARTICLES_FULL_CATALOG_ENABLED || "0") === "1";

const allArticlesCache = {
  value: null,
  updatedAt: 0,
  promise: null,
};

const ARTICLE_SELECT = [
  "artigo",
  "descricao",
  "pvp1",
  "pvp2",
  "pvp3",
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

function requireAdminClient(operation = "operação de artigos") {
  if (!supabaseAdminClient) {
    throw new Error(
      `${operation} requer SUPABASE_SERVICE_ROLE_KEY no ambiente seguro. Não coloques esta chave no frontend.`,
    );
  }

  return supabaseAdminClient;
}

function getUserClient(accessToken = "") {
  const client = createSupabaseUserClient(accessToken);

  if (!client) {
    throw new Error("Sessão Supabase indisponível para consultar artigos.");
  }

  return client;
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
    pvp1: row.pvp1 != null ? String(row.pvp1) : "",
    pvp2:
      typeof row.pvp2 === "number"
        ? String(row.pvp2)
        : row.pvp2 != null
          ? String(row.pvp2)
          : "",
    pvp3: row.pvp3 != null ? String(row.pvp3) : "",
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
    pvp1: String(article.pvp1 ?? "").trim(),
    pvp2: parseNullableNumber(article.pvp2),
    pvp3: String(article.pvp3 ?? article.pv3 ?? "").trim(),
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

export async function listArticles({
  q = "",
  limit = 50,
  offset = 0,
  includeCount = true,
  accessToken = "",
  useAdmin = false,
  organizationId = null,
} = {}) {
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const normalizedOffset = Math.max(0, Number(offset) || 0);
  const normalizedQuery = normalizeSearchValue(q || "");

  // Catálogo grande: utilizadores normais nunca recebem a tabela completa.
  // Isto mantém o Render sem service_role e evita carregar 250 mil artigos.
  if (!useAdmin && (!normalizedQuery || normalizedQuery.length < 2)) {
    return {
      items: [],
      total: 0,
      limit: normalizedLimit,
      offset: normalizedOffset,
      hasMore: false,
    };
  }

  if (!useAdmin) {
    const client = getUserClient(accessToken);
    const { data, error } = await client.rpc("search_articles_for_labels", {
      p_query: q,
      p_limit: normalizedLimit,
      p_offset: normalizedOffset,
      p_organization_id: organizationId || null,
    });

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const total = Number(rows[0]?.total_count || rows.length || 0);

    return {
      items: rows.map(mapRowToArticle),
      total,
      limit: normalizedLimit,
      offset: normalizedOffset,
      hasMore: normalizedOffset + rows.length < total,
    };
  }

  const client = requireAdminClient("Pesquisa administrativa de artigos");
  let query = client
    .from(ARTICLES_TABLE)
    .select(ARTICLE_SELECT, includeCount ? { count: "exact" } : undefined)
    .order("artigo", { ascending: true })
    .range(normalizedOffset, normalizedOffset + normalizedLimit - 1);

  query = applySearch(query, q);

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const items = rows.map(mapRowToArticle);
  const total = typeof count === "number" ? count : items.length;

  return {
    items,
    total,
    limit: normalizedLimit,
    offset: normalizedOffset,
    hasMore: normalizedOffset + items.length < total,
  };
}

async function getArticlesCount() {
  const client = requireAdminClient("Contagem administrativa de artigos");
  const { count, error } = await client
    .from(ARTICLES_TABLE)
    .select("artigo", { count: "exact", head: true });

  if (error) {
    throw error;
  }

  return typeof count === "number" ? count : 0;
}

async function runWithConcurrency(tasks, concurrency = ALL_ARTICLES_MAX_CONCURRENCY) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}

function isAllArticlesCacheFresh() {
  return (
    allArticlesCache.value &&
    allArticlesCache.updatedAt &&
    Date.now() - allArticlesCache.updatedAt < ALL_ARTICLES_CACHE_TTL_MS
  );
}

export function getAllArticlesCacheStatus() {
  return {
    ready: Boolean(allArticlesCache.value),
    fresh: Boolean(isAllArticlesCacheFresh()),
    total: allArticlesCache.value?.total || 0,
    loaded: allArticlesCache.value?.loaded || allArticlesCache.value?.items?.length || 0,
    updatedAt: allArticlesCache.updatedAt || null,
    pending: Boolean(allArticlesCache.promise),
    fullCatalogEnabled: FULL_CATALOG_ENABLED,
  };
}

export async function listAllArticles({ forceRefresh = false, pageSize = ALL_ARTICLES_PAGE_SIZE } = {}) {
  if (!FULL_CATALOG_ENABLED) {
    throw new Error(
      "Catálogo completo desativado por segurança. Usa pesquisa server-side por termo/código.",
    );
  }

  if (!forceRefresh && isAllArticlesCacheFresh()) {
    return {
      ...allArticlesCache.value,
      fromCache: true,
      cacheUpdatedAt: allArticlesCache.updatedAt,
    };
  }

  if (!forceRefresh && allArticlesCache.promise) {
    const value = await allArticlesCache.promise;
    return {
      ...value,
      fromCache: false,
      cacheUpdatedAt: allArticlesCache.updatedAt,
    };
  }

  const request = (async () => {
    const normalizedPageSize = Math.min(
      SUPABASE_MAX_ROWS_PER_REQUEST,
      Math.max(1, Number(pageSize) || ALL_ARTICLES_PAGE_SIZE),
    );
    const total = await getArticlesCount();

    if (total <= 0) {
      const value = {
        items: [],
        total: 0,
        limit: 0,
        offset: 0,
        hasMore: false,
        q: "",
      };

      allArticlesCache.value = value;
      allArticlesCache.updatedAt = Date.now();
      return value;
    }

    const offsets = [];
    for (let offset = 0; offset < total; offset += normalizedPageSize) {
      offsets.push(offset);
    }

    const pages = await runWithConcurrency(
      offsets.map((offset) => async () =>
        listArticles({
          q: "*",
          limit: normalizedPageSize,
          offset,
          includeCount: false,
          useAdmin: true,
        }),
      ),
    );

    const items = pages.flatMap((page) => page.items);
    const value = {
      items,
      total,
      loaded: items.length,
      limit: items.length,
      offset: 0,
      hasMore: false,
      q: "",
    };

    allArticlesCache.value = value;
    allArticlesCache.updatedAt = Date.now();
    return value;
  })();

  allArticlesCache.promise = request;

  try {
    const value = await request;
    return {
      ...value,
      fromCache: false,
      cacheUpdatedAt: allArticlesCache.updatedAt,
    };
  } finally {
    if (allArticlesCache.promise === request) {
      allArticlesCache.promise = null;
    }
  }
}

export function warmArticlesCache() {
  if (!FULL_CATALOG_ENABLED) {
    return Promise.resolve(null);
  }

  return listAllArticles({ forceRefresh: false }).catch((error) => {
    console.warn("Não foi possível aquecer a cache de artigos.", error?.message || error);
    return null;
  });
}

export async function findArticleByIdentifiers({ artigoInterno = "", codigoBarras = "", accessToken = "", organizationId = null } = {}) {
  const artigo = String(artigoInterno || "").trim();
  const barcode = String(codigoBarras || "").trim();
  const lookup = artigo || barcode;

  if (!lookup) {
    return null;
  }

  if (accessToken) {
    const client = getUserClient(accessToken);
    const { data, error } = await client.rpc("get_article_for_label", {
      p_code: lookup,
      p_organization_id: organizationId || null,
    });

    if (error) {
      throw error;
    }

    const [row] = Array.isArray(data) ? data : [];
    return row ? mapRowToArticle(row) : null;
  }

  const client = requireAdminClient("Pesquisa exata administrativa de artigos");
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
  const client = requireAdminClient("Gravação de artigos");
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
  if (!supabaseAdminClient) {
    return {
      ok: true,
      mode: "controlled-rpc",
      total: null,
    };
  }

  const { count, error } = await supabaseAdminClient
    .from(ARTICLES_TABLE)
    .select("artigo", { count: "exact", head: true });

  if (error) {
    throw error;
  }

  return {
    ok: true,
    mode: "admin",
    total: typeof count === "number" ? count : 0,
  };
}
