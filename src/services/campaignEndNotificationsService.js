import { supabase } from "../lib/supabase";

const API_BASE_URL = String(process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");

export async function getCampaignEndNotification(id) {
  const safeId = String(id || "").trim();
  if (!safeId) throw new Error("Notificação de campanha inválida.");

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data?.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Inicia sessão novamente.");

  const response = await fetch(
    `${API_BASE_URL}/api/campaign-end-notifications/${encodeURIComponent(safeId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error?.message || body?.error || "Não foi possível abrir a campanha.");
  }

  return body?.item || null;
}
