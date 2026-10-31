import {
  createSupabaseUserClient,
  hasSupabaseAdminConfig,
  hasSupabaseAuthConfig,
  supabaseAdminClient,
  supabaseAuthClient,
} from "../lib/supabaseClients.js";

import { AppError } from "./errorHandler.js";

export async function authDeadline(promise, milliseconds = 10000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new AppError("AUTH_UNAVAILABLE", "Não foi possível verificar a sessão. Tente novamente.", { status: 503 })), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
function invalidIdentity(error) {
  return [400, 401, 403].includes(error?.status)
    || ["bad_jwt", "session_not_found", "user_not_found", "user_banned"].includes(error?.code);
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
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

  const { data, error } = await authDeadline(client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle());

  if (error) {
    throw new AppError("PROFILE_UNAVAILABLE", "Não foi possível carregar a conta.", { status: 503 });
  }

  return data || null;
}

export function buildAuthContext(user, profile) {
  return { user, profile, email: String(user?.email || "").trim().toLowerCase(),
    isAdmin: false, isPlatformAdmin: false, role: "user", store: "", allowedStores: [] };
}

export async function requireAuth(req, _res, next) {
  try {
    if (!hasSupabaseAuthConfig()) throw new AppError("AUTH_UNAVAILABLE", "Autenticação temporariamente indisponível.", { status: 503 });
    const token = getBearerToken(req);
    if (!token) throw new AppError("AUTH_REQUIRED", "Inicie sessão para continuar.", { status: 401 });
    // Validation against Supabase Auth remains mandatory for every request.
    // An unreachable identity provider is not evidence of an invalid JWT.
    const { data, error } = await authDeadline(supabaseAuthClient.auth.getUser(token));
    if (error) {
      throw new AppError(invalidIdentity(error) ? "SESSION_INVALID" : "AUTH_UNAVAILABLE",
        invalidIdentity(error) ? "A sessão expirou. Inicie sessão novamente." : "Não foi possível verificar a sessão.",
        { status: invalidIdentity(error) ? 401 : 503 });
    }
    if (!data?.user || (data.user.banned_until && Date.parse(data.user.banned_until) > Date.now())) {
      throw new AppError("SESSION_INVALID", "A sessão expirou. Inicie sessão novamente.", { status: 401 });
    }
    const profile = await loadAuthProfile(data.user.id, token);
    req.accessToken = token;
    req.authUser = data.user;
    req.authProfile = profile;
    req.auth = buildAuthContext(data.user, profile);
    req.isAdmin = req.auth.isAdmin;
    return next();
  } catch (error) {
    // errorHandler logs only request correlation + safe codes, never JWTs or
    // arbitrary SDK exceptions. Unknown provider failures also fail closed.
    return next(error instanceof AppError ? error : new AppError("AUTH_UNAVAILABLE", "Não foi possível verificar a sessão.", { status: 503 }));
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
  if (String(req.auth?.store || "").trim() === normalizedStore) return true;

  return Array.isArray(req.auth?.allowedStores) && req.auth.allowedStores.includes(normalizedStore);
}
