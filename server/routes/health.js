export function registerHealthRoutes(app, { aiEnabled = false } = {}) {
  app.get(["/api/ping", "/ping"], (_req, res) => {
    return res.json({
      ok: true,
      service: "etiquetas-api",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/health", (_req, res) => {
    // Public liveness must not count all tenants' products with service_role.
    // Database readiness belongs in authenticated monitoring, not this endpoint.
    return res.set("Cache-Control", "no-store").json({
      ok: true, service: "etiquetas-api", kind: "liveness", aiEnabled,
      timestamp: new Date().toISOString(),
    });
  });
}
