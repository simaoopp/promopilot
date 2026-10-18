import { supabase } from "../lib/supabase";
import { normalizeApiBaseUrl } from "../shared/apiBaseUrl.mjs";

let snapshot = null;
export const getPermissionSnapshot = () => snapshot;
export const tenantHeaders = () => ({
  ...(snapshot?.organizationId ? { "X-Organization-Id": snapshot.organizationId } : {}),
  ...(snapshot?.storeId ? { "X-Store-Id": snapshot.storeId } : {}),
});
export const getAccessCacheScope = () => snapshot?.userId && snapshot?.organizationId
  ? `${snapshot.userId}:${snapshot.organizationId}:${snapshot.storeId || "all"}` : "";
export function setPermissionSnapshot(value) {
  const previous = JSON.stringify(snapshot);
  snapshot = value;
  if (previous !== JSON.stringify(value) && typeof window !== "undefined") window.dispatchEvent(new Event("promopilot:access-changed"));
}

export async function platformRequest(path, { method = "GET", body, signal } = {}) {
  const API = normalizeApiBaseUrl(process.env.REACT_APP_API_BASE_URL, typeof window !== "undefined" ? window.location.hostname : "");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("Inicie sessão para continuar.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 20000);
  try {
    const response = await fetch(`${API}${path}`, {
      method, cache: "no-store", signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404 && path === "/api/access") {
      throw Object.assign(new Error("A API de acesso não está disponível. É necessário publicar o backend atualizado e verificar o endereço da API no Netlify."), { status: 404, code: "ACCESS_API_NOT_DEPLOYED" });
    }
    let payload;
    try { payload = await response.json(); } catch { throw new Error("A API não devolveu uma resposta válida. Verifique a publicação do servidor."); }
    if (!response.ok || payload.ok === false) {
      const message = typeof payload.error === "string" ? payload.error : payload.error?.message || payload.message;
      throw Object.assign(new Error(message || "Não foi possível concluir esta operação."), { status: response.status });
    }
    return payload;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
export async function loadAccess(signal) {
  const { context } = await platformRequest("/api/access", { signal });
  if (!context || !Array.isArray(context.organizations) || !Array.isArray(context.stores) || !context.permissions || typeof context.permissions !== "object") {
    throw new Error("Resposta de acesso incompatível. Verifique a versão do backend e a migração de permissões.");
  }
  return context;
}
export async function selectAccess(organizationId, storeId) {
  return (await platformRequest("/api/access/context", { method: "POST", body: { organizationId, storeId } })).context;
}
export async function ceoRead(resource, { organizationId, query, status, offset = 0, signal } = {}) {
  const params = new URLSearchParams({ offset: String(offset) });
  if (organizationId) params.set("org", organizationId);
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  return (await platformRequest(`/api/ceo/${resource}?${params}`, { signal })).data;
}
export async function ceoChange(entity, data) {
  return (await platformRequest("/api/ceo/change", { method: "POST", body: { entity, data } })).data;
}

// RLS is the authority. This supplies the same selected organization to legacy direct queries.
export async function currentOrganizationId() {
  if (snapshot?.organizationId) return snapshot.organizationId;
  const { data, error } = await supabase.rpc("platform_access_context");
  if (error) throw error;
  if (!data?.organizationId) throw new Error("Selecione uma organização autorizada.");
  return data.organizationId;
}
