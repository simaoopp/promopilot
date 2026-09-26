import { hasSupabaseAdminConfig, supabaseAdminClient } from "../../lib/supabaseClients.js";

const TABLE = "campaign_end_notifications";
const DEFAULT_STORE = "Loja da Praia";

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).toLowerCase().trim());
}

function readNumber(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function splitEmails(value = "") {
  return [...new Set(
    String(value || "")
      .split(/[;,\n]+/)
      .map(normalizeEmail)
      .filter(Boolean),
  )];
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDatePt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Atlantic/Azores",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  let normalized = raw.replace(/[^0-9,.-]/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return raw;

  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(parsed);
}

function getItemCode(item = {}) {
  return String(item.codigo || item.artigo || item.code || "").trim();
}

function getItemDescription(item = {}) {
  return String(item.descricao || item.description || item.titulo_oficial || "").trim();
}

function getItemCurrentPrice(item = {}) {
  return item.atual ?? item.pvp2Atual ?? item.pvp2 ?? item.preco ?? "";
}

function getConfig() {
  const publicUrl = String(
    process.env.APP_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      "https://www.promopilot.pt",
  )
    .trim()
    .replace(/\/+$/, "");

  return {
    enabled: readBoolean("CAMPAIGN_END_WORKER_ENABLED", false),
    sendEnabled: readBoolean("CAMPAIGN_END_SEND_ENABLED", false),
    intervalMs: readNumber("CAMPAIGN_END_WORKER_INTERVAL_MS", 5 * 60 * 1000, {
      min: 60_000,
      max: 24 * 60 * 60 * 1000,
    }),
    batchSize: readNumber("CAMPAIGN_END_WORKER_BATCH_SIZE", 25, { min: 1, max: 100 }),
    maxAttempts: readNumber("CAMPAIGN_END_MAX_ATTEMPTS", 5, { min: 1, max: 20 }),
    storeName: String(process.env.CAMPAIGN_END_STORE_NAME || DEFAULT_STORE).trim() || DEFAULT_STORE,
    publicUrl,
    logoUrl: String(process.env.PROMOPILOT_LOGO_URL || "").trim(),
    resend: {
      apiKey: String(process.env.RESEND_API_KEY || process.env.CAMPAIGN_EMAIL_API_KEY || "").trim(),
      from: String(
        process.env.CAMPAIGN_END_EMAIL_FROM ||
          process.env.CAMPAIGN_EMAIL_FROM_ADDRESS ||
          process.env.CAMPAIGN_SMTP_FROM ||
          "",
      ).trim(),
      replyTo: String(process.env.CAMPAIGN_EMAIL_REPLY_TO || "").trim(),
      baseUrl: String(process.env.RESEND_API_BASE_URL || "https://api.resend.com").replace(/\/+$/, ""),
      timeoutMs: readNumber("CAMPAIGN_END_EMAIL_TIMEOUT_MS", 30_000, { min: 5_000, max: 120_000 }),
    },
    recipientOverride: splitEmails(process.env.CAMPAIGN_END_RECIPIENT_OVERRIDE || ""),
  };
}

function assertAdminClient() {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error("Supabase service role não configurado para o worker de fim de campanha.");
  }
}

async function listAllAuthUsers() {
  const users = [];
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const current = Array.isArray(data?.users) ? data.users : [];
    users.push(...current);

    if (current.length < perPage) break;
  }

  return users;
}

async function resolveOrganizationUserIds(organizationId) {
  if (!organizationId) return null;

  const { data, error } = await supabaseAdminClient
    .from("organization_members")
    .select("user_id,status")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (error) throw error;

  return new Set((Array.isArray(data) ? data : []).map((row) => row.user_id).filter(Boolean));
}

