import { supabaseAdminClient } from "../../lib/supabaseClients.js";

export async function writeAuditLog({
  req,
  organizationId,
  action,
  entityType,
  entityId = null,
  before = null,
  after = null,
  metadata = null,
} = {}) {
  if (!supabaseAdminClient || !action || !entityType) {
    return { skipped: true };
  }

  const payload = {
    organization_id: organizationId || req?.organizationId || req?.auth?.organizationId || null,
    user_id: req?.authUser?.id || null,
    action: String(action).slice(0, 120),
    entity_type: String(entityType).slice(0, 120),
    entity_id: entityId || null,
    before,
    after,
    metadata,
    request_id: req?.requestId || null,
    ip: req?.headers?.["x-forwarded-for"]?.split?.(",")?.[0]?.trim?.() || req?.ip || null,
    user_agent: req?.headers?.["user-agent"] || null,
  };

  const { error } = await supabaseAdminClient.from("audit_logs").insert(payload);
  if (error) {
    console.warn("[audit] Falha ao gravar audit log:", error.message || error);
    return { ok: false, error };
  }

  return { ok: true };
}
