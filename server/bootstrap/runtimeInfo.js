import { ARTICLES_TABLE } from "../services/articleRepository.js";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  hasSupabaseAdminConfig,
  hasSupabaseAuthConfig,
} from "../lib/supabaseClients.js";
import { ALLOWED_ORIGINS } from "../config/cors.js";
import { isAiEnabled } from "../services/aiProdutoService.js";

export function warnMissingRuntimeConfig() {
  if (!hasSupabaseAuthConfig()) {
    console.warn(
      "[BOOT] SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY não configuradas. Rotas autenticadas ficam indisponíveis.",
    );
  }

  if (!hasSupabaseAdminConfig()) {
    console.warn(
      "[BOOT] SUPABASE_SERVICE_ROLE_KEY em falta. Rotas administrativas e processos automáticos que usam service_role ficam indisponíveis; a pesquisa normal de artigos deve continuar via RPC autenticada.",
    );
  }
}

export function logRuntimeInfo(tag = "BOOT") {
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
