import {
  enrichSingleArticle,
  isRetryableGeminiError,
  validateAiProdutoPayload,
} from "../services/aiProdutoService.js";

export function registerAiProdutoRoutes(app, { requireAuth, aiRateLimit, aiEnabled = false }) {
  app.post("/api/ai-produto", requireAuth, aiRateLimit, async (req, res) => {
    try {
      if (!aiEnabled) {
        return res.status(503).json({
          ok: false,
          error: "Funcionalidade de IA indisponível: GEMINI_API_KEY em falta.",
        });
      }

      const payloadValidation = validateAiProdutoPayload(req.body || {});

      if (!payloadValidation.ok) {
        return res.status(payloadValidation.statusCode).json({
          ok: false,
          error: payloadValidation.error,
        });
      }

      const { artigoInterno, codigoBarras, descricao } = payloadValidation.value;

      const result = await enrichSingleArticle({
        artigoInterno,
        codigoBarras,
        descricao,
        accessToken: req.accessToken,
        organizationId: req.organizationId || null,
      });

      return res.json({
        ok: true,
        fromCache: result.fromCache,
        resultado: result.resultado,
        artigoAtualizado: result.artigoAtualizado,
      });
    } catch (error) {
      if (isRetryableGeminiError(error)) {
        return res.status(503).json({
          ok: false,
          error:
            "A Gemini está com elevada procura neste momento. Tenta novamente dentro de instantes.",
        });
      }

      console.error("Erro /api/ai-produto:", error);

      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro interno no servidor.",
      });
    }
  });
}
