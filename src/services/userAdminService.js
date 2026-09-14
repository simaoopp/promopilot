import { supabase } from "../lib/supabase";

const API_BASE_URL = String(process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const token = data?.session?.access_token;

  if (!token) {
    throw new Error("Sessão expirada. Inicia sessão novamente.");
  }

  return token;
}

async function request(path, body) {
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error?.message ||
        data?.error ||
        data?.message ||
        `Erro HTTP ${response.status}`,
    );
  }

  return data;
}

export function inviteUserWithSupabase(payload) {
  return request("/api/admin/users/invite", payload);
}

export function sendUserPasswordReset(email) {
  return request("/api/admin/users/password-reset", { email });
}
