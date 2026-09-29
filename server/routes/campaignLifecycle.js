import { AppError } from "../middleware/errorHandler.js";
import {
  getCampaignEndNotificationById,
  isPraiaCampaignStore,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

function userCanAccessPraia(req, event) {
  if (req.auth?.isAdmin || req.isAdmin) return true;

  const userStore = req.auth?.store || req.authProfile?.store || "";
  if (isPraiaCampaignStore(userStore) && isPraiaCampaignStore(event.store)) return true;

  const allowedStores = Array.isArray(req.auth?.allowedStores) ? req.auth.allowedStores : [];
  return allowedStores.some(isPraiaCampaignStore) && isPraiaCampaignStore(event.store);
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

export function registerCampaignLifecycleRoutes(app, { requireAuth }) {
  app.get(
    "/api/campaign-lifecycle/ended/:id",
    ...requireAuth,
    async (req, res, next) => {
      try {
        const id = String(req.params?.id || "").trim();
        if (!id) {
          throw new AppError("VALIDATION_ERROR", "Identificador da campanha em falta.", { status: 400 });
        }

        const campaign = await getCampaignEndNotificationById(id);
        if (!campaign || !isPraiaCampaignStore(campaign.store)) {
          throw new AppError("NOT_FOUND", "Campanha não encontrada.", { status: 404 });
        }

        if (!userCanAccessPraia(req, campaign) || !userCanAccessOrganization(req, campaign)) {
          throw new AppError("FORBIDDEN", "Sem acesso a esta campanha da Loja da Praia.", { status: 403 });
        }

        return res.json({ ok: true, item: campaign });
      } catch (error) {
        return next(error);
      }
    },
  );
}
