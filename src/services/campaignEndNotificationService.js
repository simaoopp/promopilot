import { supabase } from "../lib/supabase";

const TABLE = "campaign_end_notifications";

export async function getEndedCampaignNotification(id) {
  const safeId = String(id || "").trim();

  if (!safeId) {
    throw new Error("Campanha inválida.");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id,source_type,source_campaign_id,title,store,origin,campaign_year,items,total_items,end_date,status,notified_at,created_at",
    )
    .eq("id", safeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Campanha não encontrada ou sem acesso.");

  return {
    id: data.id,
    sourceType: data.source_type,
    sourceCampaignId: data.source_campaign_id,
    title: data.title || "Campanha",
    store: data.store || "",
    origin: data.origin || "",
    campaignYear: data.campaign_year || "",
    items: Array.isArray(data.items) ? data.items : [],
    totalItems:
      typeof data.total_items === "number"
        ? data.total_items
        : Array.isArray(data.items)
          ? data.items.length
          : 0,
    endDate: data.end_date || "",
    status: data.status || "",
    notifiedAt: data.notified_at || "",
    createdAt: data.created_at || "",
  };
}
