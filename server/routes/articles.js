import { listArticles } from "../services/articleRepository.js";

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

export function registerArticleRoutes(app, { requireAuth }) {
  app.get("/api/artigos", requireAuth, async (req, res) => {
    try {
      const q = normalizeSearchValue(req.query.q || "");
      const limit = Math.min(parsePositiveInt(req.query.limit, 100), 500);
      const offset = parsePositiveInt(req.query.offset, 0);
      const includeCount = String(req.query.includeCount || "1") !== "0";

      const result = await listArticles({ q, limit, offset, includeCount });

      return res.json({
        ok: true,
        items: result.items,
        artigos: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
        q,
      });
    } catch (error) {
      console.error("Erro em GET /api/artigos:", error);

      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao carregar artigos.",
      });
    }
  });
}
