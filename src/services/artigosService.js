import { supabase } from "../lib/supabase";
import {
  isSupabaseRefreshTokenError,
  recoverFromInvalidSupabaseSession,
} from "../utils/supabaseAuthRecovery";
import { readPersistedArtigos, writePersistedArtigos } from "./artigosPersistentCache";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "");

const CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_REQUEST_TIMEOUT_MS = Number(process.env.REACT_APP_ARTICLES_SEARCH_TIMEOUT_MS || 15000);
const SEARCH_SUGGESTIONS_TIMEOUT_MS = Number(process.env.REACT_APP_ARTICLES_SUGGESTIONS_TIMEOUT_MS || 18000);
const PERSISTENT_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const BACKGROUND_REFRESH_DEBOUNCE_MS = 60 * 1000;
const ALL_ARTIGOS_CACHE_KEY = "all-artigos";
const artigosCache = new Map();
const artigosPendingRequests = new Map();
let lastBackgroundRefreshAt = 0;

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
    const contentType = response.headers?.get?.("content-type") || "conteúdo não JSON";
    const status = response.status ? `HTTP ${response.status}` : "resposta sem estado HTTP";
    const url = response.url || "endpoint desconhecido";

    throw new Error(
      `Resposta inválida do servidor em ${url}: esperava JSON, recebi ${contentType} (${status}).`,
    );
  }
}


function createAbortSignalWithTimeout(externalSignal, timeoutMs = SEARCH_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let timeout = null;

  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  if (externalSignal?.aborted) {
    abort();
  } else if (externalSignal) {
    externalSignal.addEventListener("abort", abort, { once: true });
  }

  if (timeoutMs > 0) {
    timeout = setTimeout(abort, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (timeout) clearTimeout(timeout);
      if (externalSignal) externalSignal.removeEventListener("abort", abort);
    },
  };
}

async function getAccessToken() {
  let authResult;

  try {
    authResult = await supabase.auth.getSession();
  } catch (error) {
    if (isSupabaseRefreshTokenError(error)) {
      await recoverFromInvalidSupabaseSession(supabase);
      throw new Error("Sessão expirada. Inicia sessão novamente.");
    }

    throw error;
  }

  const {
    data: { session },
    error,
  } = authResult;

  if (error) {
    if (isSupabaseRefreshTokenError(error)) {
      await recoverFromInvalidSupabaseSession(supabase);
      throw new Error("Sessão expirada. Inicia sessão novamente.");
    }

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
    searchTimedOut: Boolean(data?.searchTimedOut),
    degraded: Boolean(data?.degraded),
  };
}

export async function fetchArtigosPage({
  q = "",
  limit = 100,
  offset = 0,
  signal,
  includeCount = false,
  timeoutMs = SEARCH_REQUEST_TIMEOUT_MS,
} = {}) {
  const params = new URLSearchParams();

  if (q) params.set("q", q);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  if (!includeCount) {
    params.set("includeCount", "0");
  }

  const token = await getAccessToken();
  const requestSignal = createAbortSignalWithTimeout(signal, timeoutMs);
  let response;

  try {
    response = await fetch(buildApiUrl(`/api/artigos?${params.toString()}`), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: requestSignal.signal,
    });
  } catch (error) {
    if (requestSignal.signal.aborted) {
      throw new Error("Pesquisa de artigos demorou demasiado. Tenta por código/EAN ou refina o termo.");
    }
    throw error;
  } finally {
    requestSignal.cleanup();
  }

  const data = await readJsonResponse(response);

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Erro ao carregar artigos.");
  }

  return normalizeArtigosApiResponse(data, limit, offset);
}

export function getCachedAllArtigosSnapshot() {
  return cacheGet(ALL_ARTIGOS_CACHE_KEY);
}

function normalizeAllArtigosResult(data, fallbackSource = "api") {
  const normalized = normalizeArtigosApiResponse(data, 0, 0);
  const items = normalized.items || [];

  return {
    ...normalized,
    ok: true,
    items,
    artigos: items,
    total: Number.isFinite(normalized.total) ? normalized.total : items.length,
    limit: items.length,
    offset: 0,
    hasMore: false,
    q: "",
    source: data?.source || fallbackSource,
  };
}

export function buildArtigosCatalogoPath({ forceRefresh = false, pageSize = 1000 } = {}) {
  const params = new URLSearchParams();

  params.set("catalogo", "1");
  params.set("includeCount", "0");

  if (pageSize) {
    params.set("pageSize", String(pageSize));
  }

  if (forceRefresh) {
    params.set("refresh", "1");
  }

  return `/api/artigos?${params.toString()}`;
}

export function isFullCatalogoResponse(data = {}) {
  const normalized = normalizeArtigosApiResponse(data, 0, 0);
  const items = normalized.items || [];
  const total = Number.isFinite(normalized.total) ? normalized.total : items.length;

  return normalized.hasMore === false && items.length >= total;
}

async function fetchAllArtigosCatalogo({ forceRefresh = false, pageSize = 1000, signal } = {}) {
  const token = await getAccessToken();
  const path = buildArtigosCatalogoPath({ forceRefresh, pageSize });
  const response = await fetch(buildApiUrl(path), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  const data = await readJsonResponse(response);

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Erro ao carregar catálogo de artigos.");
  }

  if (!isFullCatalogoResponse(data)) {
    throw new Error("O endpoint de artigos respondeu de forma paginada, não como catálogo completo.");
  }

  return normalizeAllArtigosResult(data, data?.fromCache ? "server-cache" : "server");
}

