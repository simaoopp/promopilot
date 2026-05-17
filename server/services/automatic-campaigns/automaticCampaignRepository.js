import { hasSupabaseAdminConfig, supabaseAdminClient } from "../../lib/supabaseClients.js";

const TABLE = "automatic_campaigns";

function plusDaysIso(days = 2) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function assertSupabaseAdmin() {
  if (!hasSupabaseAdminConfig()) {
    throw new Error("Supabase service role não configurado no servidor.");
  }
}

export function buildAutomaticCampaignRow({
  id,
  title,
  items,
  store,
  storeKey,
  format,
  email,
  status = "processed",
  pdfUrl = "",
  pdfs = {},
  errorMessage = "",
  keepDays = 2,
}) {
  const now = new Date().toISOString();
  const safeItems = Array.isArray(items) ? items : [];
  const emailMessageId = String(email?.messageId || email?.uid || email?.id || "").trim();
  const rowId = id || `auto-${emailMessageId || Date.now()}-${storeKey}`;

  return {
    id: rowId,
    titulo: title || email?.subject || "Campanha automática",
    dados: safeItems,
    ano_validade: new Date().getFullYear(),
    formato_etiqueta: format || "automatico",
    origem: "automatico-email",
    created_by: "Sistema automático",
    created_by_email: "",
    created_at: now,
    expires_at: plusDaysIso(keepDays),
    total_artigos: safeItems.length,
    store: store?.store || store?.label || storeKey || "",
    user_id: null,
    email_message_id: emailMessageId || null,
    email_subject: email?.subject || "",
    email_from: email?.from || "",
    email_received_at: email?.receivedAt || null,
    processed_at: now,
    status,
    pdf_url: pdfUrl || "",
    pdfs,
    error_message: errorMessage || "",
    raw_email_text: email?.rawText || email?.text || "",
  };
}

export async function upsertAutomaticCampaignRow(row) {
  assertSupabaseAdmin();

  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateAutomaticCampaignRow(id, patch) {
  assertSupabaseAdmin();

  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function findAutomaticCampaignByEmailAndStore(emailMessageId, store) {
  assertSupabaseAdmin();

  if (!emailMessageId || !store) return null;

  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .select("id,status,pdf_url,email_message_id,store")
    .eq("email_message_id", emailMessageId)
    .eq("store", store)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function listAutomaticCampaignRows({ limit = 50 } = {}) {
  assertSupabaseAdmin();

  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}
