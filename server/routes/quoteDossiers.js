import { extractTextFromPdfBase64 } from "../services/quote-dossiers/pdfTextService.js";
import { parseQuoteDossierFromText } from "../services/quote-dossiers/quoteDossierParser.js";
import { generateQuoteDossierPdf } from "../services/quote-dossiers/quoteDossierPdfService.js";
import {
  extractCustomerFromQuoteText,
  normalizeCustomerName,
} from "../services/quote-dossiers/quoteDossierCustomerService.js";

export const QUOTE_DOSSIER_RUNTIME_VERSION = "quote-dossier-manual-runtime-v7";

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

function normalizeText(value = "") {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseSpaces(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function findMoneyValues(text = "") {
  return [...String(text || "").matchAll(/\d{1,3}(?:[\s.]\d{3})*,\d{2,4}|\d+,\d{2,4}/g)]
    .map((match) => collapseSpaces(match[0]))
    .filter(Boolean);
}

function formatEuro(value = "") {
  const clean = collapseSpaces(value);

  if (!clean) return "";
  if (clean.includes("€")) return clean;

  const twoDecimals = clean.replace(/,\d{4}$/, (match) => match.slice(0, 3));
  return `${twoDecimals} €`;
}

function includesInstallation(text = "") {
  return /instala[çc][aã]o\s+inclu[ií]d[ao]|instala[çc][aã]o\s*\)|\+instala[çc][aã]o|instala[çc][aã]o\s*\(/i.test(text);
}

function looksLikeLaundry(text = "", items = []) {
  const haystack = [
    text,
    ...items.map((item) => [item.description, item.rawDescription, item.category, item.reference].filter(Boolean).join(" ")),
  ].join(" ").toLowerCase();

  return /lavar\s+roupa|sec(ar|adora)\s+roupa|m[aá]q\.\s*secar|m[aá]q\.\s*lavar/.test(haystack);
}

function extractWarrantyObservation(text = "") {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n").map((line) => collapseSpaces(line)).filter(Boolean);

  const candidateLines = lines.filter((line) => (
    /mapfre|extens[aã]o\s+de\s+garantia|garantia\s+.*(?:ano|anos)|\b3\s+anos\b/i.test(line)
  ));

  if (!candidateLines.length) return "";

  const combined = candidateLines.join(" ");
  const value = findMoneyValues(combined).slice(-1)[0] || "";

  const years = combined.match(/\b([1-9]\d?)\s*anos?\b/i)?.[1] || "3";
  const formattedValue = value ? `, no valor de ${formatEuro(value)}` : "";

  if (/lavar|secar|lavandaria/i.test(combined)) {
    return `Consta no orçamento extensão de garantia por mais ${years} anos nas máquinas de lavar e secar roupa${formattedValue}.`;
  }

  return `Consta no orçamento extensão de garantia por mais ${years} anos nos equipamentos indicados${formattedValue}.`;
}

function buildManualObservations(text = "", items = []) {
  const observations = [];
  const normalized = normalizeText(text);

  if (includesInstallation(normalized)) {
    observations.push(looksLikeLaundry(normalized, items) ? "Instalação de lavandaria incluída." : "Instalação incluída.");
  }

  const warrantyObservation = extractWarrantyObservation(normalized);

  if (warrantyObservation) {
    observations.push(warrantyObservation);
  }

  return observations
    .filter((line) => !/pronto\s+pagamento|condi[çc][aã]o\s+de\s+pagamento/i.test(line))
    .join("\n");
}

function toManualItem(item = {}) {
  // Manual sénior: o orçamento só alimenta identificação/preço.
  // Foto, descrição e características ficam para o utilizador preencher.
  return {
    ...item,
    title: item.title || item.description || item.rawDescription || item.reference || "",
    technicalDescription: "",
    features: [],
    imageDataUrl: "",
    enrichment: {
      status: "manual_required",
      source: "orcamento",
      confidence: 1,
      sourceLabel: "Dados importados do orçamento. Fotografia, descrição e características devem ser preenchidas manualmente.",
    },
  };
}

function serializeError(error) {
  return {
    message: error?.message || String(error || "Erro desconhecido."),
    name: error?.name || "Error",
  };
}

function resolveCustomerName({ extracted, parsedDossier }) {
  const combinedCustomerText = [
    extracted.customerCandidate,
    extracted.rawText,
    extracted.combinedText,
    extracted.text,
  ].filter(Boolean).join("\n\n");

  return (
    normalizeCustomerName(extracted.customerCandidate) ||
    extractCustomerFromQuoteText(combinedCustomerText) ||
    normalizeCustomerName(parsedDossier.customerName) ||
    ""
  );
}

export function registerQuoteDossierRoutes(app, { requireAuth }) {
  app.get("/api/orcamentos-dossiers/version", (req, res) => {
    return res.json({
      ok: true,
      version: QUOTE_DOSSIER_RUNTIME_VERSION,
      mode: "manual",
      webEnrichment: {
        enabled: false,
        serper: false,
        brave: false,
      },
    });
  });

  app.post("/api/orcamentos-dossiers/extract", requireAuth, async (req, res) => {
    try {
      const filename = requireString(req.body?.filename || "orcamento.pdf", "filename", { min: 1, max: 220 });
      const base64Pdf = requireString(req.body?.pdfBase64, "pdfBase64", { min: 20, max: 90_000_000 });

      const extracted = await extractTextFromPdfBase64(base64Pdf);
      const parsedDossier = parseQuoteDossierFromText(extracted.text || extracted.rawText || "", { filename });
      const items = Array.isArray(parsedDossier.items) ? parsedDossier.items.map(toManualItem) : [];
      const customerName = resolveCustomerName({ extracted, parsedDossier });
      const notes = buildManualObservations(extracted.combinedText || extracted.rawText || extracted.text || "", items);

      const dossier = {
        ...parsedDossier,
        customerName,
        notes,
        items,
        enrichmentSummary: {
          total: items.length,
          manual: items.length,
          matched: 0,
          web: 0,
          generic: 0,
          mode: "manual",
        },
      };

      return res.json({
        ok: true,
        version: QUOTE_DOSSIER_RUNTIME_VERSION,
        mode: "manual",
        dossier,
        pages: extracted.pages,
        engine: extracted.engine || "unknown",
        customerDebug: {
          parsed: parsedDossier.customerName || "",
          candidate: extracted.customerCandidate || "",
          final: customerName || "",
          hasRawText: Boolean(extracted.rawText),
          engine: extracted.engine || "unknown",
        },
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
      const safeDossier = {
        ...dossier,
        customerName: normalizeCustomerName(dossier.customerName) || dossier.customerName || "",
        notes: String(dossier.notes || "")
          .split(/\n+/)
          .filter((line) => !/pronto\s+pagamento|condi[çc][aã]o\s+de\s+pagamento/i.test(line))
          .join("\n"),
        items,
        enrichmentSummary: {
          total: items.length,
          manual: items.length,
          mode: "manual",
        },
      };

      const pdfBuffer = await generateQuoteDossierPdf({
        dossier: safeDossier,
        items,
      });

      const filename = safeFilename(`${safeDossier.budgetNumber || "orcamento"}-dossier-tecnico.pdf`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdfBuffer.length));
      res.setHeader("X-Quote-Dossier-Version", QUOTE_DOSSIER_RUNTIME_VERSION);
      res.setHeader("X-Quote-Dossier-Mode", "manual");

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
