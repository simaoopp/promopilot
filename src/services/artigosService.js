import { supabase } from "../lib/supabase";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "");

const CACHE_TTL_MS = 5 * 60 * 1000;
const ALL_ARTIGOS_CACHE_KEY = "all-artigos";
const artigosCache = new Map();
const artigosPendingRequests = new Map();

function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function cacheGet(key) {
  const entry = artigosCache.get(key);

  if (!entry) return null;

  if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
    artigosCache.delete(key);
    return null;
  }

  return entry.value;
}

function cacheSet(key, value) {
  artigosCache.set(key, {
    value,
    updatedAt: Date.now(),
  });

  return value;
}

function getPendingRequest(key) {
  return artigosPendingRequests.get(key) || null;
}

function setPendingRequest(key, promise) {
  artigosPendingRequests.set(key, promise);
  return promise;
}

function clearPendingRequest(key, promise) {
  if (artigosPendingRequests.get(key) === promise) {
    artigosPendingRequests.delete(key);
  }
}

async function readJsonResponse(response) {
  const rawText = await response.text();

  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`Resposta inválida do servidor: ${rawText.slice(0, 200)}`);
  }
}

async function getAccessToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message || "Não foi possível obter a sessão.");
  }

  const token = session?.access_token || "";

  if (!token) {
    throw new Error("Sessão inválida ou expirada.");
  }

  return token;
}

export function normalizeArtigosApiResponse(data, fallbackLimit = 100, fallbackOffset = 0) {
  if (Array.isArray(data)) {
    return {
      ok: true,
      items: data,
      artigos: data,
      total: data.length,
      limit: data.length || fallbackLimit,
      offset: fallbackOffset,
      hasMore: false,
      q: "",
    };
  }

  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.artigos)
      ? data.artigos
      : [];

  return {
    ok: data?.ok !== false,
    items,
    artigos: items,
    total: Number.isFinite(data?.total) ? data.total : items.length,
    limit: Number.isFinite(data?.limit) ? data.limit : fallbackLimit,
    offset: Number.isFinite(data?.offset) ? data.offset : fallbackOffset,
    hasMore: Boolean(data?.hasMore),
    q: data?.q || "",
  };
}

export async function fetchArtigosPage({
  q = "",
  limit = 100,
  offset = 0,
  signal,
  includeCount = true,
} = {}) {
  const params = new URLSearchParams();

  if (q) params.set("q", q);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  if (!includeCount) {
    params.set("includeCount", "0");
  }

  const token = await getAccessToken();
  const response = await fetch(buildApiUrl(`/api/artigos?${params.toString()}`), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  const data = await readJsonResponse(response);

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Erro ao carregar artigos.");
  }

  return normalizeArtigosApiResponse(data, limit, offset);
}

export function getCachedAllArtigosSnapshot() {
  return cacheGet(ALL_ARTIGOS_CACHE_KEY);
}

export async function loadAllArtigos({ forceRefresh = false, pageSize = 500 } = {}) {
  const cached = !forceRefresh ? cacheGet(ALL_ARTIGOS_CACHE_KEY) : null;

  if (cached) {
    return cached;
  }

  const pendingKey = `${ALL_ARTIGOS_CACHE_KEY}:${pageSize}`;
  const pending = !forceRefresh ? getPendingRequest(pendingKey) : null;

  if (pending) {
    return pending;
  }

  const request = (async () => {
    const allItems = [];
    let offset = 0;

    while (true) {
      const page = await fetchArtigosPage({
        q: "",
        limit: pageSize,
        offset,
        includeCount: false,
      });

      allItems.push(...page.items);

      if (!page.hasMore || page.items.length === 0) {
        const result = {
          ok: true,
          items: allItems,
          artigos: allItems,
          total: allItems.length,
          limit: allItems.length,
          offset: 0,
          hasMore: false,
          q: "",
        };

        return cacheSet(ALL_ARTIGOS_CACHE_KEY, result);
      }

      offset += page.items.length;
    }
  })();

  setPendingRequest(pendingKey, request);

  try {
    return await request;
  } finally {
    clearPendingRequest(pendingKey, request);
  }
}

export function preloadAllArtigos(options) {
  return loadAllArtigos(options);
}

function buildSearchCacheKey({ q = "", limit = 20, offset = 0 } = {}) {
  const normalizedQ = String(q || "").trim().toLowerCase();
  return `search:${normalizedQ}:${limit}:${offset}`;
}

export async function searchArtigos({ q = "", limit = 20, offset = 0, signal } = {}) {
  const cacheKey = buildSearchCacheKey({ q, limit, offset });
  const cached = cacheGet(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = !signal ? getPendingRequest(cacheKey) : null;

  if (pending) {
    return pending;
  }

  const request = fetchArtigosPage({ q, limit, offset, signal }).then((result) =>
    cacheSet(cacheKey, result),
  );

  if (!signal) {
    setPendingRequest(cacheKey, request);
  }

  try {
    return await request;
  } finally {
    if (!signal) {
      clearPendingRequest(cacheKey, request);
    }
  }
}

export async function enrichArtigoWithAi(payload) {
  const token = await getAccessToken();
  const response = await fetch(buildApiUrl("/api/ai-produto"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse(response);

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.detalhe || "Erro no servidor.");
  }

  return data;
}

export function mergeArtigoData(base = {}, updated = {}) {
  return {
    ...base,
    ...updated,
    caracteristicas_tecnicas:
      updated?.caracteristicas_tecnicas ?? base?.caracteristicas_tecnicas ?? {},
    documentos_oficiais:
      updated?.documentos_oficiais ?? base?.documentos_oficiais ?? [],
    texto_grounding: updated?.texto_grounding ?? base?.texto_grounding ?? "",
    observacoes_ia: updated?.observacoes_ia ?? base?.observacoes_ia ?? "",
    resumo_vendedor: updated?.resumo_vendedor ?? base?.resumo_vendedor ?? "",
  };
}

export function mergeArtigosIntoList(list = [], updatedArtigo = {}) {
  return list.map((item) =>
    item.artigo === updatedArtigo.artigo
      ? mergeArtigoData(item, updatedArtigo)
      : item,
  );
}

export function syncUpdatedArtigoToCache(updatedArtigo = {}) {
  if (!updatedArtigo?.artigo) return;

  for (const [key, entry] of artigosCache.entries()) {
    if (!entry?.value?.items) continue;

    const mergedItems = mergeArtigosIntoList(entry.value.items, updatedArtigo);
    artigosCache.set(key, {
      value: {
        ...entry.value,
        items: mergedItems,
        artigos: mergedItems,
      },
      updatedAt: Date.now(),
    });
  }
}

export function __clearArtigosCacheForTests() {
  artigosCache.clear();
  artigosPendingRequests.clear();
}
