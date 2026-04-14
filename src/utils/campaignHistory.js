import { supabase } from "../lib/supabase";

const CAMPAIGNS_TABLE = "campaigns";
const MAX_ITEMS = 50;

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

function mapSnapshotToRow(snapshot = {}) {
  return {
    id: snapshot.id,
    titulo: snapshot.titulo || "PROMO",
    dados: Array.isArray(snapshot.dados) ? snapshot.dados : [],
    ano_validade: snapshot.anoValidade || new Date().getFullYear(),
    formato_etiqueta: snapshot.formatoEtiqueta || "a6",
    origem: snapshot.origem || "manual",
    created_by: snapshot.createdBy || "Utilizador",
    created_by_email: snapshot.createdByEmail || "",
    created_at: snapshot.criadoEm || nowIso(),
    expires_at:
      snapshot.expiraEm ||
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    total_artigos: Array.isArray(snapshot.dados) ? snapshot.dados.length : 0,
    store: snapshot.store || "",
    user_id: snapshot.userId || null,
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
    titulo: titulo || "PROMO",
    dados: Array.isArray(dados) ? dados : [],
    anoValidade: anoValidade || agora.getFullYear(),
    formatoEtiqueta: formatoEtiqueta || "a6",
    origem,
    createdBy: createdBy || "Utilizador",
    createdByEmail: createdByEmail || "",
    criadoEm: agora.toISOString(),
    expiraEm: new Date(
      agora.getTime() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    totalArtigos: Array.isArray(dados) ? dados.length : 0,
    store: String(store || "").trim(),
    userId: userId || "",
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
  if (!snapshot?.store) {
    throw new Error("A campanha precisa de uma loja associada.");
  }

  await cleanupExpiredCampaignHistory(snapshot.store);

  const row = mapSnapshotToRow(snapshot);

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