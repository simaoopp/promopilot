import express from "express";
import cors from "cors";
import compression from "compression";
import { corsOptions } from "./config/cors.js";
import { requireAdmin, requireAuth } from "./middleware/auth.js";
import { apiRateLimit, securityHeaders } from "./middleware/security.js";
import { aiRateLimit } from "./middleware/aiRateLimit.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerArticleRoutes } from "./routes/articles.js";
import { registerAiProdutoRoutes } from "./routes/aiProduto.js";
import { registerAutomaticCampaignRoutes } from "./routes/automaticCampaigns.js";
import { isAiEnabled } from "./services/aiProdutoService.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(compression({ threshold: 1024 }));
  app.use(cors(corsOptions));
  app.options('/{*splat}', cors(corsOptions));
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "2mb" }));
  app.use("/api", apiRateLimit);

  registerHealthRoutes(app, { aiEnabled: isAiEnabled() });
  registerArticleRoutes(app, { requireAuth });
  registerAiProdutoRoutes(app, {
    requireAuth,
    aiRateLimit,
    aiEnabled: isAiEnabled(),
  });
  registerAutomaticCampaignRoutes(app, { requireAuth, requireAdmin });

  return app;
}
