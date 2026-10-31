import { authStorageKey } from "../lib/supabase";
import { isInvalidRefreshToken, withAuthDeadline } from "./authErrors";

export const isSupabaseRefreshTokenError = isInvalidRefreshToken;
export const SESSION_EXPIRED_EVENT = "promopilot:session-expired";
export function readAuthStorage(key = authStorageKey) {
  try { return key && typeof window !== "undefined" ? window.localStorage.getItem(key) : undefined; }
  catch { return undefined; }
}

export async function recoverFromInvalidSupabaseSession(client) {
  // Supabase 2.102 removes its own session on a non-retryable refresh failure.
  // Recheck before any fallback cleanup: another tab may already have logged in.
  const { data, error } = await withAuthDeadline(client.auth.getSession());
  if (data?.session) return false;
  if (error && !isInvalidRefreshToken(error)) throw error;
  const current = readAuthStorage();
  // Only the SDK writes/removes auth storage under its own cross-tab lock.
  // A direct read/remove fallback would have a race with another tab signing in.
  if (current) return false;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  return true;
}
