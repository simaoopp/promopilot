import { canAccessStore } from "../middleware/auth.js";
import {
  getCampaignEndNotificationById,
  isPraiaCampaignStore,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

function isPraiaUser(req) {
  const store = String(req.auth?.store || req.authProfile?.store || "").trim();
  return isPraiaCampaignStore(store);
}

export function registerCampaignLifecycleRoutes(app, { requireAuth }) {
  app.get("/api/campaign-lifecycle/end-notifications/:id", requireAuth, async (req, res) => {
    try {
      const notification = await getCampaignEndNotificationById(req.params.id);
      if (!notification) {
        return res.status(404).json({ ok: false, error: "Campanha terminada não encontrada." });
      }

      const requestOrg = String(req.organizationId || "").trim();
      const notificationOrg = String(notification.organization_id || "").trim();

      if (
        requestOrg &&
        notificationOrg &&
        requestOrg !== notificationOrg &&
        !req.isAdmin
      ) {
        return res.status(403).json({ ok: false, error: "Campanha não autorizada para esta organização." });
      }

      const storeAuthorized =
        isPraiaUser(req) ||
        canAccessStore(req, notification.store);

      if (!storeAuthorized) {
        return res.status(403).json({
          ok: false,
          error: "Esta campanha está reservada à equipa da Loja da Praia.",
        });
      }

      const snapshot = notification.campaign_snapshot || {};
      return res.json({
        ok: true,
        notification: {
          id: notification.id,
          source: notification.source_type,
          campaignId: notification.campaign_id,
          store: notification.store,
          title: notification.campaign_title,
          campaignEndDate: notification.campaign_end_date,
          status: notification.status,
          sentAt: notification.sent_at,
        },
        campaign: {
          ...snapshot,
          id: snapshot.id || notification.campaign_id,
          source: snapshot.source || notification.source_type,
          titulo: snapshot.titulo || notification.campaign_title,
          store: snapshot.store || notification.store,
          campaignEndDate: snapshot.campaignEndDate || notification.campaign_end_date,
        },
      });
    } catch (error) {
      console.error("Erro em GET /api/campaign-lifecycle/end-notifications/:id:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao carregar a campanha terminada.",
      });
    }
  });
}
