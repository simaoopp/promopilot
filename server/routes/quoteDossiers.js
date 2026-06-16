import { extractTextFromPdfBase64 } from "../services/quote-dossiers/pdfTextService.js";
import { parseQuoteDossierFromText } from "../services/quote-dossiers/quoteDossierParser.js";
import { generateQuoteDossierPdf } from "../services/quote-dossiers/quoteDossierPdfService.js";

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

export function registerQuoteDossierRoutes(app, { requireAuth }) {
  app.post("/api/orcamentos-dossiers/extract", requireAuth, async (req, res) => {
    try {
      const filename = requireString(req.body?.filename || "orcamento.pdf", "filename", { min: 1, max: 220 });
      const base64Pdf = requireString(req.body?.pdfBase64, "pdfBase64", { min: 20, max: 30_000_000 });

      const extracted = await extractTextFromPdfBase64(base64Pdf);
      const dossier = parseQuoteDossierFromText(extracted.text, { filename });

      return res.json({
        ok: true,
        dossier,
        pages: extracted.pages,
      });
    } catch (error) {
      console.error("[quote-dossiers] extract error:", error);
      return res.status(400).json({
        ok: false,
        error: error?.message || "Erro ao extrair orçamento.",
      });
    }
  });

  app.post("/api/orcamentos-dossiers/generate", requireAuth, async (req, res) => {
    try {
      const dossier = req.body?.dossier || {};
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      const pdfBuffer = await generateQuoteDossierPdf({ dossier, items });
      const filename = safeFilename(`dossier-${dossier.budgetNumber || dossier.customerName || "orcamento"}.pdf`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdfBuffer.length));

      return res.send(pdfBuffer);
    } catch (error) {
      console.error("[quote-dossiers] generate error:", error);
      return res.status(400).json({
        ok: false,
        error: error?.message || "Erro ao gerar dossier PDF.",
      });
    }
  });
}
