import { supabase } from "../../../lib/supabase";
import {
  getAccessCacheScope,
  tenantHeaders,
} from "../../../services/platformService";
import { normalizeApiBaseUrl } from "../../../shared/apiBaseUrl.mjs";

export function createImportApi(signal) {
  const scope = getAccessCacheScope(),
    headers = tenantHeaders();
  return async (action, body = {}) => {
    if (!scope || scope !== getAccessCacheScope() || signal.aborted)
      throw new Error("O acesso mudou. Reabra o importador.");
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token)
      throw new Error("Inicie sessão para continuar.");
    if (scope !== getAccessCacheScope() || signal.aborted)
      throw new Error("O acesso mudou. Reabra o importador.");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, 25000);
    try {
      const response = await fetch(
        `${normalizeApiBaseUrl(process.env.REACT_APP_API_BASE_URL, window.location.hostname)}/api/campaign-imports/${action}`,
        {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            ...headers,
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (scope !== getAccessCacheScope() || signal.aborted)
        throw new Error("O acesso mudou. Reabra o importador.");
      if (response.status === 404)
        throw new Error("O importador ainda não está publicado na API.");
      const result = await response.json();
      if (scope !== getAccessCacheScope() || signal.aborted)
        throw new Error("O acesso mudou. Reabra o importador.");
      if (!response.ok || !result.ok)
        throw Object.assign(
          new Error(
            result.error?.message || "Não foi possível guardar a importação.",
          ),
          { status: response.status },
        );
      return result.data;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
  };
}
