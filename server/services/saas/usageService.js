import { supabaseAdminClient } from "../../lib/supabaseClients.js";

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export async function recordUsageEvent({ organizationId, eventType, quantity = 1, metadata = null, req } = {}) {
  if (!supabaseAdminClient || !organizationId || !eventType) {
    return { skipped: true };
  }

  const payload = {
    organization_id: organizationId,
    user_id: req?.authUser?.id || null,
    event_type: String(eventType).slice(0, 120),
    quantity: Math.max(1, Number(quantity) || 1),
    period_month: monthKey(),
    metadata,
    request_id: req?.requestId || null,
  };

  const { error } = await supabaseAdminClient.from("usage_events").insert(payload);
  if (error) {
    console.warn("[usage] Falha ao gravar usage event:", error.message || error);
    return { ok: false, error };
  }

  return { ok: true };
}
