import { supabaseAdminClient } from "../lib/supabaseClients.js";
import { adminActionRateLimit } from "../middleware/security.js";
import { AppError } from "../middleware/errorHandler.js";
import { parsePageQuery, requireString, requireUuid } from "../middleware/validation.js";
import { writeAuditLog } from "../services/saas/auditLogService.js";

function requireAdminClient() {
  if (!supabaseAdminClient) {
    throw new AppError("SERVICE_UNAVAILABLE", "Operação administrativa indisponível neste ambiente.", { status: 503 });
  }
  return supabaseAdminClient;
}

export function registerSaasAdminRoutes(app, { requireAuth, requireAdmin }) {
  app.get("/api/admin/organizations", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const client = requireAdminClient();
      const { limit, offset } = parsePageQuery(req.query);
      const q = String(req.query.q || "").trim();
      let query = client
        .from("organizations")
        .select("id,name,slug,status,created_at,updated_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (q) {
        query = query.or(`name.ilike.%${q.replace(/[%_,]/g, " ")}%,slug.ilike.%${q.replace(/[%_,]/g, " ")}%`);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      return res.json({ ok: true, items: data || [], total: count || 0, limit, offset });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/admin/organizations", requireAuth, requireAdmin, adminActionRateLimit, async (req, res, next) => {
    try {
      const client = requireAdminClient();
      const name = requireString(req.body?.name, "name", { min: 2, max: 160 });
      const slug = requireString(req.body?.slug, "slug", { min: 2, max: 80 }).toLowerCase();
      const { data, error } = await client
        .from("organizations")
        .insert({ name, slug, status: "active" })
        .select("id,name,slug,status,created_at")
        .single();

      if (error) throw error;
      await writeAuditLog({ req, organizationId: data.id, action: "organization.created", entityType: "organization", entityId: data.id, after: data });
      return res.status(201).json({ ok: true, item: data });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/admin/audit-logs", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const client = requireAdminClient();
      const { limit, offset } = parsePageQuery(req.query);
      let query = client
        .from("audit_logs")
        .select("id,organization_id,user_id,action,entity_type,entity_id,request_id,created_at,metadata", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (req.query.organizationId) {
        query = query.eq("organization_id", requireUuid(req.query.organizationId, "organizationId"));
      }

      const { data, count, error } = await query;
      if (error) throw error;
      return res.json({ ok: true, items: data || [], total: count || 0, limit, offset });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/admin/jobs", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const client = requireAdminClient();
      const { limit, offset } = parsePageQuery(req.query);
      const { data, count, error } = await client
        .from("app_jobs")
        .select("id,organization_id,type,status,attempts,max_attempts,locked_at,last_error,created_at,updated_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return res.json({ ok: true, items: data || [], total: count || 0, limit, offset });
    } catch (error) {
      return next(error);
    }
  });
}
