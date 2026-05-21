import { createSupabaseUserClient, supabaseAdminClient } from "../lib/supabaseClients.js";
import { AppError } from "./errorHandler.js";

function normalizeRole(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isOrgAdminRole(role = "") {
  return ["owner", "admin"].includes(normalizeRole(role));
}

export function normalizeUuid(value = "") {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : "";
}

async function loadMemberships({ userId, accessToken }) {
  if (!userId) return [];

  const client = supabaseAdminClient || createSupabaseUserClient(accessToken);
  if (!client) return [];

  const { data, error } = await client
    .from("organization_members")
    .select("organization_id, role, store_id, status")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    // A migration SaaS pode ainda não estar aplicada. Não rebentamos a app atual.
    console.warn("[tenant] Não foi possível carregar membership SaaS:", error.message || error);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

function pickOrganizationId(req, memberships) {
  const fromHeader = normalizeUuid(req.headers["x-organization-id"]);
  const fromQuery = normalizeUuid(req.query?.organizationId);
  const fromBody = normalizeUuid(req.body?.organization_id || req.body?.organizationId);
  const requested = fromHeader || fromQuery || fromBody;

  if (requested && memberships.some((member) => member.organization_id === requested)) {
    return requested;
  }

  return memberships[0]?.organization_id || null;
}

export async function attachTenantContext(req, _res, next) {
  try {
    if (!req.authUser?.id) return next();

    const memberships = await loadMemberships({
      userId: req.authUser.id,
      accessToken: req.accessToken,
    });
    const organizationId = pickOrganizationId(req, memberships);
    const membership = memberships.find((item) => item.organization_id === organizationId) || null;

    req.memberships = memberships;
    req.organizationId = organizationId;
    req.organizationRole = membership?.role || null;
    req.organizationStoreId = membership?.store_id || null;

    if (req.auth) {
      req.auth.organizationId = organizationId;
      req.auth.organizationRole = membership?.role || null;
      req.auth.organizationStoreId = membership?.store_id || null;
      req.auth.organizationMemberships = memberships;
      req.auth.isOrgAdmin = Boolean(membership && isOrgAdminRole(membership.role));
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireOrganization(req, _res, next) {
  if (req.auth?.isAdmin || req.isAdmin) {
    return next();
  }

  if (!req.organizationId) {
    return next(new AppError("TENANT_REQUIRED", "Organização obrigatória para esta operação."));
  }

  return next();
}

export function requireOrganizationRole(allowedRoles = []) {
  const normalizedAllowed = new Set(allowedRoles.map(normalizeRole));
  return function tenantRoleGuard(req, _res, next) {
    if (req.auth?.isAdmin || req.isAdmin) return next();
    const role = normalizeRole(req.organizationRole);
    if (role && normalizedAllowed.has(role)) return next();
    return next(new AppError("FORBIDDEN", "Sem permissões suficientes nesta organização."));
  };
}
