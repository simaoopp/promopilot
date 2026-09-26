import { getEndedCampaignNotification as fetchEndedCampaignNotification } from "./campaignLifecycleService";

function normalizeCampaign(body = {}) {
  const notification = body?.notification || {};
  const snapshot = body?.campaign || {};
  const items = Array.isArray(snapshot.dados) ? snapshot.dados : [];

  return {
    notificationId: notification.id || "",
    sourceType: notification.source || snapshot.source || "manual",
    id: snapshot.id || notification.campaignId || "",
    title: snapshot.titulo || notification.title || "Campanha",
    titulo: snapshot.titulo || notification.title || "Campanha",
    items,
    dados: items,
    totalItems:
      Number(snapshot.totalArtigos) ||
      Number(snapshot.total_artigos) ||
      items.length,
    totalArtigos:
      Number(snapshot.totalArtigos) ||
      Number(snapshot.total_artigos) ||
      items.length,
    campaignYear: snapshot.anoValidade || snapshot.ano_validade || new Date().getFullYear(),
    anoValidade: snapshot.anoValidade || snapshot.ano_validade || new Date().getFullYear(),
    store: snapshot.store || notification.store || "",
    endDate: snapshot.campaignEndDate || notification.campaignEndDate || "",
    terminouEm: snapshot.campaignEndDate || notification.campaignEndDate || "",
    criadoEm: snapshot.criadoEm || snapshot.created_at || "",
    notificadoEm: notification.sentAt || "",
    origem: snapshot.origem || (notification.source === "automatic" ? "automatico-email" : "manual"),
    formatoEtiqueta: snapshot.formatoEtiqueta || snapshot.formato_etiqueta || "a6",
    archivedEndNotification: true,
  };
}

export async function getEndedCampaignNotification(id) {
  const body = await fetchEndedCampaignNotification(id);
  return normalizeCampaign(body);
}

export async function loadEndedCampaignArchive(id) {
  return getEndedCampaignNotification(id);
}
