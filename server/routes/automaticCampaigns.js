import { getAutomaticCampaignConfig, hasInboxConfig, hasSmtpConfig } from "../services/automatic-campaigns/config.js";
import { processAutomaticCampaignEmail } from "../services/automatic-campaigns/automaticCampaignProcessor.js";
import { runCampaignEmailWorkerOnce } from "../workers/campaignEmailWorker.js";
import { listAutomaticCampaignRows } from "../services/automatic-campaigns/automaticCampaignRepository.js";
import { createAutomaticCampaignPdfSignedUrl } from "../services/automatic-campaigns/storageService.js";
import { verifyAutomaticCampaignSmtp } from "../services/automatic-campaigns/emailSenderService.js";

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).toLowerCase().trim());
}

export function registerAutomaticCampaignRoutes(app, { requireAuth }) {
  app.get("/api/campanhas-automaticas/config", requireAuth, (_req, res) => {
    const config = getAutomaticCampaignConfig();

    return res.json({
      ok: true,
      workerEnabled: config.enabled,
      inboxConfigured: hasInboxConfig(config),
      smtpConfigured: hasSmtpConfig(config),
      sendEmailsEnabled: config.sendEmails,
      intervalMs: config.intervalMs,
      defaultFormat: config.defaultFormat,
      defaultTitle: config.defaultTitle,
    });
  });

  app.get("/api/campanhas-automaticas", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit || "50", 10) || 50, 200);
      const rows = await listAutomaticCampaignRows({ limit });
      return res.json({ ok: true, items: rows });
    } catch (error) {
      console.error("Erro em GET /api/campanhas-automaticas:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao listar campanhas automáticas.",
      });
    }
  });

  app.post("/api/campanhas-automaticas/processar-email", requireAuth, async (req, res) => {
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

  app.post("/api/campanhas-automaticas/executar-worker", requireAuth, async (req, res) => {
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


  app.post("/api/campanhas-automaticas/testar-smtp", requireAuth, async (_req, res) => {
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
      const signedUrl = await createAutomaticCampaignPdfSignedUrl(
        req.body?.path,
        Number.parseInt(req.body?.expiresInSeconds || "3600", 10) || 3600,
      );

      return res.json({ ok: true, signedUrl });
    } catch (error) {
      console.error("Erro em POST /api/campanhas-automaticas/pdf-url:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao gerar link temporário do PDF.",
      });
    }
  });
}
