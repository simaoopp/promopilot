// Public errors are deliberately independent of upstream messages (which can
// contain URLs, SQL, credentials or response bodies).
const messages = {
  AUTH_REQUIRED: "Inicie sessão para continuar.",
  SESSION_EXPIRED: "A tua sessão expirou. Inicia sessão novamente.",
  INVALID_CREDENTIALS: "Email ou palavra-passe inválidos.",
  NETWORK_ERROR: "Não foi possível estabelecer ligação. Tenta novamente.",
  AUTH_TIMEOUT: "A ligação demorou demasiado tempo. Tenta novamente.",
  PERMISSION_DENIED: "A tua conta está autenticada, mas não tens acesso a esta organização.",
  AUTH_ERROR: "Não foi possível verificar a sessão. Tenta novamente.",
  SESSION_CHANGED: "A sessão mudou. Tenta novamente na conta atual.",
  API_SESSION_REJECTED: "Não foi possível validar o acesso à aplicação. Tenta novamente ou contacta o suporte.",
};
class AuthIssue extends Error {}
export function authIssue(code = "AUTH_ERROR", status) {
  if (!Object.prototype.hasOwnProperty.call(messages, code)) code = "AUTH_ERROR";
  const kind = ["NETWORK_ERROR", "AUTH_TIMEOUT"].includes(code) ? "network_error"
    : code === "PERMISSION_DENIED" ? "permission_error"
      : code === "SESSION_EXPIRED" ? "session_expired" : "auth_error";
  return Object.assign(new AuthIssue(messages[code]), { name: "AuthIssue", code, kind, status });
}
export function isInvalidRefreshToken(error) {
  return ["refresh_token_not_found", "refresh_token_already_used", "session_not_found"].includes(error?.code)
    || /invalid refresh token|refresh token not found|refresh_token_not_found|refresh token already used|refresh_token_already_used/i.test(String(error?.message || error?.error_description || ""));
}
export function classifyAuthError(error) {
  if (error instanceof AuthIssue) return error;
  if (isInvalidRefreshToken(error) || error?.name === "AuthSessionMissingError") return authIssue("SESSION_EXPIRED", 401);
  if (error?.code === "invalid_credentials" || /^invalid login credentials$/i.test(error?.message || "")) return authIssue("INVALID_CREDENTIALS", 400);
  if (error?.code === "42501" || (error?.status === 403 && error?.name !== "AuthApiError" && !error?.__isAuthError)) return authIssue("PERMISSION_DENIED", 403);
  if (["AuthRetryableFetchError", "AbortError", "TimeoutError", "NavigatorLockAcquireTimeoutError"].includes(error?.name)
      || error instanceof TypeError || error?.status >= 500 || error?.status === 429
      || /fetch failed|failed to fetch|network|transport failure|lock.*timed out/i.test(error?.message || "")) return authIssue("NETWORK_ERROR", error?.status);
  return authIssue("AUTH_ERROR", error?.status);
}
export function logAuthIssue(operation, error) {
  const issue = classifyAuthError(error);
  console.warn("[auth]", { operation, code: issue.code, kind: issue.kind, status: Number.isInteger(issue.status) ? issue.status : null });
}
export function withAuthDeadline(promise, ms = 15000, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const abort = () => finish(reject, Object.assign(new Error("Pedido cancelado."), { name: "AbortError" }));
    const finish = (done, value) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); done(value); };
    // Promise handlers stay attached after a timeout, preventing unhandled
    // rejections. The SDK remains the sole owner of refresh rotation/locks.
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    timer = setTimeout(() => finish(reject, authIssue("AUTH_TIMEOUT")), ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