export async function resolvePraiaEmployeeRecipients(event = {}, options = {}) {
  assertAdminClient();
  const config = options.config || getConfig();

  if (config.recipientOverride.length) {
    return config.recipientOverride.map((email) => ({
      id: null,
      email,
      firstName: "",
      lastName: "",
      store: config.storeName,
      role: "override",
    }));
  }

  const orgUserIds = await resolveOrganizationUserIds(event.organization_id || null);

  let profilesQuery = supabaseAdminClient
    .from("profiles")
    .select("id,first_name,last_name,store,role");

  if (orgUserIds && orgUserIds.size === 0) return [];
  if (orgUserIds && orgUserIds.size > 0) {
    profilesQuery = profilesQuery.in("id", [...orgUserIds]);
  }

  const { data: profiles, error: profilesError } = await profilesQuery;
  if (profilesError) throw profilesError;

  const targetStore = normalizeText(config.storeName);
  const praiaProfiles = (Array.isArray(profiles) ? profiles : []).filter((profile) => {
    const store = normalizeText(profile?.store);
    return store === targetStore || store === "praia" || store === "loja da praia";
  });

  if (!praiaProfiles.length) return [];

  const profileById = new Map(praiaProfiles.map((profile) => [profile.id, profile]));
  const authUsers = await listAllAuthUsers();

  return authUsers
    .filter((user) => profileById.has(user.id))
    .filter((user) => normalizeEmail(user.email))
    .filter((user) => Boolean(user.email_confirmed_at || user.confirmed_at))
    .map((user) => {
      const profile = profileById.get(user.id) || {};
      return {
        id: user.id,
        email: normalizeEmail(user.email),
        firstName: String(profile.first_name || "").trim(),
        lastName: String(profile.last_name || "").trim(),
        store: String(profile.store || config.storeName).trim(),
        role: String(profile.role || "user").trim(),
      };
    });
}

function buildCampaignUrl(event, config) {
  return `${config.publicUrl}/Homepage?campaignEnd=${encodeURIComponent(event.id)}`;
}

function buildItemsPreview(items = [], limit = 12) {
  return (Array.isArray(items) ? items : []).filter(Boolean).slice(0, limit);
}

function buildEmailText({ event, recipient, config }) {
  const items = Array.isArray(event.items) ? event.items : [];
  const preview = buildItemsPreview(items);
  const greeting = recipient.firstName ? `Olá ${recipient.firstName},` : "Olá,";
  const lines = [
    greeting,
    "",
    `A campanha “${event.title || "Campanha"}” terminou em ${formatDatePt(event.campaign_end_at)}.`,
    `${event.total_items || items.length} artigo(s) fizeram parte desta campanha na Loja da Praia.`,
    "",
    ...preview.map((item) => {
      const code = getItemCode(item) || "—";
      const description = getItemDescription(item) || "Artigo";
      const price = formatPrice(getItemCurrentPrice(item));
      return `• ${code} — ${description}${price ? ` — ${price}` : ""}`;
    }),
  ];

  if (items.length > preview.length) {
    lines.push(`• +${items.length - preview.length} artigo(s) no detalhe da campanha`);
  }

  lines.push(
    "",
    "Consulta todos os artigos e os detalhes da campanha no PromoPilot:",
    buildCampaignUrl(event, config),
    "",
    "PromoPilot",
    "Operação de Loja · Campanhas",
  );

  return lines.join("\n");
}