async function fetchAllArtigosPaginated({ pageSize = 1000 } = {}) {
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
      return normalizeAllArtigosResult({ items: allItems, total: allItems.length }, "api-paginated");
    }

    offset += page.items.length;
  }
}

async function fetchFreshAllArtigos(options = {}) {
  try {
    return await fetchAllArtigosCatalogo(options);
  } catch (error) {
    if (options?.signal?.aborted) {
      throw error;
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("Catálogo completo indisponível; a usar paginação.", error);
    }

    return fetchAllArtigosPaginated({ pageSize: options.pageSize });
  }
}

async function persistAndCacheAllArtigos(result) {
  const cachedResult = cacheSet(ALL_ARTIGOS_CACHE_KEY, result);
  writePersistedArtigos(cachedResult).catch((error) => {
    console.warn("Não foi possível atualizar a cache local de artigos.", error);
  });

  return cachedResult;
}

export function refreshAllArtigosInBackground(options = {}) {
  const now = Date.now();

  if (now - lastBackgroundRefreshAt < BACKGROUND_REFRESH_DEBOUNCE_MS) {
    return getPendingRequest(`${ALL_ARTIGOS_CACHE_KEY}:refresh`) || Promise.resolve(getCachedAllArtigosSnapshot());
  }

  lastBackgroundRefreshAt = now;
  const pendingKey = `${ALL_ARTIGOS_CACHE_KEY}:refresh`;
  const pending = getPendingRequest(pendingKey);

  if (pending) return pending;

  const request = fetchFreshAllArtigos({ ...options, forceRefresh: true })
    .then((result) => persistAndCacheAllArtigos({ ...result, source: result.source || "background-refresh" }))
    .finally(() => clearPendingRequest(pendingKey, request));

  setPendingRequest(pendingKey, request);
  return request;
}

export async function loadAllArtigos({
  forceRefresh = false,
  pageSize = 1000,
  usePersistentCache = true,
} = {}) {
  const cached = !forceRefresh ? cacheGet(ALL_ARTIGOS_CACHE_KEY) : null;

  if (cached) {
    return cached;
  }

  const pendingKey = `${ALL_ARTIGOS_CACHE_KEY}:${forceRefresh ? "force" : "normal"}:${pageSize}`;
  const pending = !forceRefresh ? getPendingRequest(pendingKey) : null;

  if (pending) {
    return pending;
  }

  const request = (async () => {
    if (!forceRefresh && usePersistentCache) {
      const persisted = await readPersistedArtigos({ maxAgeMs: PERSISTENT_CACHE_MAX_AGE_MS });

      if (persisted?.items?.length) {
        const result = cacheSet(ALL_ARTIGOS_CACHE_KEY, normalizeAllArtigosResult(persisted, "indexeddb"));

        refreshAllArtigosInBackground({ pageSize }).catch((error) => {
          console.warn("Não foi possível atualizar o catálogo em segundo plano.", error);
        });

        return result;
      }
    }

    const fresh = await fetchFreshAllArtigos({ forceRefresh, pageSize });
    return persistAndCacheAllArtigos(fresh);
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

export async function searchArtigos({ q = "", limit = 20, offset = 0, signal, timeoutMs } = {}) {
  const cacheKey = buildSearchCacheKey({ q, limit, offset });
  const cached = cacheGet(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = !signal ? getPendingRequest(cacheKey) : null;

  if (pending) {
    return pending;
  }

  const normalizedQuery = String(q || "").trim();
  const effectiveTimeoutMs = timeoutMs || (normalizedQuery.length < 5 ? SEARCH_SUGGESTIONS_TIMEOUT_MS : SEARCH_REQUEST_TIMEOUT_MS);

  const request = fetchArtigosPage({
    q,
    limit,
    offset,
    signal,
    includeCount: false,
    timeoutMs: effectiveTimeoutMs,
  }).then((result) => cacheSet(cacheKey, result));

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

export async function warmupApi() {
  try {
    const response = await fetch(buildApiUrl("/api/ping"), {
      method: "GET",
      cache: "no-store",
      keepalive: true,
    });

    return response.ok;
  } catch {
    return false;
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

  let latestAllArtigosValue = null;

  for (const [key, entry] of artigosCache.entries()) {
    if (!entry?.value?.items) continue;

    const mergedItems = mergeArtigosIntoList(entry.value.items, updatedArtigo);
    const nextValue = {
      ...entry.value,
      items: mergedItems,
      artigos: mergedItems,
    };

    artigosCache.set(key, {
      value: nextValue,
      updatedAt: Date.now(),
    });

    if (key === ALL_ARTIGOS_CACHE_KEY) {
      latestAllArtigosValue = nextValue;
    }
  }

  if (latestAllArtigosValue) {
    writePersistedArtigos(latestAllArtigosValue).catch((error) => {
      console.warn("Não foi possível sincronizar a cache local de artigos.", error);
    });
  }
}

export function __clearArtigosCacheForTests() {
  artigosCache.clear();
  artigosPendingRequests.clear();
  lastBackgroundRefreshAt = 0;
}
