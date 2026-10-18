// All application paths already start with /api. Accept the common /api suffix
// in deployment settings, but do not silently send JWTs to arbitrary URL paths.
export function normalizeApiBaseUrl(value = "", hostname = "") {
  const input = String(value || "").trim().replace(/\/+$/, "");
  if (!input) return hostname === "localhost" ? "http://localhost:3001" : "";
  let url;
  try { url = new URL(input); } catch { throw new Error("REACT_APP_API_BASE_URL deve conter o URL HTTPS da API."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || !["/", "/api"].includes(url.pathname)) {
    throw new Error("REACT_APP_API_BASE_URL inválido: use apenas a origem HTTPS da API, sem credenciais, parâmetros ou outros caminhos.");
  }
  return url.origin;
}
