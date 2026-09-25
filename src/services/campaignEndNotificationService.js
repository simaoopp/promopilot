import { supabase } from "../lib/supabase";

export async function loadEndedCampaignArchive(id) {
  const safeId = String(id || "").trim();
  if (!safeId) return null;

  const { data, error } = await supabase.rpc("get_campaign_end_archive", {
    p_id: safeId,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    notificationId: row.id,
    sourceType: row.source_type || "manual",
    id: row.campaign_id,
    titulo: row.title || "Campanha",
    dados: Array.isArray(row.items) ? row.items : [],
    anoValidade: row.year_validity || new Date().getFullYear(),
    totalArtigos:
      typeof row.article_count === "number"
        ? row.article_count
        : Array.isArray(row.items)
          ? row.items.length
          : 0,
    store: row.store || "",
    criadoEm: row.campaign_created_at || "",
    terminouEm: row.campaign_end_at || "",
    notificadoEm: row.sent_at || "",
    origem: row.source_type === "automatic" ? "automatico-email" : "manual",
    formatoEtiqueta: row.source_type === "automatic" ? "automatico" : "a6",
    archivedEndNotification: true,
  };
}

export async function getEndedCampaignNotification(id) {
  const campaign = await loadEndedCampaignArchive(id);

  if (!campaign) return null;

  return {
    ...campaign,
    title: campaign.titulo,
    items: campaign.dados,
    totalItems: campaign.totalArtigos,
    campaignYear: campaign.anoValidade,
    endDate: campaign.terminouEm,
  };
}
