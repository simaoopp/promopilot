import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabasePublishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
const isTestEnv = process.env.NODE_ENV === "test";
const hasConfig = Boolean(supabaseUrl && supabasePublishableKey);
if (!hasConfig && !isTestEnv) {
  throw new Error("Faltam variáveis do Supabase (REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_PUBLISHABLE_KEY). Verifica a configuração local ou do Netlify.");
}
const effectiveUrl = hasConfig ? supabaseUrl : "https://example.supabase.co";
// Identical to the SDK default: retain existing sessions across this deploy.
export const authStorageKey = `sb-${new URL(effectiveUrl).hostname.split(".")[0]}-auth-token`;
export const initialStoredSession = (() => {
  try { return typeof window !== "undefined" && Boolean(window.localStorage.getItem(authStorageKey)); }
  catch { return false; }
})();
export const supabase = createClient(
  effectiveUrl,
  hasConfig ? supabasePublishableKey : "test-anon-key",
  {
    auth: {
      storageKey: authStorageKey,
      autoRefreshToken: true,
      persistSession: true,
    },
  }
);