function buildEmailHtml({ event, recipient, config }) {
  const items = Array.isArray(event.items) ? event.items : [];
  const preview = buildItemsPreview(items);
  const campaignUrl = buildCampaignUrl(event, config);
  const greeting = recipient.firstName ? `Olá ${escapeHtml(recipient.firstName)},` : "Olá,";
  const remaining = Math.max(0, items.length - preview.length);
  const logo = config.logoUrl
    ? `<img src="${escapeHtml(config.logoUrl)}" width="190" alt="PromoPilot" style="display:block;max-width:190px;height:auto;border:0;" />`
    : `<div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#17211c;">PromoPilot</div>`;

  const rows = preview
    .map((item) => {
      const code = getItemCode(item) || "—";
      const description = getItemDescription(item) || "Artigo";
      const price = formatPrice(getItemCurrentPrice(item));

      return `
        <tr>
          <td style="padding:13px 0;border-bottom:1px solid #edf0ee;vertical-align:top;">
            <div style="font-size:12px;font-weight:700;color:#147bd1;margin-bottom:4px;">${escapeHtml(code)}</div>
            <div style="font-size:14px;font-weight:700;color:#17211c;line-height:1.4;">${escapeHtml(description)}</div>
          </td>
          <td style="padding:13px 0 13px 16px;border-bottom:1px solid #edf0ee;text-align:right;vertical-align:top;white-space:nowrap;font-size:13px;font-weight:700;color:#44534b;">
            ${price ? escapeHtml(price) : ""}
          </td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#17211c;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7f5;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 16px 45px rgba(20,34,27,.08);">
            <tr>
              <td style="padding:28px 32px 22px;border-bottom:1px solid #edf0ee;">${logo}</td>
            </tr>
            <tr>
              <td style="padding:30px 32px 8px;">
                <div style="display:inline-block;padding:7px 10px;border-radius:999px;background:#eef6fc;color:#147bd1;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Campanha concluída</div>
                <h1 style="margin:16px 0 10px;font-size:28px;line-height:1.2;letter-spacing:-.025em;color:#17211c;">${escapeHtml(event.title || "Campanha")}</h1>
                <p style="margin:0;color:#66736d;font-size:14px;line-height:1.6;">${greeting} a campanha terminou em <strong style="color:#17211c;">${escapeHtml(formatDatePt(event.campaign_end_at))}</strong>. É o momento de confirmar a retirada de comunicação e preços promocionais em loja.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="width:50%;padding:16px;border-radius:14px 0 0 14px;background:#f7f9f8;border:1px solid #edf0ee;">
                      <div style="font-size:11px;color:#8a9690;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Artigos</div>
                      <div style="margin-top:5px;font-size:22px;font-weight:800;color:#17211c;">${Number(event.total_items || items.length || 0)}</div>
                    </td>
                    <td style="width:50%;padding:16px;border-radius:0 14px 14px 0;background:#f7f9f8;border:1px solid #edf0ee;border-left:0;">
                      <div style="font-size:11px;color:#8a9690;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Loja</div>
                      <div style="margin-top:5px;font-size:16px;font-weight:800;color:#17211c;">${escapeHtml(event.store || config.storeName)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <h2 style="margin:0 0 8px;font-size:16px;color:#17211c;">Artigos da campanha</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows}</table>
                ${remaining ? `<p style="margin:14px 0 0;font-size:12px;color:#8a9690;">+ ${remaining} artigo${remaining === 1 ? "" : "s"} disponível${remaining === 1 ? "" : "eis"} no detalhe da campanha.</p>` : ""}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:26px 32px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:12px;background:#147bd1;">
                      <a href="${escapeHtml(campaignUrl)}" style="display:inline-block;padding:15px 28px;border-radius:12px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">Abrir campanha no PromoPilot</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0;font-size:11px;line-height:1.5;color:#9aa49f;">A ligação abre informação operacional da campanha. É necessária autenticação no PromoPilot.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#fafbfa;border-top:1px solid #edf0ee;">
                <p style="margin:0;font-size:11px;line-height:1.6;color:#8a9690;">Mensagem automática destinada exclusivamente aos colaboradores da Loja da Praia.</p>
                <p style="margin:4px 0 0;font-size:11px;color:#a0aaa5;">PromoPilot · Gestão operacional de campanhas</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendResendEmail({ event, recipient, config }) {
  if (!config.resend.apiKey || !config.resend.from) {
    throw new Error(
      "Resend não configurado para notificações de fim de campanha. Define RESEND_API_KEY e CAMPAIGN_END_EMAIL_FROM (ou CAMPAIGN_EMAIL_FROM_ADDRESS).",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.resend.timeoutMs);

  const payload = {
    from: config.resend.from,
    to: [recipient.email],
    subject: `Campanha concluída · ${event.title || "Campanha"}`,
    text: buildEmailText({ event, recipient, config }),
    html: buildEmailHtml({ event, recipient, config }),
  };

  if (config.resend.replyTo) payload.reply_to = config.resend.replyTo;

  try {
    const response = await fetch(`${config.resend.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const bodyText = await response.text();
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = { raw: bodyText };
    }

    if (!response.ok) {
      throw new Error(`Resend ${response.status}: ${body?.message || body?.error || bodyText || response.statusText}`);
    }

    return { id: body?.id || body?.data?.id || "", response: body };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timeout Resend após ${config.resend.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function listDueForDryRun(limit) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .select("*")
    .in("status", ["pending", "processing"])
    .lte("campaign_end_at", now)
    .order("campaign_end_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function claimDue(limit) {
  const { data, error } = await supabaseAdminClient.rpc("claim_due_campaign_end_notifications", {
    p_limit: limit,
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function saveDeliveryProgress(eventId, recipientEmails, providerIds) {
  const { error } = await supabaseAdminClient
    .from(TABLE)
    .update({
      recipient_emails: [...new Set(recipientEmails.map(normalizeEmail).filter(Boolean))],
      provider_message_ids: [...new Set(providerIds.filter(Boolean))],
    })
    .eq("id", eventId);

  if (error) throw error;
}

async function markSent(event, recipients, providerIds) {
  const { error } = await supabaseAdminClient
    .from(TABLE)
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      locked_at: null,
      next_attempt_at: null,
      recipient_emails: recipients.map((recipient) => recipient.email),
      provider_message_ids: providerIds.filter(Boolean),
      last_error: "",
    })
    .eq("id", event.id);

  if (error) throw error;
}

async function markFailure(event, error, config) {
  const attempts = Number(event.attempts || 0);
  const terminal = attempts >= config.maxAttempts;
  const delayMinutes = Math.min(12 * 60, Math.max(5, 5 * 2 ** Math.max(0, attempts - 1)));
  const nextAttempt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

  const { error: updateError } = await supabaseAdminClient
    .from(TABLE)
    .update({
      status: terminal ? "failed" : "pending",
      locked_at: null,
      next_attempt_at: terminal ? null : nextAttempt,
      last_error: String(error?.message || error || "Erro desconhecido").slice(0, 4000),
    })
    .eq("id", event.id);

  if (updateError) {
    console.error("[campaign-end] Falha ao registar erro do evento:", updateError);
  }
}

export async function runCampaignEndNotificationWorkerOnce(options = {}) {
  assertAdminClient();
  const config = getConfig();
  const dryRun = Boolean(options.dryRun);
  const send = dryRun ? false : Boolean(options.send ?? config.sendEnabled);
  const limit = Math.max(1, Math.min(Number(options.limit || config.batchSize) || config.batchSize, 100));

  // Um ciclo sem envio funciona como preview e nunca faz claim/alterações.
  const events = dryRun || !send ? await listDueForDryRun(limit) : await claimDue(limit);
  const results = [];

  for (const event of events) {
    try {
      const recipients = await resolvePraiaEmployeeRecipients(event, { config });

      if (!recipients.length) {
        const error = new Error(`Sem destinatários ativos para ${config.storeName}.`);
        if (!dryRun) await markFailure(event, error, config);
        results.push({
          id: event.id,
          title: event.title,
          status: dryRun ? "dry-run-no-recipients" : "retry",
          recipients: [],
          error: error.message,
        });
        continue;
      }

      if (dryRun || !send) {
        results.push({
          id: event.id,
          title: event.title,
          campaignEndAt: event.campaign_end_at,
          totalItems: event.total_items,
          status: dryRun ? "dry-run" : "send-disabled",
          recipients: recipients.map((recipient) => recipient.email),
          campaignUrl: buildCampaignUrl(event, config),
        });
        continue;
      }

      // Guardamos progresso por destinatário. Se a Resend falhar a meio, o retry
      // não volta a enviar a quem já recebeu a mensagem.
      const deliveredEmails = new Set(
        (Array.isArray(event.recipient_emails) ? event.recipient_emails : [])
          .map(normalizeEmail)
          .filter(Boolean),
      );
      const providerIds = [
        ...(Array.isArray(event.provider_message_ids) ? event.provider_message_ids : []),
      ];
      const pendingRecipients = recipients.filter(
        (recipient) => !deliveredEmails.has(normalizeEmail(recipient.email)),
      );

      for (const recipient of pendingRecipients) {
        const result = await sendResendEmail({ event, recipient, config });
        deliveredEmails.add(normalizeEmail(recipient.email));
        if (result?.id) providerIds.push(result.id);

        await saveDeliveryProgress(event.id, [...deliveredEmails], providerIds);
      }

      const deliveredRecipients = recipients.filter((recipient) =>
        deliveredEmails.has(normalizeEmail(recipient.email)),
      );

      await markSent(event, deliveredRecipients, providerIds);

      results.push({
        id: event.id,
        title: event.title,
        status: "sent",
        recipients: deliveredRecipients.map((recipient) => recipient.email),
        providerMessageIds: [...new Set(providerIds.filter(Boolean))],
      });
    } catch (error) {
      if (!dryRun) await markFailure(event, error, config);
      results.push({
        id: event.id,
        title: event.title,
        status: "error",
        error: error?.message || String(error),
      });
    }
  }

  return {
    ok: results.every((item) => !["error"].includes(item.status)),
    dryRun,
    send,
    store: config.storeName,
    scanned: events.length,
    sent: results.filter((item) => item.status === "sent").length,
    results,
  };
}

export const runCampaignEndNotificationWorker = runCampaignEndNotificationWorkerOnce;
export const processCampaignEndNotifications = runCampaignEndNotificationWorkerOnce;

export async function getCampaignEndNotificationById(id) {
  assertAdminClient();
  const safeId = String(id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(safeId)) {
    return null;
  }

  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .select("id,source_type,source_campaign_id,organization_id,store,title,items,total_items,campaign_end_at,status,sent_at,created_at")
    .eq("id", safeId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export function getCampaignEndNotificationConfig() {
  const config = getConfig();
  return {
    enabled: config.enabled,
    sendEnabled: config.sendEnabled,
    intervalMs: config.intervalMs,
    batchSize: config.batchSize,
    storeName: config.storeName,
    publicUrl: config.publicUrl,
    resendConfigured: Boolean(config.resend.apiKey && config.resend.from),
    recipientOverrideEnabled: config.recipientOverride.length > 0,
  };
}
