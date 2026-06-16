import { extractTextFromPdfBase64 } from "../services/quote-dossiers/pdfTextService.js";
import { parseQuoteDossierFromText } from "../services/quote-dossiers/quoteDossierParser.js";
import { generateQuoteDossierPdf } from "../services/quote-dossiers/quoteDossierPdfService.js";
import { enrichQuoteDossier } from "../services/quote-dossiers/quoteDossierEnrichmentService.js";
import { webEnrichmentStatus } from "../services/quote-dossiers/quoteDossierWebEnrichmentService.js";

export const QUOTE_DOSSIER_RUNTIME_VERSION = "quote-dossier-serious-runtime-v3";

function requireString(value, field, { min = 1, max = 500 } = {}) {
  const text = String(value || "").trim();

  if (text.length < min) {
    throw new Error(`${field} obrigatório.`);
  }

  if (text.length > max) {
    throw new Error(`${field} demasiado longo.`);
  }

  return text;
}

function safeFilename(value = "") {
  return String(value || "dossier-orcamento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 120) || "dossier-orcamento";
}

function serializeError(error) {
  return {
    message: error?.message || String(error || "Erro desconhecido."),
    name: error?.name || "Error",
  };
}

export function registerQuoteDossierRoutes(app, { requireAuth }) {
  app.get("/api/orcamentos-dossiers/version", (req, res) => {
    return res.json({
      ok: true,
      version: QUOTE_DOSSIER_RUNTIME_VERSION,
      webEnrichment: webEnrichmentStatus(),
    });
  });

  app.post("/api/orcamentos-dossiers/extract", requireAuth, async (req, res) => {
    try {
      const filename = requireString(req.body?.filename || "orcamento.pdf", "filename", { min: 1, max: 220 });
      const base64Pdf = requireString(req.body?.pdfBase64, "pdfBase64", { min: 20, max: 90_000_000 });

      const extracted = await extractTextFromPdfBase64(base64Pdf);
      const parsedDossier = parseQuoteDossierFromText(extracted.text, { filename });
      const dossier = await enrichQuoteDossier(parsedDossier);

      return res.json({
        ok: true,
        version: QUOTE_DOSSIER_RUNTIME_VERSION,
        dossier,
        enrichmentSummary: dossier.enrichmentSummary,
        pages: extracted.pages,
        engine: extracted.engine || "unknown",
      });
    } catch (error) {
      console.error("[quote-dossiers] extract error:", error);

      return res.status(400).json({
        ok: false,
        version: QUOTE_DOSSIER_RUNTIME_VERSION,
        error: error?.message || "Erro ao extrair orçamento.",
        details: serializeError(error),
      });
    }
  });

  app.post("/api/orcamentos-dossiers/generate", requireAuth, async (req, res) => {
    try {
      const dossier = req.body?.dossier || {};
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      const enrichedDossier = await enrichQuoteDossier({ ...dossier, items });
      const pdfBuffer = await generateQuoteDossierPdf({
        dossier: enrichedDossier,
        items: enrichedDossier.items,
      });

      const filename = safeFilename(`${enrichedDossier.budgetNumber || "orcamento"}-dossier-tecnico.pdf`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdfBuffer.length));
      res.setHeader("X-Quote-Dossier-Version", QUOTE_DOSSIER_RUNTIME_VERSION);
      res.setHeader("X-Quote-Dossier-Enrichment", JSON.stringify(enrichedDossier.enrichmentSummary || {}));

      return res.send(pdfBuffer);
    } catch (error) {
      console.error("[quote-dossiers] generate error:", error);

      return res.status(400).json({
        ok: false,
        version: QUOTE_DOSSIER_RUNTIME_VERSION,
        error: error?.message || "Erro ao gerar dossier PDF.",
        details: serializeError(error),
      });
    }
  });
}
