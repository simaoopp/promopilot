import { tenantHeaders, getAccessCacheScope } from "./platformService";
import { requireSession } from "./authSessionService";
import { normalizeApiBaseUrl } from "../shared/apiBaseUrl.mjs";
import { authIssue, withAuthDeadline } from "../utils/authErrors";

async function dossierRequest(path, body, { signal, pdf = false } = {}) {
  const scope = getAccessCacheScope();
  if (!scope) throw authIssue("PERMISSION_DENIED", 403);
  const headers = tenantHeaders();
  const session = await requireSession(signal);
  if (scope !== getAccessCacheScope() || !session.user?.id || scope.split(":")[0] !== session.user.id) throw authIssue("SESSION_CHANGED");
  const base = normalizeApiBaseUrl(process.env.REACT_APP_API_BASE_URL, typeof window !== "undefined" ? window.location.hostname : "");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    return await withAuthDeadline((async () => {
      const response = await fetch(`${base}/api/orcamentos-dossiers/${path}`, {
        method: "POST", signal: controller.signal, cache: "no-store",
        headers: { ...headers, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (scope !== getAccessCacheScope()) throw authIssue("SESSION_CHANGED");
      if (response.status === 401) throw authIssue("API_SESSION_REJECTED", 401);
      if (response.status === 403) throw authIssue("PERMISSION_DENIED", 403);
      if (response.status >= 500 || response.status === 429) throw authIssue("NETWORK_ERROR", response.status);
      if (response.status === 413) throw Object.assign(new Error("O ficheiro ou as fotografias excedem o tamanho permitido. Reduz o tamanho e tenta novamente."), { code: "DOSSIER_TOO_LARGE", status: 413 });
      if (!response.ok) throw Object.assign(new Error("Não foi possível processar o dossier. Confirma o PDF e tenta novamente."), { code: "DOSSIER_REQUEST_FAILED", status: response.status });
      let result;
      if (pdf) {
        if (!(response.headers.get("content-type") || "").includes("application/pdf")) throw new Error("Resposta PDF inválida.");
        result = await response.blob();
        if (!result.size) throw new Error("PDF vazio.");
      } else {
        result = await response.json();
        if (result?.ok === false || !result?.dossier || !Array.isArray(result.dossier.items)) throw new Error("Resposta de dossier inválida.");
      }
      if (scope !== getAccessCacheScope()) throw authIssue("SESSION_CHANGED");
      return result;
    })(), 120000, signal);
  } catch (error) {
    if (signal?.aborted) throw Object.assign(new Error("Pedido cancelado."), { name: "AbortError" });
    const issue = error?.code ? error : Object.assign(new Error("Não foi possível concluir o pedido. Os dados preenchidos continuam no rascunho; tenta novamente."), { code: "DOSSIER_REQUEST_FAILED" });
    console.warn("[dossiers]", { operation: path, code: issue.code, status: Number.isInteger(issue.status) ? issue.status : null });
    throw issue;
  } finally {
    controller.abort(); signal?.removeEventListener("abort", abort);
  }
}
export const extractQuoteDossier = ({ filename, pdfBase64 }, options) => dossierRequest("extract", { filename, pdfBase64 }, options);
export const generateQuoteDossierPdf = ({ dossier, items }, options) => {
  // Technical sheets belong to the local draft. They are not uploaded as part
  // of PDF generation or turned into unusable blob: links in the final dossier.
  const printableItems = (Array.isArray(items) ? items : []).map(item => {
    const printable = { ...item };
    delete printable.technicalSheet;
    return printable;
  });
  return dossierRequest("generate", { dossier, items: printableItems }, { ...options, pdf: true });
};
