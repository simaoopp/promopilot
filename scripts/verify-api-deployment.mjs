import { pathToFileURL } from "node:url";
import { normalizeApiBaseUrl } from "../src/shared/apiBaseUrl.mjs";

export async function verifyApiDeployment(base, request = fetch) {
  const origin = normalizeApiBaseUrl(base);
  if (!origin) throw new Error("Configure REACT_APP_API_BASE_URL com a origem da API antes de publicar.");
  // No credentials and no business data: an installed, configured route must
  // reject this request with 401, never HTML, a redirect, 404, 200 or 503.
  const response = await request(`${origin}/api/access`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15000) });
  let body;
  try { body = await response.json(); } catch { throw new Error("A API devolveu HTML ou conteúdo inválido. Verifique o URL e o deploy do backend."); }
  if (response.status !== 401 || body?.ok !== false || !body?.error) {
    throw new Error(`Verificação de /api/access falhou (HTTP ${response.status}). Publique/configure primeiro o backend e confirme REACT_APP_API_BASE_URL.`);
  }
  return { ok: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await verifyApiDeployment(process.env.REACT_APP_API_BASE_URL); console.log("✓ API de acesso publicada e autenticação exigida"); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
