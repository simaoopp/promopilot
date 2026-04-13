const STORAGE_KEY = "expert_admin_historico_campanhas";
const MAX_ITEMS = 50;

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function loadCampaignHistory() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = safeParse(raw, []);
  return Array.isArray(data) ? data : [];
}

export function saveCampaignHistory(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function createCampaignSnapshot({
  titulo,
  dados,
  anoValidade,
  formatoEtiqueta,
  origem = "manual",
  createdBy = "",
  createdByEmail = "",
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
    createdAt: agora.toISOString(),
    totalArtigos: Array.isArray(dados) ? dados.length : 0,
  };
}

export function addCampaignToHistory(snapshot) {
  const current = loadCampaignHistory();
  const updated = [snapshot, ...current].slice(0, MAX_ITEMS);
  saveCampaignHistory(updated);
  return updated;
}

export function removeCampaignFromHistory(id) {
  const current = loadCampaignHistory();
  const updated = current.filter((item) => item.id !== id);
  saveCampaignHistory(updated);
  return updated;
}

export function clearCampaignHistory() {
  saveCampaignHistory([]);
  return [];
}