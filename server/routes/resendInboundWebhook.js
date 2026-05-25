import express from "express";
import { getAutomaticCampaignConfig } from "../services/automatic-campaigns/config.js";
import { cleanupExpiredAutomaticCampaigns } from "../services/automatic-campaigns/cleanupService.js";
import { processAutomaticCampaignEmail } from "../services/automatic-campaigns/automaticCampaignProcessor.js";
import {
  getResendInboundConfig,
  parseResendInboundPayload,
  verifyResendWebhookSignature,
} from "../services/automatic-campaigns/resendInboundService.js";

function getStoreProcessingErrors(result = {}) {
  return (result.results || [])
    .filter((item) => item?.status === "error" || item?.error)
    .map((item) => ({
      storeKey: item?.storeKey || "",
      store: item?.store || "",
      totalItems: item?.totalItems || 0,
      error: item?.error || item?.row?.error_message || "Erro desconhecido",
    }));
}

function countStoreErrors(result = {}) {
  return getStoreProcessingErrors(result).length;
}

export function registerResendInboundWebhookRoute(app) {
  app.post(
    "/api/webhooks/resend/inbound",
    express.raw({ type: "application/json", limit: process.env.RESEND_INBOUND_BODY_LIMIT || "10mb" }),
    async (req, res) => {
      const inboundConfig = getResendInboundConfig();
      const campaignConfig = getAutomaticCampaignConfig();

      if (!inboundConfig.enabled) {
        return res.status(404).json({ ok: false, error: "Webhook Resend inbound desativado." });
      }

      const signature = verifyResendWebhookSignature({
        rawBody: req.body,
        headers: req.headers,
        config: inboundConfig,
      });

      if (!signature.ok) {
        return res.status(401).json({ ok: false, error: signature.reason || "Assinatura inválida." });
      }

      try {
        const payload = await parseResendInboundPayload(req.body, { config: inboundConfig });

        if (payload.ignored) {
          return res.status(202).json({ ok: true, ignored: true, eventType: payload.eventType, reason: payload.reason });
        }

        let cleanup = null;
        if (campaignConfig.cleanup?.enabled) {
          cleanup = await cleanupExpiredAutomaticCampaigns({ config: campaignConfig }).catch((error) => ({
            ok: false,
            error: error?.message || String(error),
          }));
        }

        const result = await processAutomaticCampaignEmail(payload.email, {
          sendEmails: campaignConfig.sendEmails,
          dryRun: false,
          force: false,
          organizationId: campaignConfig.defaultOrganizationId || null,
        });

        const storeProcessingErrors = getStoreProcessingErrors(result);

        if (storeProcessingErrors.length > 0) {
          console.error(
            "[resend-inbound] Store processing errors:",
            JSON.stringify({
              messageId: result?.email?.messageId || payload?.email?.messageId || "",
              subject: result?.email?.subject || payload?.email?.subject || "",
              organizationId: campaignConfig.defaultOrganizationId || null,
              storeErrors: storeProcessingErrors.length,
              errors: storeProcessingErrors,
            }),
          );
        }

        return res.status(202).json({
          ok: true,
          provider: "resend-inbound",
          cleanup,
          storeErrors: storeProcessingErrors.length,
          result,
        });
      } catch (error) {
        console.error("[resend-inbound] Erro ao processar webhook:", error);
        return res.status(500).json({
          ok: false,
          error: error?.message || "Erro ao processar webhook Resend inbound.",
        });
      }
    },
  );
}
