import { canAccessStore } from "../middleware/auth.js";
import {
  getCampaignEndNotificationById,
  toPublicCampaignEndNotification,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

export function registerCampaignEndNotificationRoutes(app, { requireAuth }) {
  app.get("/api/campaign-end-notifications/:id", requireAuth, async (req, res) => {
    try {
      const row = await getCampaignEndNotificationById(req.params.id);

      if (!row) {
        return res.status(404).json({
          ok: false,
          error: "Notificação de fim de campanha não encontrada.",
        });
      }

      if (!canAccessStore(req, row.store)) {
        return res.status(403).json({
          ok: false,
          error: "Não tens acesso a esta campanha.",
        });
      }

      return res.json({
        ok: true,
        item: toPublicCampaignEndNotification(row),
      });
    } catch (error) {
      console.error("Erro em GET /api/campaign-end-notifications/:id:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Erro ao carregar o fim da campanha.",
      });
    }
  });
}
