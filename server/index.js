import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  ARTICLES_TABLE,
} from "./services/articleRepository.js";
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  hasSupabaseAuthConfig,
  hasSupabaseAdminConfig,
} from "./lib/supabaseClients.js";
import { ALLOWED_ORIGINS, corsOptions } from "./config/cors.js";
import { requireAuth } from "./middleware/auth.js";
import { aiRateLimit, startAiRateLimitCleanup } from "./middleware/aiRateLimit.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerArticleRoutes } from "./routes/articles.js";
import { registerAiProdutoRoutes } from "./routes/aiProduto.js";
import { isAiEnabled } from "./services/aiProdutoService.js";

if (!hasSupabaseAuthConfig()) {
  console.warn(
    "[BOOT] SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY não configuradas. Rotas autenticadas ficam indisponíveis.",
  );
}

if (!hasSupabaseAdminConfig()) {
  console.warn(
    "[BOOT] SUPABASE_SERVICE_ROLE_KEY em falta. A base de dados de artigos fica indisponível.",
  );
}

const app = express();
app.set("trust proxy", 1);

app.use(cors(corsOptions));
app.options('/{*splat}', cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

function logRuntimeInfo(tag = "BOOT") {
  console.log(`[${tag}] cwd=`, process.cwd());
  console.log(`[${tag}] ARTICLES_TABLE=`, ARTICLES_TABLE);
  console.log(`[${tag}] GEMINI_API_KEY exists=`, isAiEnabled());
  console.log(`[${tag}] SUPABASE_URL exists=`, !!SUPABASE_URL);
  console.log(
    `[${tag}] SUPABASE_PUBLISHABLE_KEY exists=`,
    !!SUPABASE_PUBLISHABLE_KEY,
  );
  console.log(
    `[${tag}] SUPABASE_ADMIN_CONFIG exists=`,
    hasSupabaseAdminConfig(),
  );
  console.log(`[${tag}] ALLOWED_ORIGINS=`, ALLOWED_ORIGINS);
  console.log(`[${tag}] NODE_ENV=`, process.env.NODE_ENV || "");
  console.log(`[${tag}] NETLIFY=`, process.env.NETLIFY || "");
}

registerHealthRoutes(app, { aiEnabled: isAiEnabled() });
registerArticleRoutes(app, { requireAuth });
registerAiProdutoRoutes(app, {
  requireAuth,
  aiRateLimit,
  aiEnabled: isAiEnabled(),
});
startAiRateLimitCleanup();

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  logRuntimeInfo("LISTEN");
  console.log(`API ativa na porta ${PORT}`);
});
