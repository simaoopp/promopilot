export function isSupabaseRefreshTokenError(error) {
  const message = String(
    error?.message ||
      error?.error_description ||
      error?.error ||
      error ||
      "",
  );

  return /invalid refresh token|refresh token not found|refresh_token_not_found|refresh token already used|refresh_token_already_used/i.test(
    message,
  );
}

export function clearSupabaseAuthStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;

  Object.keys(window.localStorage)
    .filter(
      (key) =>
        key.startsWith("sb-") ||
        key === "supabase.auth.token" ||
        key.startsWith("etiquetasprom-auth"),
    )
    .forEach((key) => window.localStorage.removeItem(key));
}

export async function recoverFromInvalidSupabaseSession(supabaseClient) {
  try {
    await supabaseClient.auth.signOut({ scope: "local" });
  } catch {
    // Se o refresh token já não existir no GoTrue, a limpeza local continua a ser suficiente.
  }

  clearSupabaseAuthStorage();
}
