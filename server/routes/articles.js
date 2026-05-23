import { getAllArticlesCacheStatus, listAllArticles, listArticles } from "../services/articleRepository.js";

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function parseBooleanQueryFlag(value) {
  const normalized = String(value || "").toLowerCase().trim();
  return ["1", "true", "sim", "yes", "y"].includes(normalized);
}


function isSupabaseStatementTimeout(error = {}) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();

  return code === "57014" || message.includes("statement timeout") || message.includes("canceling statement due to statement timeout");
}

function shouldReturnFullCatalog(req) {
  return parseBooleanQueryFlag(req.query.catalogo) || parseBooleanQueryFlag(req.query.all);
}

async function sendFullCatalogResponse(req, res) {
  if (!req.isAdmin) {
    return res.status(403).json({
      ok: false,
      error: "Catálogo completo disponível apenas para administradores.",
    });
  }

  try {
    const forceRefresh = parseBooleanQueryFlag(req.query.refresh);
    const pageSize = Math.min(parsePositiveInt(req.query.pageSize, 1000), 1000);
    const result = await listAllArticles({ forceRefresh, pageSize });

    res.set("Cache-Control", "private, max-age=300");
    res.set("X-Articles-Cache", result.fromCache ? "hit" : "miss");

    return res.json({
      ok: true,
      items: result.items,
      artigos: result.items,
      total: result.total,
      loaded: result.loaded ?? result.items?.length ?? 0,
      limit: result.limit,
      offset: result.offset,
      hasMore: false,
      q: "",
      source: result.fromCache ? "server-cache" : "server",
      fromCache: Boolean(result.fromCache),
      cacheUpdatedAt: result.cacheUpdatedAt || null,
    });
  } catch (error) {
    console.error("Erro ao carregar catálogo completo de artigos:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro ao carregar catálogo de artigos.",
    });
  }
}

export function registerArticleRoutes(app, { requireAuth }) {
  app.get("/api/artigos", requireAuth, async (req, res) => {
    if (shouldReturnFullCatalog(req)) {
      return sendFullCatalogResponse(req, res);
    }

    try {
      const q = normalizeSearchValue(req.query.q || "");
      const limit = Math.min(parsePositiveInt(req.query.limit, 30), 50);
      const offset = parsePositiveInt(req.query.offset, 0);
      const includeCount = String(req.query.includeCount || "1") !== "0";

      const result = await listArticles({
        q,
        limit,
        offset,
        includeCount,
        accessToken: req.accessToken,
        useAdmin: Boolean(req.isAdmin && req.query.admin === "1"),
        organizationId: req.organizationId || null,
      });

      return res.json({
        ok: true,
        items: result.items,
        artigos: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
        q,
        searchMs: result.searchMs ?? null,
        searchTimedOut: Boolean(result.searchTimedOut),
        degraded: Boolean(result.degraded),
      });
    } catch (error) {
      if (isSupabaseStatementTimeout(error)) {
        console.warn("GET /api/artigos excedeu o timeout; devolvendo resultado vazio controlado.", {
          q: req.query.q || "",
          code: error.code,
        });

        return res.json({
          ok: true,
          items: [],
          artigos: [],
          total: 0,
          limit: Math.min(parsePositiveInt(req.query.limit, 30), 50),
          offset: parsePositiveInt(req.query.offset, 0),
          hasMore: false,
          q: normalizeSearchValue(req.query.q || ""),
          searchTimedOut: true,
          degraded: true,
        });
      }

      console.error("Erro em GET /api/artigos:", error);

      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao carregar artigos.",
      });
    }
  });

  app.get(["/api/artigos/catalogo", "/api/catalogo/artigos"], requireAuth, sendFullCatalogResponse);

  app.get("/api/artigos/cache-status", requireAuth, (_req, res) => {
    return res.json({
      ok: true,
      cache: getAllArticlesCacheStatus(),
    });
  });
}
