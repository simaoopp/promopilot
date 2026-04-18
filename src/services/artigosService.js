import { supabase } from "../lib/supabase";

let artigosCache = null;

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "");

export function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export async function readJsonResponse(response) {
  const rawText = await response.text();

  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`Resposta inválida do servidor: ${rawText.slice(0, 200)}`);
  }
}

export async function getAccessToken({ required = true } = {}) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message || "Não foi possível obter a sessão.");
  }

  const token = session?.access_token || "";

  if (!token && required) {
    throw new Error("Sessão inválida ou expirada.");
  }

  return token;
}

async function loadLocalArtigosFallback() {
  const module = await import("../data/artigos.json");
  return Array.isArray(module?.default?.artigos) ? module.default.artigos : [];
}

export async function fetchArtigos({ preferApi = true, force = false } = {}) {
  if (!force && Array.isArray(artigosCache)) {
    return artigosCache;
  }

  if (preferApi && API_BASE_URL) {
    try {
      const token = await getAccessToken();
      const response = await fetch(buildApiUrl("/api/artigos"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await readJsonResponse(response);

      if (response.ok && Array.isArray(data?.artigos)) {
        artigosCache = data.artigos;
        return artigosCache;
      }

      throw new Error(data?.error || "Não foi possível carregar artigos pela API.");
    } catch (error) {
      console.warn("Fallback local de artigos ativado:", error);
    }
  }

  artigosCache = await loadLocalArtigosFallback();
  return artigosCache;
}

export function updateArtigoCache(artigoAtualizado) {
  if (!artigoAtualizado || !Array.isArray(artigosCache)) {
    return;
  }

  artigosCache = artigosCache.map((item) =>
    item.artigo === artigoAtualizado.artigo ? { ...item, ...artigoAtualizado } : item,
  );
}

export async function enrichArtigo(payload) {
  if (!API_BASE_URL) {
    throw new Error("A API não está configurada para enriquecimento de artigos.");
  }

  const token = await getAccessToken();
  const response = await fetch(buildApiUrl("/api/ai-produto"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(data?.error || data?.detalhe || "Erro no servidor.");
  }

  if (!data?.ok) {
    throw new Error(data?.error || "Resposta inválida da AI.");
  }

  return data;
}
