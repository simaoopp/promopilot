import { supabaseAdminClient, supabaseAuthClient } from "../lib/supabaseClients.js";
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


function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value = "") {
  const role = String(value || "").trim().toLowerCase();
  return ["user", "manager", "admin"].includes(role) ? role : "user";
}

function membershipRole(profileRole = "") {
  if (profileRole === "admin") return "admin";
  if (profileRole === "manager") return "manager";
  return "store_user";
}

function publicAppUrl() {
  return String(
    process.env.APP_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      "https://www.promopilot.pt",
  )
    .trim()
    .replace(/\/+$/, "");
}

async function resolveOrganizationId(req, client) {
  if (req.organizationId) return req.organizationId;

  const fromProfile = String(
    req.authProfile?.default_organization_id ||
      req.auth?.profile?.default_organization_id ||
      "",
  ).trim();

  if (fromProfile) return fromProfile;

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", req.authUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (membership?.organization_id) return membership.organization_id;

  const envOrganizationId = String(
    process.env.DEFAULT_ORGANIZATION_ID ||
      process.env.CAMPAIGN_DEFAULT_ORGANIZATION_ID ||
      "",
  ).trim();

  return envOrganizationId || null;
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

  app.post(
    "/api/admin/users/invite",
    requireAuth,
    requireAdmin,
    adminActionRateLimit,
    async (req, res, next) => {
      try {
        const client = requireAdminClient();
        const organizationId = await resolveOrganizationId(req, client);

        if (!organizationId) {
          throw new AppError(
            "TENANT_REQUIRED",
            "Não foi possível determinar a organização para o novo utilizador.",
            { status: 400 },
          );
        }

        const email = normalizeEmail(req.body?.email);
        const firstName = requireString(req.body?.firstName, "firstName", {
          min: 1,
          max: 80,
        });
        const lastName = requireString(req.body?.lastName, "lastName", {
          min: 1,
          max: 80,
        });
        const store = requireString(req.body?.store, "store", {
          min: 1,
          max: 120,
        });
        const role = normalizeRole(req.body?.role);

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Indica um email válido.",
            { status: 400 },
          );
        }

        const redirectTo = `${publicAppUrl()}/login?invite=1`;

        const { data: inviteData, error: inviteError } =
          await client.auth.admin.inviteUserByEmail(email, {
            redirectTo,
            data: {
              first_name: firstName,
              last_name: lastName,
              store,
              role,
              invited_from: "promopilot",
            },
          });

        if (inviteError) {
          const message = String(inviteError.message || "");

          if (/already|registered|exists/i.test(message)) {
            throw new AppError(
              "USER_EXISTS",
              "Já existe um utilizador Supabase com este email.",
              { status: 409 },
            );
          }

          throw inviteError;
        }

        const invitedUser = inviteData?.user;

        if (!invitedUser?.id) {
          throw new AppError(
            "INVITE_FAILED",
            "O Supabase não devolveu o utilizador convidado.",
            { status: 502 },
          );
        }

        try {
          const { error: profileError } = await client
            .from("profiles")
            .upsert(
              {
                id: invitedUser.id,
                first_name: firstName,
                last_name: lastName,
                store,
                must_change_password: true,
                role,
                default_organization_id: organizationId,
              },
              { onConflict: "id" },
            );

          if (profileError) throw profileError;

          const { error: membershipError } = await client
            .from("organization_members")
            .upsert(
              {
                organization_id: organizationId,
                user_id: invitedUser.id,
                role: membershipRole(role),
                status: "active",
              },
              { onConflict: "organization_id,user_id" },
            );

          if (membershipError) throw membershipError;
        } catch (setupError) {
          // Evita deixar um utilizador Auth órfão se a configuração do perfil falhar.
          try {
            await client.auth.admin.deleteUser(invitedUser.id);
          } catch (rollbackError) {
            console.warn(
              "[admin-users] Falha ao reverter utilizador convidado:",
              rollbackError?.message || rollbackError,
            );
          }

          throw setupError;
        }

        await writeAuditLog({
          req,
          organizationId,
          action: "user.invited",
          entityType: "user",
          entityId: invitedUser.id,
          after: {
            email,
            first_name: firstName,
            last_name: lastName,
            store,
            role,
          },
        });

        return res.status(201).json({
          ok: true,
          item: {
            id: invitedUser.id,
            email,
            firstName,
            lastName,
            store,
            role,
          },
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post(
    "/api/admin/users/password-reset",
    requireAuth,
    requireAdmin,
    adminActionRateLimit,
    async (req, res, next) => {
      try {
        if (!supabaseAuthClient) {
          throw new AppError(
            "SERVICE_UNAVAILABLE",
            "Supabase Auth indisponível neste ambiente.",
            { status: 503 },
          );
        }

        const email = normalizeEmail(req.body?.email);

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Indica um email válido.",
            { status: 400 },
          );
        }

        const redirectTo = `${publicAppUrl()}/login?reset=1`;
        const { error } = await supabaseAuthClient.auth.resetPasswordForEmail(
          email,
          { redirectTo },
        );

        if (error) throw error;

        await writeAuditLog({
          req,
          organizationId: req.organizationId || null,
          action: "user.password_reset_requested",
          entityType: "user",
          entityId: null,
          metadata: { email },
        });

        return res.json({
          ok: true,
          message:
            "Se o email existir no Supabase, foi enviado um link para definir uma nova palavra-passe.",
        });
      } catch (error) {
        return next(error);
      }
    },
  );

}
