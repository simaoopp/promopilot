import { supabase } from "../lib/supabase";
import {
  isSupabaseRefreshTokenError,
  recoverFromInvalidSupabaseSession,
} from "../utils/supabaseAuthRecovery";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "");

function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function getAccessToken() {
  let authResult;

  try {
    authResult = await supabase.auth.getSession();
  } catch (error) {
    if (isSupabaseRefreshTokenError(error)) {
      await recoverFromInvalidSupabaseSession(supabase);
      throw new Error("Sessão expirada. Inicia sessão novamente.");
    }

    throw error;
  }

  const {
    data: { session },
    error,
  } = authResult;

  if (error) {
    if (isSupabaseRefreshTokenError(error)) {
      await recoverFromInvalidSupabaseSession(supabase);
      throw new Error("Sessão expirada. Inicia sessão novamente.");
    }

    throw new Error(error.message || "Não foi possível obter a sessão.");
  }

  const token = session?.access_token || "";

  if (!token) {
    throw new Error("Sessão inválida ou expirada.");
  }

  return token;
}

async function readJsonResponse(response) {
  const rawText = await response.text();

  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(rawText || "Resposta inválida do servidor.");
  }
}

export async function extractQuoteDossier({ filename, pdfBase64 }) {
  const token = await getAccessToken();

  const response = await fetch(buildApiUrl("/api/orcamentos-dossiers/extract"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename,
      pdfBase64,
    }),
  });

  const data = await readJsonResponse(response);

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Erro ao extrair orçamento.");
  }

  return data;
}

export async function generateQuoteDossierPdf({ dossier, items }) {
  const token = await getAccessToken();

  const response = await fetch(buildApiUrl("/api/orcamentos-dossiers/generate"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dossier,
      items,
    }),
  });

  if (!response.ok) {
    const data = await readJsonResponse(response);
    throw new Error(data?.error || "Erro ao gerar dossier PDF.");
  }

  return response.blob();
}
