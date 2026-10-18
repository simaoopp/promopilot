import { requireEventAccess } from "../services/platform/accessService.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  getCampaignEndNotificationById,
  isPraiaCampaignStore,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

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

        if (!await requireEventAccess(req, campaign)) {
          throw new AppError("FORBIDDEN", "Sem acesso a esta campanha da Loja da Praia.", { status: 403 });
        }

        return res.json({ ok: true, item: campaign });
      } catch (error) {
        return next(error);
      }
    },
  );
}
