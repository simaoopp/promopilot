import { requireEventAccess } from "../services/platform/accessService.js";
import {
  getCampaignEndNotificationById,
  getCampaignEndNotificationConfig,
  isPraiaCampaignStore,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

export function registerCampaignEndNotificationRoutes(app, { requireAuth }) {
  app.get("/api/campaign-end-notifications/config", ...requireAuth, (_req, res) => {
    const config = getCampaignEndNotificationConfig();
    return res.json({
      ok: true,
      enabled: config.enabled,
      storeName: config.storeName,
      timeZone: config.timeZone,
      resendConfigured: config.resendConfigured,
    });
  });

  app.get("/api/campaign-end-notifications/:id", ...requireAuth, async (req, res) => {
    try {
      const event = await getCampaignEndNotificationById(req.params.id);

      if (!event || !isPraiaCampaignStore(event.store)) {
        return res.status(404).json({ ok: false, error: "Notificação de campanha não encontrada." });
      }

      if (!await requireEventAccess(req, event)) {
        return res.status(403).json({ ok: false, error: "Sem acesso a esta campanha da Loja da Praia." });
      }

      return res.json({ ok: true, item: event });
    } catch (error) {
      console.error("Erro em GET /api/campaign-end-notifications/:id:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao carregar a campanha terminada.",
      });
    }
  });
}
