import { hasSupabaseAdminConfig } from "../lib/supabaseClients.js";
import { getArticlesHealthcheck } from "../services/articleRepository.js";

export function registerHealthRoutes(app, { aiEnabled = false } = {}) {
  app.get(["/api/ping", "/ping"], (_req, res) => {
    return res.json({
      ok: true,
      service: "etiquetas-api",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/health", async (_req, res) => {
    try {
      const database = hasSupabaseAdminConfig()
        ? await getArticlesHealthcheck()
        : { ok: false, total: 0 };

      return res.json({
        ok: true,
        service: "etiquetas-api",
        database,
        aiEnabled,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Erro em GET /api/health:", error);

      return res.status(500).json({
        ok: false,
        error: error?.message || "Healthcheck indisponível.",
      });
    }
  });
}
