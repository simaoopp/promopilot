import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { normalizeApiBaseUrl } from "../src/shared/apiBaseUrl.mjs";

// Leave enough time for a sleeping/restarting API, but never hang a deployment.
const DEFAULTS = Object.freeze({
  requestTimeoutMs: 20000,
  totalTimeoutMs: 120000,
  maxAttempts: 8,
  retryDelayMs: 5000,
  maxRetryDelayMs: 20000,
});
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK = new Set([
  "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH",
  "EPIPE", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
]);

class ApiCheckError extends Error {
  constructor(message, retryable = false, retryAfterMs = 0) {
    super(message);
    this.name = "ApiCheckError";
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

function checkedOptions(options) {
  const config = { ...DEFAULTS, ...options };
  for (const [key, min, max] of [
    ["requestTimeoutMs", 1, 60000], ["totalTimeoutMs", 1, 300000],
    ["maxAttempts", 1, 20], ["retryDelayMs", 0, 30000], ["maxRetryDelayMs", 0, 30000],
  ]) {
    if (!Number.isSafeInteger(config[key]) || config[key] < min || config[key] > max) {
      throw new Error(`Verificação da API: ${key} deve ser um inteiro entre ${min} e ${max}.`);
    }
  }
  if (config.maxRetryDelayMs < config.retryDelayMs) {
    throw new Error("Verificação da API: maxRetryDelayMs deve ser igual ou superior a retryDelayMs.");
  }
  return config;
}

export function apiCheckOptionsFromEnv(env = process.env) {
  const options = {};
  for (const [name, key] of [
    ["API_DEPLOYMENT_CHECK_TIMEOUT_MS", "totalTimeoutMs"],
    ["API_DEPLOYMENT_REQUEST_TIMEOUT_MS", "requestTimeoutMs"],
    ["API_DEPLOYMENT_CHECK_MAX_ATTEMPTS", "maxAttempts"],
  ]) {
    if (env[name] !== undefined && env[name] !== "") options[key] = Number(env[name]);
  }
  return checkedOptions(options);
}

function transientNetworkError(error) {
  const pending = [error], seen = new Set();
  for (let i = 0; i < pending.length && i < 20; i += 1) {
    const current = pending[i];
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (["TimeoutError", "AbortError"].includes(current.name) || RETRYABLE_NETWORK.has(current.code)) return true;
    if (current.cause) pending.push(current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors.slice(0, 10));
  }
  // Some transports omit the native error code. Certificate/DNS errors with a
  // cause remain permanent; do not retry every programming/configuration error.
  return error?.name === "TypeError" && error.message === "fetch failed" && !error.cause;
}

function retryAfterMs(response) {
  const value = response.headers?.get?.("retry-after");
  if (!value) return 0;
  const delay = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : 0;
}

function releaseBody(response) {
  try { response?.body?.cancel()?.catch(() => {}); } catch { /* Already consumed or cancelled. */ }
}

async function checkOnce(origin, request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    // This anonymous GET must be rejected with JSON 401. Never send tokens,
    // cookies, service-role keys or follow a redirect to another origin.
    response = await request(`${origin}/api/access`, {
      method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal,
    });
    if (RETRYABLE_HTTP.has(response.status)) {
      throw new ApiCheckError(`HTTP ${response.status}`, true, retryAfterMs(response));
    }
    if (response.status !== 401) {
      throw new ApiCheckError(`Verificação de /api/access falhou (HTTP ${response.status}). Publique/configure primeiro o backend e confirme REACT_APP_API_BASE_URL.`);
    }
    let body;
    try { body = await response.json(); }
    catch (error) {
      if (controller.signal.aborted || transientNetworkError(error)) throw error;
      throw new ApiCheckError("A API devolveu HTML ou JSON inválido em /api/access. Verifique o URL e o deploy do backend.");
    }
    if (controller.signal.aborted) throw new ApiCheckError("timeout ao ler a resposta da API", true);
    if (body?.ok !== false || !body?.error) {
      throw new ApiCheckError("A resposta HTTP 401 de /api/access não corresponde à API esperada. Confirme REACT_APP_API_BASE_URL e o backend publicado.");
    }
  } catch (error) {
    if (error instanceof ApiCheckError) throw error;
    if (controller.signal.aborted || ["TimeoutError", "AbortError"].includes(error?.name)) {
      throw new ApiCheckError(`timeout ao contactar/ler a API (${Math.ceil(timeoutMs / 1000)}s)`, true);
    }
    if (transientNetworkError(error)) throw new ApiCheckError("falha temporária de rede ao contactar a API", true);
    // Raw transport errors can include URLs or response data. Keep logs bounded
    // and actionable without echoing credentials or arbitrary upstream messages.
    throw new ApiCheckError("Não foi possível contactar a API. Confirme REACT_APP_API_BASE_URL, o DNS e o certificado HTTPS do backend.");
  } finally {
    clearTimeout(timer);
    releaseBody(response);
  }
}

export async function verifyApiDeployment(base, request = fetch, options = {}) {
  const origin = normalizeApiBaseUrl(base);
  if (!origin) throw new Error("Configure REACT_APP_API_BASE_URL com a origem da API antes de publicar.");
  const config = checkedOptions(options);
  const now = options.now || (() => performance.now());
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const onRetry = options.onRetry || (() => {});
  const started = now(), deadline = started + config.totalTimeoutMs;
  let attempts = 0, lastError;
  while (attempts < config.maxAttempts && now() < deadline) {
    attempts += 1;
    const timeoutMs = Math.max(1, Math.floor(Math.min(config.requestTimeoutMs, deadline - now())));
    try {
      await checkOnce(origin, request, timeoutMs);
      if (now() > deadline) throw new ApiCheckError("tempo total de verificação esgotado", true);
      return { ok: true };
    } catch (error) {
      if (!(error instanceof ApiCheckError) || !error.retryable) throw error;
      lastError = error;
      const remainingMs = deadline - now();
      const delayMs = Math.max(error.retryAfterMs, Math.min(config.maxRetryDelayMs, config.retryDelayMs * 2 ** (attempts - 1)));
      if (attempts >= config.maxAttempts || delayMs >= remainingMs) break;
      onRetry({ attempt: attempts, maxAttempts: config.maxAttempts, reason: error.message, delayMs });
      await sleep(delayMs);
    }
  }
  throw new Error(`A API não ficou pronta após ${attempts} tentativa(s), em ${Math.ceil((now() - started) / 1000)}s (limite total: ${Math.ceil(config.totalTimeoutMs / 1000)}s). Último resultado: ${lastError?.message || "tempo esgotado"}. Verifique o serviço e os logs do backend e confirme REACT_APP_API_BASE_URL. A publicação foi bloqueada.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = apiCheckOptionsFromEnv();
    console.log(`A verificar /api/access: até ${config.maxAttempts} tentativas, limite total de ${Math.ceil(config.totalTimeoutMs / 1000)}s.`);
    await verifyApiDeployment(process.env.REACT_APP_API_BASE_URL, fetch, {
      ...config,
      onRetry: ({ attempt, maxAttempts, reason, delayMs }) => {
        console.log(`API ainda indisponível (${reason}). Tentativa ${attempt + 1}/${maxAttempts} em ${Math.ceil(delayMs / 1000)}s.`);
      },
    });
    console.log("✓ API de acesso publicada e autenticação exigida");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
