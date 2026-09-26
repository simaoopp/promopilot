import { hasSupabaseAdminConfig, supabaseAdminClient } from "../../lib/supabaseClients.js";

const TABLE = "automatic_campaigns";

const SAFE_CAMPAIGN_SELECT = "id,organization_id,titulo,dados,ano_validade,formato_etiqueta,origem,created_by,created_by_email,created_at,expires_at,total_artigos,store,user_id,email_message_id,email_subject,email_from,email_received_at,processed_at,status,pdf_url,pdfs,error_message";

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).toLowerCase().trim());
}

function plusDaysIso(days = 2) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function parseCampaignEndDate(value, fallbackYear) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  let year;
  let month;
  let day;

  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = raw.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}))?$/);
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3] || fallbackYear);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function campaignRetentionExpiry(items = [], year, keepDays = 5) {
  const retentionDays = Math.max(
    30,
    Number.parseInt(process.env.CAMPAIGN_END_RETENTION_DAYS || "45", 10) || 45,
  );
  const minimumExpiry = new Date(Date.now() + Math.max(keepDays, retentionDays) * 24 * 60 * 60 * 1000);
  const endDates = (Array.isArray(items) ? items : [])
    .map((item) => parseCampaignEndDate(item?.dataFim, year))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const latestEnd = endDates.at(-1);

  if (!latestEnd) return minimumExpiry.toISOString();

  const afterCampaign = new Date(latestEnd.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  return new Date(Math.max(minimumExpiry.getTime(), afterCampaign.getTime())).toISOString();
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
  organizationId = null,
}) {
  const now = new Date().toISOString();
  const safeItems = Array.isArray(items) ? items : [];
  const emailMessageId = String(email?.messageId || email?.uid || email?.id || "").trim();
  const rowId = id || `auto-${emailMessageId || Date.now()}-${storeKey}`;

  return {
    id: rowId,
    organization_id: organizationId || null,
    titulo: title || "PROMOÇÃO",
    dados: safeItems,
    ano_validade: new Date().getFullYear(),
    formato_etiqueta: format || "automatico",
    origem: "automatico-email",
    created_by: "Sistema automático",
    created_by_email: "",
    created_at: now,
    expires_at: campaignRetentionExpiry(safeItems, new Date().getFullYear(), keepDays),
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
    raw_email_text: readBoolean("CAMPAIGN_STORE_RAW_EMAIL", false)
      ? String(email?.rawText || email?.text || "").slice(0, 50000)
      : "",
  };
}

export async function upsertAutomaticCampaignRow(row) {
  assertSupabaseAdmin();

  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .upsert(row, { onConflict: "id" })
    .select(SAFE_CAMPAIGN_SELECT)
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
    .select(SAFE_CAMPAIGN_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function findAutomaticCampaignDuplicate({ emailMessageId, emailSubject, store, dedupeBySubject = true, organizationId = null } = {}) {
  assertSupabaseAdmin();

  if (!store) return null;

  if (emailMessageId) {
    const { data, error } = await supabaseAdminClient
      .from(TABLE)
      .select("id,status,pdf_url,email_message_id,email_subject,store,created_at")
      .eq("email_message_id", emailMessageId)
      .eq("store", store)
      .match(organizationId ? { organization_id: organizationId } : {})
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) return data;
  }

  if (dedupeBySubject && emailSubject) {
    const { data, error } = await supabaseAdminClient
      .from(TABLE)
      .select("id,status,pdf_url,email_message_id,email_subject,store,created_at")
      .eq("email_subject", emailSubject)
      .eq("store", store)
      .match(organizationId ? { organization_id: organizationId } : {})
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) return data;
  }

  return null;
}

export async function findAutomaticCampaignByEmailAndStore(emailMessageId, store, organizationId = null) {
  assertSupabaseAdmin();

  if (!emailMessageId || !store) return null;

  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .select("id,status,pdf_url,email_message_id,store")
    .eq("email_message_id", emailMessageId)
    .eq("store", store)
    .match(organizationId ? { organization_id: organizationId } : {})
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function listAutomaticCampaignRows({ limit = 50, store = "", organizationId = null } = {}) {
  assertSupabaseAdmin();

  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  let query = supabaseAdminClient
    .from(TABLE)
    .select(SAFE_CAMPAIGN_SELECT)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (store) {
    query = query.eq("store", store);
  }

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function findAutomaticCampaignByPdfPath({ path, store = "", organizationId = null, limit = 200 } = {}) {
  assertSupabaseAdmin();

  const safePath = String(path || "").trim();
  if (!safePath) return null;

  let query = supabaseAdminClient
    .from(TABLE)
    .select("id,store,pdf_url,pdfs,created_at,expires_at,status")
    .order("created_at", { ascending: false })
    .limit(Math.min(500, Math.max(1, Number(limit) || 200)));

  if (store) {
    query = query.eq("store", store);
  }

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.find((row) => {
    if (row?.pdf_url && String(row.pdf_url).includes(safePath)) return true;
    const pdfs = row?.pdfs && typeof row.pdfs === "object" ? row.pdfs : {};
    return Object.values(pdfs).some((value) => String(value || "").includes(safePath));
  }) || null;
}

export async function listExpiredAutomaticCampaignRows({ maxAgeDays: _maxAgeDays = 5, limit = 100 } = {}) {
  assertSupabaseAdmin();

  const nowIso = new Date().toISOString();
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));

  // expires_at é a fonte de verdade. Isto evita apagar uma campanha antes da
  // data real de fim apenas por já ter alguns dias de criação.
  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .select("id,created_at,expires_at,pdf_url,pdfs,status,email_subject,store")
    .lt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(safeLimit);

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function deleteAutomaticCampaignRowsByIds(ids = []) {
  assertSupabaseAdmin();

  const safeIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
  if (!safeIds.length) return [];

  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .delete()
    .in("id", safeIds)
    .select("id");

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}
