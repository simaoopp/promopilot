import {
  createSupabaseUserClient,
  hasSupabaseAdminConfig,
  hasSupabaseAuthConfig,
  supabaseAdminClient,
  supabaseAuthClient,
} from "../lib/supabaseClients.js";

function getBearerToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function readAdminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

function normalizeRole(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isAdminRole(role = "") {
  return ["admin", "owner", "super_admin", "superadmin"].includes(normalizeRole(role));
}

async function loadAuthProfile(userId, accessToken = "") {
  if (!userId) {
    return null;
  }

  // Com service role disponível, o backend pode ler o profile sem depender das RLS.
  // No Render, por segurança, o service role não deve existir; nesse caso usamos
  // o JWT do próprio utilizador e deixamos o Supabase/RLS autorizar a leitura.
  const client = hasSupabaseAdminConfig()
    ? supabaseAdminClient
    : createSupabaseUserClient(accessToken);

  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[auth] Não foi possível carregar profile para autorização:", error?.message || error);
    return null;
  }

  return data || null;
}

function buildAuthContext(user, profile) {
  const email = normalizeEmail(user?.email);
  const adminEmails = readAdminEmails();
  const appRole = normalizeRole(user?.app_metadata?.role || user?.app_metadata?.user_role);
  const metadataRole = normalizeRole(user?.user_metadata?.role || user?.user_metadata?.user_role);
  const profileRole = normalizeRole(profile?.role);
  const isAdmin =
    adminEmails.has(email) ||
    isAdminRole(appRole) ||
    isAdminRole(metadataRole) ||
    isAdminRole(profileRole);

  return {
    user,
    profile,
    email,
    isAdmin,
    role: profileRole || appRole || metadataRole || "user",
    store: String(profile?.store || "").trim(),
    allowedStores: Array.isArray(profile?.allowed_stores)
      ? profile.allowed_stores.map((store) => String(store || "").trim()).filter(Boolean)
      : [],
  };
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

    req.accessToken = token;

    const profile = await loadAuthProfile(data.user.id, token);
    const auth = buildAuthContext(data.user, profile);

    req.authUser = data.user;
    req.authProfile = profile;
    req.auth = auth;
    req.isAdmin = auth.isAdmin;

    return next();
  } catch (error) {
    console.error("Erro no middleware requireAuth:", error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao validar autenticação.",
    });
  }
}

export function requireAdmin(req, res, next) {
  if (req.auth?.isAdmin || req.isAdmin) {
    return next();
  }

  return res.status(403).json({
    ok: false,
    error: "Permissão insuficiente para esta operação administrativa.",
  });
}

export function canAccessStore(req, store = "") {
  const normalizedStore = String(store || "").trim();

  if (!normalizedStore) return false;
  if (req.auth?.isAdmin || req.isAdmin) return true;
  if (String(req.auth?.store || "").trim() === normalizedStore) return true;

  return Array.isArray(req.auth?.allowedStores) && req.auth.allowedStores.includes(normalizedStore);
}
