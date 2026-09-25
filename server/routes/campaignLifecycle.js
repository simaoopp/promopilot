import { canAccessStore } from "../middleware/auth.js";
import {
  getCampaignEndNotificationById,
  isPraiaCampaignStore,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

function normalize(value = "") {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function samePraiaScope(profileStore, notificationStore) {
  return isPraiaCampaignStore(profileStore) && isPraiaCampaignStore(notificationStore);
}

export function registerCampaignLifecycleRoutes(app, { requireAuth }) {
  app.get("/api/campaign-lifecycle/end-notifications/:id", requireAuth, async (req, res) => {
    try {
      const notification = await getCampaignEndNotificationById(req.params.id);
      if (!notification) {
        return res.status(404).json({ ok: false, error: "Notificação de campanha não encontrada." });
      }

      const requestOrg = String(req.organizationId || "").trim();
      const notificationOrg = String(notification.organization_id || "").trim();
      const profileStore = String(req.auth?.store || req.authProfile?.store || "").trim();

      if (
        requestOrg &&
        notificationOrg &&
        requestOrg !== notificationOrg &&
        !req.isAdmin
      ) {
        return res.status(403).json({ ok: false, error: "Campanha não autorizada para esta organização." });
      }

      const storeAuthorized =
        canAccessStore(req, notification.store) ||
        samePraiaScope(profileStore, notification.store);

      if (!storeAuthorized) {
        return res.status(403).json({ ok: false, error: "Campanha reservada à equipa da Loja da Praia." });
      }

      const snapshot = notification.campaign_snapshot || {};
      return res.json({
        ok: true,
        notification: {
          id: notification.id,
          source: notification.source,
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
          source: snapshot.source || notification.source,
          titulo: snapshot.titulo || notification.campaign_title,
          store: snapshot.store || notification.store,
          campaignEndDate: snapshot.campaignEndDate || notification.campaign_end_date,
        },
      });
    } catch (error) {
      console.error("Erro em GET /api/campaign-lifecycle/end-notifications/:id:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao carregar detalhe da campanha terminada.",
      });
    }
  });
}
