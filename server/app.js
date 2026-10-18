import express from "express";
import cors from "cors";
import compression from "compression";
import { corsOptions } from "./config/cors.js";
import { requireAdmin, requireAuth } from "./middleware/auth.js";
import { apiRateLimit, securityHeaders } from "./middleware/security.js";
import { requestContext } from "./middleware/requestContext.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { attachTenantContext } from "./middleware/tenant.js";
import { aiRateLimit } from "./middleware/aiRateLimit.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerArticleRoutes } from "./routes/articles.js";
import { registerAiProdutoRoutes } from "./routes/aiProduto.js";
import { registerAutomaticCampaignRoutes } from "./routes/automaticCampaigns.js";
import { registerQuoteDossierRoutes } from "./routes/quoteDossiers.js";
import { registerResendInboundWebhookRoute } from "./routes/resendInboundWebhook.js";
import { registerSaasAdminRoutes } from "./routes/saasAdmin.js";
import { registerArticleDatabaseSyncRoutes } from "./routes/articleDatabaseSync.js";
import { registerCampaignEndNotificationRoutes } from "./routes/campaignEndNotifications.js";
import { registerCampaignLifecycleRoutes } from "./routes/campaignLifecycle.js";
import { requirePermission } from "./services/platform/accessService.js";
import { registerPlatformRoutes } from "./routes/platform.js";
import { isAiEnabled } from "./services/aiProdutoService.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(securityHeaders);
  app.use(compression({ threshold: 1024 }));
  app.use(cors(corsOptions));
  app.options('/{*splat}', cors(corsOptions));

  // Webhook público assinado do Resend. Tem de entrar antes do express.json
  // para preservarmos o raw body usado na validação Svix.
  registerResendInboundWebhookRoute(app);

  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "80mb" }));
  app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || "80mb" }));
  app.use("/api", apiRateLimit);

  registerHealthRoutes(app, { aiEnabled: isAiEnabled() });
  const authStack = [requireAuth, attachTenantContext];
  registerPlatformRoutes(app, { authStack, requireAdmin });

  registerArticleRoutes(app, { requireAuth: [...authStack, requirePermission("products.read")] });
  registerAiProdutoRoutes(app, {
    requireAuth: [...authStack, requirePermission("ai.read")],
    aiRateLimit,
    aiEnabled: isAiEnabled(),
  });
  registerAutomaticCampaignRoutes(app, { requireAuth: [...authStack, requirePermission("automations.read")], requireAdmin });
  registerQuoteDossierRoutes(app, { requireAuth: [...authStack, requirePermission("dossiers.write")] });
  registerSaasAdminRoutes(app, { requireAuth: authStack, requireAdmin });
  registerArticleDatabaseSyncRoutes(app, { requireAuth, attachTenantContext });
  registerCampaignEndNotificationRoutes(app, { requireAuth: [...authStack, requirePermission("reports.read")] });
  registerCampaignLifecycleRoutes(app, { requireAuth: [...authStack, requirePermission("reports.read")] });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
