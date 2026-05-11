import express from "express";
import cors from "cors";
import compression from "compression";
import { corsOptions } from "./config/cors.js";
import { requireAuth } from "./middleware/auth.js";
import { aiRateLimit } from "./middleware/aiRateLimit.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerArticleRoutes } from "./routes/articles.js";
import { registerAiProdutoRoutes } from "./routes/aiProduto.js";
import { isAiEnabled } from "./services/aiProdutoService.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(compression({ threshold: 1024 }));
  app.use(cors(corsOptions));
  app.options('/{*splat}', cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));

  registerHealthRoutes(app, { aiEnabled: isAiEnabled() });
  registerArticleRoutes(app, { requireAuth });
  registerAiProdutoRoutes(app, {
    requireAuth,
    aiRateLimit,
    aiEnabled: isAiEnabled(),
  });

  return app;
}
