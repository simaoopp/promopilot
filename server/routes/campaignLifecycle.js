import { canAccessStore } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { getCampaignEndNotificationById } from "../services/campaign-lifecycle/campaignEndNotificationService.js";

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
        if (!campaign) {
          throw new AppError("NOT_FOUND", "Campanha não encontrada.", { status: 404 });
        }

        if (!canAccessStore(req, campaign.store)) {
          throw new AppError("FORBIDDEN", "Esta campanha não pertence à tua loja.", { status: 403 });
        }

        return res.json({ ok: true, item: campaign });
      } catch (error) {
        return next(error);
      }
    },
  );
}
