import { canAccessStore } from "../middleware/auth.js";
import {
  getCampaignEndNotificationById,
  getCampaignEndNotificationConfig,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

function normalizeStore(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isPraiaStore(value = "") {
  const store = normalizeStore(value);
  return store === "praia" || store === "loja da praia";
}

function userCanAccessPraia(req, event) {
  if (req.auth?.isAdmin || req.isAdmin) return true;

  const userStore = req.auth?.store || req.authProfile?.store || "";
  if (isPraiaStore(userStore) && isPraiaStore(event.store)) return true;

  const allowedStores = Array.isArray(req.auth?.allowedStores) ? req.auth.allowedStores : [];
  if (allowedStores.some(isPraiaStore) && isPraiaStore(event.store)) return true;

  return canAccessStore(req, event.store);
}

function userCanAccessOrganization(req, event) {
  if (req.auth?.isAdmin || req.isAdmin || !event.organization_id) return true;

  if (req.organizationId === event.organization_id) return true;

  return Array.isArray(req.memberships) && req.memberships.some(
    (membership) =>
      membership?.organization_id === event.organization_id &&
      membership?.status === "active",
  );
}

export function registerCampaignEndNotificationRoutes(app, { requireAuth }) {
  app.get("/api/campaign-end-notifications/config", requireAuth, (_req, res) => {
    return res.json({ ok: true, ...getCampaignEndNotificationConfig() });
  });

  app.get("/api/campaign-end-notifications/:id", requireAuth, async (req, res) => {
    try {
      const event = await getCampaignEndNotificationById(req.params.id);

      if (!event) {
        return res.status(404).json({
          ok: false,
          error: "Notificação de campanha não encontrada.",
        });
      }

      if (!isPraiaStore(event.store)) {
        return res.status(404).json({
          ok: false,
          error: "Notificação de campanha não encontrada.",
        });
      }

      if (!userCanAccessPraia(req, event) || !userCanAccessOrganization(req, event)) {
        return res.status(403).json({
          ok: false,
          error: "Sem acesso a esta campanha da Loja da Praia.",
        });
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
