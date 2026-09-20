import { supabase } from "../lib/supabase";
import {
  campaignRetentionExpiry,
  deriveCampaignEndAt,
} from "../shared/campaign-label/campaignLifecycle";

const CAMPAIGNS_TABLE = "campaigns";
const MAX_ITEMS = 50;

function nowIso() {
  return new Date().toISOString();
}

function isPraiaStore(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("praia");
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
    campaignEndAt: row.campaign_end_at || "",
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
    campaignEndAt: snapshot.campaignEndAt || "",
    expiraEm: snapshot.expiraEm || "",
    totalArtigos: Array.isArray(snapshot.dados) ? snapshot.dados.filter(Boolean).length : 0,
    store: String(snapshot.store || "").trim(),
    userId: String(snapshot.userId || "").trim(),
  };

  if (!normalized.campaignEndAt) {
    normalized.campaignEndAt =
      deriveCampaignEndAt({
        items: normalized.dados,
        anoValidade: normalized.anoValidade,
        createdAt: normalized.criadoEm,
      }) || "";
  }

  if (!normalized.expiraEm) {
    normalized.expiraEm = campaignRetentionExpiry({
      campaignEndAt: isPraiaStore(normalized.store) ? normalized.campaignEndAt : null,
      createdAt: normalized.criadoEm,
      retentionDays: 30,
      fallbackDays: 2,
    });
  }

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
    campaign_end_at: normalized.campaignEndAt || null,
    end_notification_status:
      isPraiaStore(normalized.store) &&
      normalized.campaignEndAt &&
      new Date(normalized.campaignEndAt).getTime() > Date.now()
        ? "pending"
        : "skipped",
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

  const safeDados = Array.isArray(dados) ? dados.filter(Boolean) : [];
  const safeAno = anoValidade || agora.getFullYear();
  const criadoEm = agora.toISOString();
  const campaignEndAt =
    deriveCampaignEndAt({
      items: safeDados,
      anoValidade: safeAno,
      createdAt: criadoEm,
    }) || "";

  return {
    id: `camp-${agora.getTime()}`,
    titulo: String(titulo || "PROMO").trim() || "PROMO",
    dados: safeDados,
    anoValidade: safeAno,
    formatoEtiqueta: formatoEtiqueta || "a6",
    origem,
    createdBy: String(createdBy || "Utilizador").trim() || "Utilizador",
    createdByEmail: String(createdByEmail || "").trim(),
    criadoEm,
    campaignEndAt,
    expiraEm: campaignRetentionExpiry({
      campaignEndAt: isPraiaStore(store) ? campaignEndAt : null,
      createdAt: criadoEm,
      retentionDays: 30,
      fallbackDays: 2,
    }),
    totalArtigos: safeDados.length,
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
      "id, titulo, dados, ano_validade, formato_etiqueta, origem, created_by, created_by_email, created_at, expires_at, campaign_end_at, total_artigos, store, user_id",
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
      "id, titulo, dados, ano_validade, formato_etiqueta, origem, created_by, created_by_email, created_at, expires_at, campaign_end_at, total_artigos, store, user_id",
    )
    .single();

  if (error) {
    throw error;
  }

  return mapRowToCampaign(data);
}

export async function loadCampaignById(id, store) {
  const campaignId = String(id || "").trim();
  const storeValue = String(store || "").trim();

  if (!campaignId || !storeValue) {
    return null;
  }

  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select(
      "id, titulo, dados, ano_validade, formato_etiqueta, origem, created_by, created_by_email, created_at, expires_at, campaign_end_at, total_artigos, store, user_id",
    )
    .eq("id", campaignId)
    .eq("store", storeValue)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapRowToCampaign(data) : null;
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