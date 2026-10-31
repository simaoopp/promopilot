// Replaces only the authenticated HTTP transport in the local browser harness.
// Requests use the real SQL importer on an ephemeral database seeded below.
export function createImportApi(signal) {
  return async (action, body = {}) => {
    const response = await fetch("/fixture-api", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data: body }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  };
}
