import { supabase } from "../lib/supabase";

const API_BASE_URL = String(process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Inicia sessão novamente.");
  return token;
}

export async function getEndedCampaignNotification(notificationId) {
  const id = String(notificationId || "").trim();
  if (!id) throw new Error("Identificador da campanha em falta.");

  const token = await accessToken();
  const response = await fetch(
    `${API_BASE_URL}/api/campaign-lifecycle/end-notifications/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return body;
}
