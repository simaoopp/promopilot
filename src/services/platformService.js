import { supabase } from "../lib/supabase";
import { requireSession, refreshRejectedSession } from "./authSessionService";
import { authIssue, classifyAuthError, withAuthDeadline } from "../utils/authErrors";
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
  let session = await requireSession(signal);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = session.access_token;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const result = await withAuthDeadline((async () => {
        const response = await fetch(`${API}${path}`, {
          method, cache: "no-store", signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (response.status === 401) {
          await response.body?.cancel();
          return { unauthorized: true };
        }
        if (response.status === 403) throw authIssue("PERMISSION_DENIED", 403);
        if (response.status >= 500 || response.status === 429) throw authIssue("NETWORK_ERROR", response.status);
        if (response.status === 404 && path === "/api/access") {
          throw Object.assign(new Error("A API de acesso não está disponível. Contacte o suporte para verificar a publicação da aplicação."), { status: 404, code: "ACCESS_API_NOT_DEPLOYED" });
        }
        let payload;
        try { payload = await response.json(); }
        catch { throw Object.assign(new Error("A API não devolveu uma resposta válida. Tenta novamente ou contacta o suporte."), { code: "API_INVALID_RESPONSE" }); }
        if (!response.ok || payload.ok === false) {
          // Never render arbitrary upstream error text in the authentication UI.
          throw Object.assign(new Error("Não foi possível concluir esta operação. Verifique os dados e tente novamente."), { status: response.status, code: "API_REQUEST_FAILED" });
        }
        return { payload };
      })(), 20000, signal);
      if (!result.unauthorized) return result.payload;
    } catch (error) {
      if (signal?.aborted || error?.code?.startsWith("API_") || error?.code === "ACCESS_API_NOT_DEPLOYED") throw error;
      throw classifyAuthError(error);
    } finally {
      controller.abort(); signal?.removeEventListener("abort", abort);
    }
    // Read requests may retry after one SDK refresh. Do not replay mutations.
    if (attempt || !["GET", "HEAD"].includes(method)) throw authIssue("API_SESSION_REJECTED", 401);
    session = await refreshRejectedSession(session, signal);
  }
}
export async function loadAccess(signal) {
  const { context } = await platformRequest("/api/access", { signal });
  if (!context || !Array.isArray(context.organizations) || !Array.isArray(context.stores) || !Array.isArray(context.pages) || !context.permissions || Array.isArray(context.permissions) || typeof context.permissions !== "object") {
    throw Object.assign(new Error("A resposta de permissões é incompatível. Contacte o suporte."), { code: "ACCESS_CONTEXT_INVALID", status: 502 });
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
