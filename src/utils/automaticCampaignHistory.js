import { supabase } from "../lib/supabase";

const AUTOMATIC_CAMPAIGNS_TABLE = "automatic_campaigns";
const MAX_ITEMS = 50;

function nowIso() {
  return new Date().toISOString();
}

function plusDaysIso(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapRowToAutomaticCampaign(row = {}) {
  return {
    id: row.id,
    titulo: row.titulo || row.email_subject || "Campanha automática",
    dados: safeArray(row.dados),
    anoValidade: row.ano_validade || new Date().getFullYear(),
    formatoEtiqueta: row.formato_etiqueta || "automatico",
    origem: row.origem || "automatico-email",
    createdBy: row.created_by || "Sistema automático",
    createdByEmail: row.created_by_email || "",
    criadoEm: row.created_at || "",
    expiraEm: row.expires_at || "",
    totalArtigos:
      typeof row.total_artigos === "number"
        ? row.total_artigos
        : safeArray(row.dados).length,
    store: row.store || "",
    userId: row.user_id || "",
    emailMessageId: row.email_message_id || "",
    emailSubject: row.email_subject || "",
    emailFrom: row.email_from || "",
    emailReceivedAt: row.email_received_at || "",
    processedAt: row.processed_at || "",
    status: row.status || "processed",
    pdfUrl: row.pdf_url || "",
    pdfs: safeObject(row.pdfs),
    errorMessage: row.error_message || "",
    rawEmailText: "",
  };
}

export function normalizeAutomaticCampaignSnapshot(snapshot = {}) {
  const agora = new Date();
  const dados = safeArray(snapshot.dados);

  const normalized = {
    id: String(snapshot.id || `auto-camp-${agora.getTime()}`).trim(),
    titulo:
      String(snapshot.titulo || snapshot.emailSubject || "Campanha automática").trim() ||
      "Campanha automática",
    dados,
    anoValidade: snapshot.anoValidade || agora.getFullYear(),
    formatoEtiqueta: snapshot.formatoEtiqueta || "automatico",
    origem: snapshot.origem || "automatico-email",
    createdBy:
      String(snapshot.createdBy || "Sistema automático").trim() || "Sistema automático",
    createdByEmail: String(snapshot.createdByEmail || "").trim(),
    criadoEm: snapshot.criadoEm || agora.toISOString(),
    expiraEm: snapshot.expiraEm || plusDaysIso(agora, 2),
    totalArtigos:
      typeof snapshot.totalArtigos === "number" ? snapshot.totalArtigos : dados.length,
    store: String(snapshot.store || "").trim(),
    userId: String(snapshot.userId || "").trim(),
    emailMessageId: String(snapshot.emailMessageId || "").trim(),
    emailSubject: String(snapshot.emailSubject || snapshot.titulo || "").trim(),
    emailFrom: String(snapshot.emailFrom || "").trim(),
    emailReceivedAt: snapshot.emailReceivedAt || null,
    processedAt: snapshot.processedAt || agora.toISOString(),
    status: String(snapshot.status || "processed").trim() || "processed",
    pdfUrl: String(snapshot.pdfUrl || "").trim(),
    pdfs: safeObject(snapshot.pdfs),
    errorMessage: String(snapshot.errorMessage || "").trim(),
    rawEmailText: "",
  };

  if (!normalized.store) {
    throw new Error("A campanha automática precisa de uma loja associada.");
  }

  return normalized;
}

function mapAutomaticSnapshotToRow(snapshot = {}) {
  const normalized = normalizeAutomaticCampaignSnapshot(snapshot);

  return {
    id: normalized.id,
    titulo: normalized.titulo,
    dados: normalized.dados,
    ano_validade: normalized.anoValidade,
    formato_etiqueta: normalized.formatoEtiqueta,
    origem: normalized.origem,
    created_by: normalized.createdBy,
    created_by_email: normalized.createdByEmail,
    created_at: normalized.criadoEm,
    expires_at: normalized.expiraEm,
    total_artigos: normalized.totalArtigos,
    store: normalized.store,
    user_id: normalized.userId || null,
    email_message_id: normalized.emailMessageId || null,
    email_subject: normalized.emailSubject,
    email_from: normalized.emailFrom,
    email_received_at: normalized.emailReceivedAt,
    processed_at: normalized.processedAt,
    status: normalized.status,
    pdf_url: normalized.pdfUrl,
    pdfs: normalized.pdfs,
    error_message: normalized.errorMessage,

  };
}

export function createAutomaticCampaignSnapshot({
  titulo,
  dados,
  anoValidade,
  formatoEtiqueta,
  createdBy = "Sistema automático",
  createdByEmail = "",
  store = "",
  userId = "",
  emailMessageId = "",
  emailSubject = "",
  emailFrom = "",
  emailReceivedAt = null,
  processedAt = "",
  status = "processed",
  pdfUrl = "",
  pdfs = {},
  errorMessage = "",
  rawEmailText = "",
}) {
  const agora = new Date();

  return normalizeAutomaticCampaignSnapshot({
    id: `auto-camp-${agora.getTime()}-${String(store || "loja").replace(/\s+/g, "-").toLowerCase()}`,
    titulo: titulo || emailSubject || "Campanha automática",
    dados,
    anoValidade: anoValidade || agora.getFullYear(),
    formatoEtiqueta: formatoEtiqueta || "automatico",
    origem: "automatico-email",
    createdBy,
    createdByEmail,
    criadoEm: agora.toISOString(),
    expiraEm: plusDaysIso(agora, 2),
    totalArtigos: safeArray(dados).length,
    store,
    userId,
    emailMessageId,
    emailSubject,
    emailFrom,
    emailReceivedAt,
    processedAt: processedAt || agora.toISOString(),
    status,
    pdfUrl,
    pdfs,
    errorMessage,
    rawEmailText,
  });
}

export async function cleanupExpiredAutomaticCampaignHistory(store) {
  const storeValue = String(store || "").trim();

  if (!storeValue) {
    return;
  }

  const { error } = await supabase
    .from(AUTOMATIC_CAMPAIGNS_TABLE)
    .delete()
    .eq("store", storeValue)
    .lt("expires_at", nowIso());

  if (error) {
    throw error;
  }
}

export async function loadAutomaticCampaignHistory(store) {
  const storeValue = String(store || "").trim();

  if (!storeValue) {
    return [];
  }

  await cleanupExpiredAutomaticCampaignHistory(storeValue);

  const { data, error } = await supabase
    .from(AUTOMATIC_CAMPAIGNS_TABLE)
    .select(
      "id, titulo, dados, ano_validade, formato_etiqueta, origem, created_by, created_by_email, created_at, expires_at, total_artigos, store, user_id, email_message_id, email_subject, email_from, email_received_at, processed_at, status, pdf_url, pdfs, error_message",
    )
    .eq("store", storeValue)
    .gt("expires_at", nowIso())
    .order("created_at", { ascending: false })
    .limit(MAX_ITEMS);

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map(mapRowToAutomaticCampaign) : [];
}

export async function addAutomaticCampaignToHistory(snapshot) {
  const normalized = normalizeAutomaticCampaignSnapshot(snapshot);

  await cleanupExpiredAutomaticCampaignHistory(normalized.store);

  const row = mapAutomaticSnapshotToRow(normalized);

  const { data, error } = await supabase
    .from(AUTOMATIC_CAMPAIGNS_TABLE)
    .upsert(row, { onConflict: "id" })
    .select(
      "id, titulo, dados, ano_validade, formato_etiqueta, origem, created_by, created_by_email, created_at, expires_at, total_artigos, store, user_id, email_message_id, email_subject, email_from, email_received_at, processed_at, status, pdf_url, pdfs, error_message",
    )
    .single();

  if (error) {
    throw error;
  }

  return mapRowToAutomaticCampaign(data);
}

export async function removeAutomaticCampaignFromHistory(id, store) {
  const storeValue = String(store || "").trim();

  if (!id || !storeValue) {
    return [];
  }

  const { error } = await supabase
    .from(AUTOMATIC_CAMPAIGNS_TABLE)
    .delete()
    .eq("id", id)
    .eq("store", storeValue);

  if (error) {
    throw error;
  }

  return loadAutomaticCampaignHistory(storeValue);
}

export async function clearAutomaticCampaignHistory(store) {
  const storeValue = String(store || "").trim();

  if (!storeValue) {
    return [];
  }

  const { error } = await supabase
    .from(AUTOMATIC_CAMPAIGNS_TABLE)
    .delete()
    .eq("store", storeValue);

  if (error) {
    throw error;
  }

  return [];
}
