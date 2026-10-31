import { supabase } from "../lib/supabase";
import { authIssue, classifyAuthError, isInvalidRefreshToken, withAuthDeadline } from "../utils/authErrors";
import { recoverFromInvalidSupabaseSession } from "../utils/supabaseAuthRecovery";

async function unwrapSession(operation, signal) {
  try {
    const { data, error } = await withAuthDeadline(operation(), 15000, signal);
    if (error) throw error;
    return data?.session || null;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (isInvalidRefreshToken(error)) {
      const removed = await recoverFromInvalidSupabaseSession(supabase);
      // A newer sign-in won the race. Do not reuse its identity for the failed request.
      if (!removed) throw authIssue("SESSION_CHANGED");
    }
    throw classifyAuthError(error);
  }
}
export const readSession = signal => unwrapSession(() => supabase.auth.getSession(), signal);
export async function requireSession(signal) {
  const session = await readSession(signal);
  if (!session?.access_token) {
    const removed = await recoverFromInvalidSupabaseSession(supabase);
    throw authIssue(removed ? "SESSION_EXPIRED" : "SESSION_CHANGED", removed ? 401 : undefined);
  }
  return session;
}

// Only the SDK performs token rotation. This map coalesces concurrent HTTP 401s;
// requests are retried once and can never cross an account change.
const refreshes = new Map();
export async function refreshRejectedSession(rejected, signal) {
  const current = await requireSession(signal);
  if (current.user?.id !== rejected.user?.id) throw authIssue("SESSION_CHANGED");
  if (current.access_token !== rejected.access_token) return current;
  const key = rejected.access_token;
  if (!refreshes.has(key)) {
    const operation = unwrapSession(() => supabase.auth.refreshSession()).finally(() => refreshes.delete(key));
    refreshes.set(key, operation);
  }
  const refreshed = await withAuthDeadline(refreshes.get(key), 15000, signal);
  if (!refreshed?.access_token) throw authIssue("SESSION_EXPIRED", 401);
  if (refreshed.user?.id !== rejected.user?.id) throw authIssue("SESSION_CHANGED");
  return refreshed;
}
