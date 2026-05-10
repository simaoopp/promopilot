import { hasSupabaseAuthConfig, supabaseAuthClient } from "../lib/supabaseClients.js";

function getBearerToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

export async function requireAuth(req, res, next) {
  try {
    if (!hasSupabaseAuthConfig()) {
      return res.status(503).json({
        ok: false,
        error:
          "Autenticação indisponível: Supabase não configurado no servidor.",
      });
    }

    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Não autenticado. Token em falta.",
      });
    }

    const { data, error } = await supabaseAuthClient.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        ok: false,
        error: "Sessão inválida ou expirada.",
      });
    }

    req.authUser = data.user;
    return next();
  } catch (error) {
    console.error("Erro no middleware requireAuth:", error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao validar autenticação.",
    });
  }
}
