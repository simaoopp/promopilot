import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabaseAuthClient =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

export const supabaseAdminClient =
  SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY)
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      )
    : null;

export function hasSupabaseAuthConfig() {
  return Boolean(supabaseAuthClient);
}

export function hasSupabaseAdminConfig() {
  return Boolean(supabaseAdminClient);
}
