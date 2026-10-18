import { useEffect, useState } from "react";
import { ceoRead } from "../../services/platformService";

export function useCeoData(resource, { organizationId = "", query = "", status = "", offset = 0, revision = 0, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    if (!enabled) { setState({ data: null, loading: false, error: "" }); return () => controller.abort(); }
    setState({ data: null, loading: true, error: "" });
    ceoRead(resource, { organizationId, query, status, offset, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: "" }); })
      .catch(error => { if (!controller.signal.aborted) setState({ data: null, loading: false, error: error.message }); });
    return () => controller.abort();
  }, [resource, organizationId, query, status, offset, revision, enabled]);
  return state;
}
