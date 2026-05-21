import { getAutomaticCampaignConfig, hasEmailApiConfig, hasInboxConfig, hasSmtpConfig } from "../services/automatic-campaigns/config.js";
import { processAutomaticCampaignEmail } from "../services/automatic-campaigns/automaticCampaignProcessor.js";
import { runCampaignEmailWorkerOnce } from "../workers/campaignEmailWorker.js";
import {
  findAutomaticCampaignByPdfPath,
  listAutomaticCampaignRows,
} from "../services/automatic-campaigns/automaticCampaignRepository.js";
import { createAutomaticCampaignPdfSignedUrl } from "../services/automatic-campaigns/storageService.js";
import { verifyAutomaticCampaignEmailProvider, verifyAutomaticCampaignSmtp } from "../services/automatic-campaigns/emailSenderService.js";
import { cleanupExpiredAutomaticCampaigns } from "../services/automatic-campaigns/cleanupService.js";
import { adminActionRateLimit } from "../middleware/security.js";
import { canAccessStore } from "../middleware/auth.js";

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).toLowerCase().trim());
}

function getUserStore(req) {
  return String(req.auth?.store || req.authProfile?.store || "").trim();
}

function requireStoreScope(req, res) {
  if (req.auth?.isAdmin || req.isAdmin) {
    return "";
  }

  const store = getUserStore(req);
  if (!store) {
    res.status(403).json({
      ok: false,
      error: "O utilizador não tem loja/perfil configurado para consultar campanhas automáticas.",
    });
    return null;
  }

  return store;
}

export function registerAutomaticCampaignRoutes(app, { requireAuth, requireAdmin }) {
  const adminOnly = [requireAuth, requireAdmin, adminActionRateLimit];

  app.get("/api/campanhas-automaticas/config", requireAuth, (_req, res) => {
    const config = getAutomaticCampaignConfig();

    return res.json({
      ok: true,
      workerEnabled: config.enabled,
      inboxConfigured: hasInboxConfig(config),
      smtpConfigured: hasSmtpConfig(config),
      emailProvider: config.emailProvider,
      emailApiConfigured: hasEmailApiConfig(config),
      sendEmailsEnabled: config.sendEmails,
      intervalMs: config.intervalMs,
      defaultFormat: config.defaultFormat,
      defaultTitle: config.defaultTitle,
      pdfEngine: config.pdfEngine,
      allowApproxPdfFallback: config.allowApproxPdfFallback,
      cleanupEnabled: config.cleanup?.enabled,
      cleanupMaxAgeDays: config.cleanup?.maxAgeDays,
      cleanupBatchSize: config.cleanup?.batchSize,
    });
  });

  app.get("/api/campanhas-automaticas", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit || "50", 10) || 50, 200);
      const store = req.isAdmin && req.query.store ? String(req.query.store).trim() : requireStoreScope(req, res);
      if (store === null) return;
      const rows = await listAutomaticCampaignRows({ limit, store, organizationId: req.organizationId || null });
      return res.json({ ok: true, items: rows });
    } catch (error) {
      console.error("Erro em GET /api/campanhas-automaticas:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao listar campanhas automáticas.",
      });
    }
  });

  app.post("/api/campanhas-automaticas/processar-email", adminOnly, async (req, res) => {
    try {
      const result = await processAutomaticCampaignEmail(
        {
          messageId: req.body.messageId || req.body.email_message_id,
          subject: req.body.subject || req.body.emailSubject,
          from: req.body.from || req.body.emailFrom,
          receivedAt: req.body.receivedAt || req.body.emailReceivedAt,
          text: req.body.text || req.body.body || req.body.rawEmailText,
          html: req.body.html,
          rawText: req.body.rawEmailText || req.body.text || req.body.body,
        },
        {
          dryRun: parseBoolean(req.body.dryRun, true),
          sendEmails: parseBoolean(req.body.sendEmails, false),
          force: parseBoolean(req.body.force, false),
          title: req.body.title,
          format: req.body.format,
        },
      );

      return res.json(result);
    } catch (error) {
      console.error("Erro em POST /api/campanhas-automaticas/processar-email:", error);
      return res.status(400).json({
        ok: false,
        error: error?.message || "Erro ao processar email de campanha automática.",
      });
    }
  });

  app.post("/api/campanhas-automaticas/executar-worker", adminOnly, async (req, res) => {
    try {
      const result = await runCampaignEmailWorkerOnce({
        dryRun: parseBoolean(req.body?.dryRun, false),
        sendEmails: parseBoolean(req.body?.sendEmails, undefined),
        force: parseBoolean(req.body?.force, false),
      });

      return res.json(result);
    } catch (error) {
      console.error("Erro em POST /api/campanhas-automaticas/executar-worker:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao executar worker de campanhas automáticas.",
      });
    }
  });

  app.post("/api/campanhas-automaticas/limpar-expiradas", adminOnly, async (req, res) => {
    try {
      const result = await cleanupExpiredAutomaticCampaigns({
        dryRun: parseBoolean(req.body?.dryRun, false),
        maxAgeDays: Number.parseInt(req.body?.maxAgeDays || "", 10) || undefined,
        batchSize: Number.parseInt(req.body?.batchSize || "", 10) || undefined,
      });

      return res.json(result);
    } catch (error) {
      console.error("Erro em POST /api/campanhas-automaticas/limpar-expiradas:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao limpar campanhas automáticas expiradas.",
      });
    }
  });

  app.post("/api/campanhas-automaticas/testar-email", adminOnly, async (_req, res) => {
    try {
      const result = await verifyAutomaticCampaignEmailProvider();
      return res.json(result);
    } catch (error) {
      console.error("Erro em POST /api/campanhas-automaticas/testar-email:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao testar o provedor de email das campanhas automáticas.",
      });
    }
  });

  app.post("/api/campanhas-automaticas/testar-smtp", adminOnly, async (_req, res) => {
    try {
      const result = await verifyAutomaticCampaignSmtp();
      return res.json(result);
    } catch (error) {
      console.error("Erro em POST /api/campanhas-automaticas/testar-smtp:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao testar SMTP das campanhas automáticas.",
      });
    }
  });

  app.post("/api/campanhas-automaticas/pdf-url", requireAuth, async (req, res) => {
    try {
      const path = String(req.body?.path || "").trim();
      const expiresInSeconds = Math.min(
        60 * 60,
        Math.max(60, Number.parseInt(req.body?.expiresInSeconds || "900", 10) || 900),
      );

      if (!path) {
        return res.status(400).json({ ok: false, error: "Caminho do PDF em falta." });
      }

      const store = req.isAdmin && req.body?.store ? String(req.body.store).trim() : requireStoreScope(req, res);
      if (store === null) return;

      const matchingCampaign = await findAutomaticCampaignByPdfPath({
        path,
        store: req.isAdmin ? store : getUserStore(req),
        organizationId: req.organizationId || null,
      });

      if (!matchingCampaign || (!req.isAdmin && !canAccessStore(req, matchingCampaign.store))) {
        return res.status(403).json({
          ok: false,
          error: "PDF não autorizado para este utilizador.",
        });
      }

      const signedUrl = await createAutomaticCampaignPdfSignedUrl(path, expiresInSeconds);

      return res.json({ ok: true, signedUrl, expiresInSeconds });
    } catch (error) {
      console.error("Erro em POST /api/campanhas-automaticas/pdf-url:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao gerar link temporário do PDF.",
      });
    }
  });
}
