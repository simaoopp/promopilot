import { supabase } from "../lib/supabase";

function isNotFoundError(error) {
  return error?.code === "PGRST116";
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, store, must_change_password")
    .eq("id", userId)
    .single();

  if (error && !isNotFoundError(error)) throw error;
  // Identity/profile data is independent of organization authorization.
  // PermissionProvider loads the authenticated API context once the profile is ready.
  return { id: userId, ...(data || {}) };
}

export async function upsertProfile(userId, payload = {}) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        first_name: String(payload.first_name || "").trim(),
        last_name: String(payload.last_name || "").trim(),
        ...(payload.store !== undefined ? { store: String(payload.store || "").trim() } : {}),
        must_change_password: Boolean(payload.must_change_password),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("id, first_name, last_name, store, must_change_password")
    .single();

  if (error) {
    throw error;
  }

  return getProfile(userId);
}