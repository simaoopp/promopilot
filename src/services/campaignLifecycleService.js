import { supabase } from "../lib/supabase";

const API_BASE_URL = String(
  process.env.REACT_APP_API_BASE_URL ||
    (typeof window !== "undefined" && window.location.hostname === "localhost"
      ? "http://localhost:3001"
      : ""),
).replace(/\/+$/, "");

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Inicia sessão novamente.");
  return token;
}

export async function getEndedCampaignDetails(id) {
  const token = await getAccessToken();
  const response = await fetch(
    `${API_BASE_URL}/api/campaign-lifecycle/ended/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error?.message || data?.message || `Erro HTTP ${response.status}`);
  }

  return data?.item || null;
}
