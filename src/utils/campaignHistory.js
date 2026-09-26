import { supabase } from "../lib/supabase";

const CAMPAIGNS_TABLE = "campaigns";
const MAX_ITEMS = 50;

const CAMPAIGN_RETENTION_DAYS = 45;

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
  ) return null;
  return date;
}

function campaignRetentionExpiry(items = [], year, fromDate = new Date()) {
  const minimumExpiry = new Date(
    fromDate.getTime() + CAMPAIGN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const endDates = (Array.isArray(items) ? items : [])
    .map((item) => parseCampaignEndDate(item?.dataFim, year))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const latestEnd = endDates.at(-1);
  if (!latestEnd) return minimumExpiry.toISOString();

  const afterCampaign = new Date(
    latestEnd.getTime() + CAMPAIGN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  return new Date(Math.max(minimumExpiry.getTime(), afterCampaign.getTime())).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function mapRowToCampaign(row = {}) {
  return {
    id: row.id,
    titulo: row.titulo || "PROMO",
    dados: Array.isArray(row.dados) ? row.dados : [],
    anoValidade: row.ano_validade || new Date().getFullYear(),
    formatoEtiqueta: row.formato_etiqueta || "a6",
    origem: row.origem || "manual",
    createdBy: row.created_by || "Utilizador",
    createdByEmail: row.created_by_email || "",
    criadoEm: row.created_at || "",
    expiraEm: row.expires_at || "",
    totalArtigos:
      typeof row.total_artigos === "number"
        ? row.total_artigos
        : Array.isArray(row.dados)
          ? row.dados.length
          : 0,
    store: row.store || "",
    userId: row.user_id || "",
  };
}

export function normalizeCampaignSnapshot(snapshot = {}) {
  const normalized = {
    id: String(snapshot.id || `camp-${Date.now()}`).trim(),
    titulo: String(snapshot.titulo || "PROMO").trim() || "PROMO",
    dados: Array.isArray(snapshot.dados) ? snapshot.dados.filter(Boolean) : [],
    anoValidade: snapshot.anoValidade || new Date().getFullYear(),
    formatoEtiqueta: snapshot.formatoEtiqueta || "a6",
    origem: snapshot.origem || "manual",
    createdBy: String(snapshot.createdBy || "Utilizador").trim() || "Utilizador",
    createdByEmail: String(snapshot.createdByEmail || "").trim(),
    criadoEm: snapshot.criadoEm || nowIso(),
    expiraEm:
      snapshot.expiraEm ||
      campaignRetentionExpiry(
        Array.isArray(snapshot.dados) ? snapshot.dados.filter(Boolean) : [],
        snapshot.anoValidade || new Date().getFullYear(),
      ),
    totalArtigos: Array.isArray(snapshot.dados) ? snapshot.dados.filter(Boolean).length : 0,
    store: String(snapshot.store || "").trim(),
    userId: String(snapshot.userId || "").trim(),
  };

  if (!normalized.store) {
    throw new Error("A campanha precisa de uma loja associada.");
  }

  return normalized;
}

function mapSnapshotToRow(snapshot = {}) {
  const normalized = normalizeCampaignSnapshot(snapshot);

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
  };
}

export function createCampaignSnapshot({
  titulo,
  dados,
  anoValidade,
  formatoEtiqueta,
  origem = "manual",
  createdBy = "",
  createdByEmail = "",
  store = "",
  userId = "",
}) {
  const agora = new Date();

  return {
    id: `camp-${agora.getTime()}`,
    titulo: String(titulo || "PROMO").trim() || "PROMO",
    dados: Array.isArray(dados) ? dados.filter(Boolean) : [],
    anoValidade: anoValidade || agora.getFullYear(),
    formatoEtiqueta: formatoEtiqueta || "a6",
    origem,
    createdBy: String(createdBy || "Utilizador").trim() || "Utilizador",
    createdByEmail: String(createdByEmail || "").trim(),
    criadoEm: agora.toISOString(),
    expiraEm: campaignRetentionExpiry(
      Array.isArray(dados) ? dados.filter(Boolean) : [],
      anoValidade || agora.getFullYear(),
      agora,
    ),
    totalArtigos: Array.isArray(dados) ? dados.filter(Boolean).length : 0,
    store: String(store || "").trim(),
    userId: String(userId || "").trim(),
  };
}

export async function cleanupExpiredCampaignHistory(store) {
  const storeValue = String(store || "").trim();

  if (!storeValue) {
    return;
  }

  const { error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .delete()
    .eq("store", storeValue)
    .lt("expires_at", nowIso());

  if (error) {
    throw error;
  }
}

export async function loadCampaignHistory(store) {
  const storeValue = String(store || "").trim();

  if (!storeValue) {
    return [];
  }

  await cleanupExpiredCampaignHistory(storeValue);

  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select(
      "id, titulo, dados, ano_validade, formato_etiqueta, origem, created_by, created_by_email, created_at, expires_at, total_artigos, store, user_id",
    )
    .eq("store", storeValue)
    .gt("expires_at", nowIso())
    .order("created_at", { ascending: false })
    .limit(MAX_ITEMS);

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map(mapRowToCampaign) : [];
}

export async function addCampaignToHistory(snapshot) {
  const normalized = normalizeCampaignSnapshot(snapshot);

  await cleanupExpiredCampaignHistory(normalized.store);

  const row = mapSnapshotToRow(normalized);

  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .upsert(row, { onConflict: "id" })
    .select(
      "id, titulo, dados, ano_validade, formato_etiqueta, origem, created_by, created_by_email, created_at, expires_at, total_artigos, store, user_id",
    )
    .single();

  if (error) {
    throw error;
  }

  return mapRowToCampaign(data);
}

export async function removeCampaignFromHistory(id, store) {
  const storeValue = String(store || "").trim();

  if (!id || !storeValue) {
    return [];
  }

  const { error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .delete()
    .eq("id", id)
    .eq("store", storeValue);

  if (error) {
    throw error;
  }

  return loadCampaignHistory(storeValue);
}

export async function clearCampaignHistory(store) {
  const storeValue = String(store || "").trim();

  if (!storeValue) {
    return [];
  }

  const { error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .delete()
    .eq("store", storeValue);

  if (error) {
    throw error;
  }

  return [];
}