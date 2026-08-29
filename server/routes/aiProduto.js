import {
  answerSellerQuestion,
  enrichSingleArticle,
  isRetryableGeminiError,
  validateAiProdutoPayload,
  validateSellerAssistantPayload,
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

  app.post("/api/ai-vendedor", requireAuth, aiRateLimit, async (req, res) => {
    try {
      if (!aiEnabled) {
        return res.status(503).json({
          ok: false,
          error: "Assistente do vendedor indisponível: GEMINI_API_KEY em falta.",
        });
      }

      const validation = validateSellerAssistantPayload(req.body || {});

      if (!validation.ok) {
        return res.status(validation.statusCode).json({
          ok: false,
          error: validation.error,
        });
      }

      const result = await answerSellerQuestion({
        ...validation.value,
        accessToken: req.accessToken,
        organizationId: req.organizationId || null,
      });

      return res.json({ ok: true, ...result });
    } catch (error) {
      if (isRetryableGeminiError(error)) {
        return res.status(503).json({
          ok: false,
          error:
            "O assistente está com elevada procura neste momento. Tenta novamente dentro de instantes.",
        });
      }

      const statusCode = Number(error?.statusCode || 500);

      console.error("Erro /api/ai-vendedor:", error);

      return res.status(statusCode).json({
        ok: false,
        error: error?.message || "Erro interno no assistente do vendedor.",
      });
    }
  });

}
