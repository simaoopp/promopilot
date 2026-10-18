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
  const { data: access, error: accessError } = await supabase.rpc("platform_access_context");
  if (accessError) throw accessError;
  const selectedStore = access?.stores?.find(item => item.id === access.storeId);
  return { id: userId, ...(data || {}), store: selectedStore?.name || data?.store || "",
    organization_id: access?.organizationId || null, platformAdmin: access?.platformAdmin === true,
    availableStores: (access?.stores || []).filter(store => store.status === "active") };
}

export async function upsertProfile(userId, payload = {}) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        first_name: String(payload.first_name || "").trim(),
        last_name: String(payload.last_name || "").trim(),
        store: String(payload.store || "").trim(),
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