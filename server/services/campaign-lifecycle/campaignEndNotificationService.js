import "dotenv/config";
import { createHash } from "node:crypto";
import { supabaseAdminClient, hasSupabaseAdminConfig } from "../../lib/supabaseClients.js";

const TABLE = "campaign_end_notifications";
const DEFAULT_STORE = "Loja da Praia";
const DEFAULT_LIMIT = 25;
const DEFAULT_MAX_ATTEMPTS = 24;
const AZORES_TIME_ZONE = "Atlantic/Azores";

function readNumber(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "sim", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function buildResendIdempotencyKey(notification, recipient) {
  const notificationId = String(notification?.id || "unknown").trim() || "unknown";
  const email = normalizeEmail(recipient?.email);
  const recipientHash = createHash("sha256").update(email).digest("hex").slice(0, 24);
  return `campaign-end/${notificationId}/${recipientHash}`;
}

function describeNetworkError(error) {
  const parts = [];
  const message = error?.message || String(error || "Erro de rede desconhecido");
  if (message) parts.push(message);

  const causeCode = error?.cause?.code || error?.code;
  if (causeCode) parts.push(`code=${causeCode}`);

  const causeMessage = error?.cause?.message;
  if (causeMessage && causeMessage !== message) parts.push(causeMessage);

  return parts.join(" | ");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function assertAdminClient() {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não está configurada para o worker de fim de campanha.");
  }
}

function getConfig() {
  const appUrl = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_APP_URL || "https://www.promopilot.pt")
    .trim()
    .replace(/\/+$/, "");

  return {
    enabled: readBoolean("CAMPAIGN_END_EMAIL_ENABLED", true),
    store: String(process.env.CAMPAIGN_END_STORE_NAME || DEFAULT_STORE).trim() || DEFAULT_STORE,
    limit: Math.min(100, Math.max(1, readNumber("CAMPAIGN_END_WORKER_LIMIT", DEFAULT_LIMIT))),
    maxAttempts: Math.min(100, Math.max(1, readNumber("CAMPAIGN_END_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS))),
    resendApiKey: String(process.env.RESEND_API_KEY || process.env.CAMPAIGN_EMAIL_API_KEY || "").trim(),
    resendBaseUrl: String(process.env.RESEND_API_BASE_URL || "https://api.resend.com").trim().replace(/\/+$/, ""),
    from: String(
      process.env.CAMPAIGN_END_EMAIL_FROM ||
        process.env.CAMPAIGN_EMAIL_FROM_ADDRESS ||
        process.env.CAMPAIGN_SMTP_FROM ||
        "PromoPilot <no-reply@send.promopilot.pt>",
    ).trim(),
    replyTo: String(process.env.CAMPAIGN_END_EMAIL_REPLY_TO || process.env.CAMPAIGN_EMAIL_REPLY_TO || "").trim(),
    appUrl,
    logoUrl: String(process.env.PROMOPILOT_EMAIL_LOGO_URL || `${appUrl}/logo192.png`).trim(),
  };
}

function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: AZORES_TIME_ZONE,
    day: "2-digit",
    month: options.longMonth ? "long" : "2-digit",
    year: "numeric",
    ...(options.withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  let normalized;
  if (typeof value === "number") {
    normalized = value;
  } else {
    const text = String(value).trim().replace(/\s/g, "").replace(/€/g, "");
    normalized = Number.parseFloat(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  }
  if (!Number.isFinite(normalized)) return escapeHtml(value);
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(normalized);
}

function sourceLabel(sourceType) {
  return sourceType === "automatic" ? "Automática por email" : "Campanha normal";
}

function itemCode(item = {}) {
  return String(item.codigo || item.artigo || item.article_code || "").trim();
}

function itemDescription(item = {}) {
  return String(item.descricao || item.description || item.titulo_oficial || "").trim();
}

function itemOldPrice(item = {}) {
  return item.antes ?? item.pvp3 ?? item.old_price ?? "";
}

function itemNewPrice(item = {}) {
  return item.atual ?? item.pvp2 ?? item.new_price ?? "";
}

function itemValidity(item = {}, year = "") {
  const start = String(item.dataInicio || item.data_inicio || "").trim();
  const end = String(item.dataFim || item.data_fim || "").trim();
  if (!start && !end) return "—";
  if (start && end) return `${start}${start.includes("/") && start.split("/").length < 3 && year ? `/${year}` : ""} → ${end}${end.includes("/") && end.split("/").length < 3 && year ? `/${year}` : ""}`;
  if (end) return `Até ${end}${end.includes("/") && end.split("/").length < 3 && year ? `/${year}` : ""}`;
  return `Desde ${start}${start.includes("/") && start.split("/").length < 3 && year ? `/${year}` : ""}`;
}

function buildArticleRows(notification) {
  const items = safeArray(notification.items);
  const visible = items.slice(0, 30);
  const rows = visible.map((item) => `
    <tr>
      <td style="padding:12px 10px;border-top:1px solid #edf1f4;font-size:13px;font-weight:700;color:#17212b;white-space:nowrap;">${escapeHtml(itemCode(item) || "—")}</td>
      <td style="padding:12px 10px;border-top:1px solid #edf1f4;font-size:13px;color:#4d5b66;line-height:1.45;">${escapeHtml(itemDescription(item) || "—")}</td>
      <td style="padding:12px 10px;border-top:1px solid #edf1f4;font-size:13px;color:#66736d;white-space:nowrap;text-align:right;">${formatMoney(itemOldPrice(item))}</td>
      <td style="padding:12px 10px;border-top:1px solid #edf1f4;font-size:13px;font-weight:700;color:#17212b;white-space:nowrap;text-align:right;">${formatMoney(itemNewPrice(item))}</td>
      <td style="padding:12px 10px;border-top:1px solid #edf1f4;font-size:12px;color:#66736d;white-space:nowrap;">${escapeHtml(itemValidity(item, notification.year_validity))}</td>
    </tr>`).join("");

  const remaining = Math.max(0, items.length - visible.length);
  return {
    rows,
    remaining,
  };
}

export function buildCampaignEndEmail(notification, recipient, config = getConfig()) {
  const title = String(notification.title || "Campanha").trim() || "Campanha";
  const total = Number(notification.article_count || safeArray(notification.items).length || 0);
  const detailsUrl = `${config.appUrl}/Homepage?endedCampaign=${encodeURIComponent(notification.id)}`;
  const recipientName = String(recipient?.firstName || "").trim();
  const greeting = recipientName ? `Olá ${escapeHtml(recipientName)},` : "Olá,";
  const { rows, remaining } = buildArticleRows(notification);

  const subject = `Campanha concluída · ${title} · ${total} artigo${total === 1 ? "" : "s"}`;

  const html = `<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f2f5f7;font-family:Arial,Helvetica,sans-serif;color:#17212b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f5f7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:760px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 48px rgba(22,34,45,.09);">
            <tr>
              <td style="padding:28px 34px 22px;border-bottom:1px solid #e9eef2;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle">
                      <img src="${escapeHtml(config.logoUrl)}" alt="PromoPilot" width="52" height="52" style="display:block;border:0;border-radius:13px;" />
                    </td>
                    <td valign="middle" style="padding-left:14px;">
                      <div style="font-size:18px;font-weight:800;color:#17212b;letter-spacing:-.02em;">PromoPilot</div>
                      <div style="font-size:11px;color:#7a8791;letter-spacing:.09em;text-transform:uppercase;margin-top:3px;">Campaign lifecycle</div>
                    </td>
                    <td align="right" valign="middle">
                      <span style="display:inline-block;padding:8px 12px;border-radius:999px;background:#edf8f2;color:#247450;font-size:12px;font-weight:800;">Concluída</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 34px 18px;">
                <div style="font-size:13px;color:#147bd1;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Loja da Praia</div>
                <h1 style="margin:8px 0 12px;font-size:29px;line-height:1.2;letter-spacing:-.03em;color:#17212b;">A campanha terminou</h1>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#56646e;">${greeting} a campanha <strong>${escapeHtml(title)}</strong> chegou ao fim. Segue o resumo operacional para a equipa confirmar a atualização em loja.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 34px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="width:33.33%;padding:0 6px 0 0;">
                      <div style="background:#f7f9fa;border:1px solid #e9eef2;border-radius:14px;padding:16px;">
                        <div style="font-size:11px;color:#87929a;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Fim</div>
                        <div style="margin-top:6px;font-size:14px;font-weight:800;color:#17212b;">${escapeHtml(formatDate(notification.campaign_end_at, { longMonth: true }))}</div>
                      </div>
                    </td>
                    <td style="width:33.33%;padding:0 3px;">
                      <div style="background:#f7f9fa;border:1px solid #e9eef2;border-radius:14px;padding:16px;">
                        <div style="font-size:11px;color:#87929a;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Origem</div>
                        <div style="margin-top:6px;font-size:14px;font-weight:800;color:#17212b;">${escapeHtml(sourceLabel(notification.source_type))}</div>
                      </div>
                    </td>
                    <td style="width:33.33%;padding:0 0 0 6px;">
                      <div style="background:#f7f9fa;border:1px solid #e9eef2;border-radius:14px;padding:16px;">
                        <div style="font-size:11px;color:#87929a;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Artigos</div>
                        <div style="margin-top:6px;font-size:14px;font-weight:800;color:#17212b;">${total}</div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 34px 26px;">
                <div style="background:#fff8f1;border:1px solid #f7dfc8;border-left:4px solid #ec6707;border-radius:14px;padding:15px 17px;">
                  <div style="font-size:12px;font-weight:800;color:#8a4b16;text-transform:uppercase;letter-spacing:.05em;">Ação de loja recomendada</div>
                  <div style="margin-top:5px;font-size:13px;line-height:1.55;color:#76553b;">Confirmar a retirada da comunicação promocional expirada e validar o preço ativo dos artigos antes de atualizar a exposição.</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 34px 12px;">
                <h2 style="margin:0;font-size:17px;color:#17212b;">Artigos da campanha</h2>
                <p style="margin:5px 0 14px;font-size:12px;color:#87929a;">Resumo dos artigos registados quando a campanha foi criada.</p>
                <div style="overflow:hidden;border:1px solid #e7edf1;border-radius:15px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                    <tr style="background:#f7f9fa;">
                      <th align="left" style="padding:11px 10px;font-size:10px;color:#7a8791;text-transform:uppercase;letter-spacing:.05em;">Código</th>
                      <th align="left" style="padding:11px 10px;font-size:10px;color:#7a8791;text-transform:uppercase;letter-spacing:.05em;">Artigo</th>
                      <th align="right" style="padding:11px 10px;font-size:10px;color:#7a8791;text-transform:uppercase;letter-spacing:.05em;">Antes</th>
                      <th align="right" style="padding:11px 10px;font-size:10px;color:#7a8791;text-transform:uppercase;letter-spacing:.05em;">Promo</th>
                      <th align="left" style="padding:11px 10px;font-size:10px;color:#7a8791;text-transform:uppercase;letter-spacing:.05em;">Validade</th>
                    </tr>
                    ${rows || `<tr><td colspan="5" style="padding:18px;font-size:13px;color:#87929a;">Sem artigos disponíveis no snapshot.</td></tr>`}
                  </table>
                </div>
                ${remaining ? `<p style="margin:10px 0 0;font-size:12px;color:#7a8791;">+ ${remaining} artigo${remaining === 1 ? "" : "s"} disponível${remaining === 1 ? "" : "eis"} nos detalhes da campanha.</p>` : ""}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 34px 32px;">
                <a href="${escapeHtml(detailsUrl)}" style="display:inline-block;background:#147bd1;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;padding:15px 24px;border-radius:12px;">Ver campanha no PromoPilot</a>
                <p style="margin:13px 0 0;font-size:11px;color:#98a2a9;">O detalhe fica protegido pelo login do PromoPilot.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 34px;background:#101820;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-size:11px;line-height:1.5;color:#aeb8bf;">Mensagem automática PromoPilot<br/>Enviada apenas à equipa associada à Loja da Praia.</td>
                    <td align="right" style="font-size:11px;color:#74818a;">Fim: ${escapeHtml(formatDate(notification.campaign_end_at, { withTime: true }))}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textItems = safeArray(notification.items)
    .slice(0, 30)
    .map((item) => `${itemCode(item) || "—"} · ${itemDescription(item) || "—"}`)
    .join("\n");

  const text = [
    `PromoPilot — Campanha concluída`,
    "",
    `${recipientName ? `Olá ${recipientName},` : "Olá,"}`,
    `A campanha "${title}" terminou na Loja da Praia.`,
    `Fim: ${formatDate(notification.campaign_end_at, { longMonth: true })}`,
    `Origem: ${sourceLabel(notification.source_type)}`,
    `Artigos: ${total}`,
    "",
    "Ação recomendada: confirmar a retirada da comunicação promocional expirada e validar o preço ativo dos artigos.",
    "",
    textItems,
    "",
    `Mais informações: ${detailsUrl}`,
  ].join("\n");

  return { subject, html, text, detailsUrl };
}

async function listAuthUsersById(ids = []) {
  const wanted = new Set(ids.map(String));
  const usersById = new Map();
  if (!wanted.size) return usersById;

  let page = 1;
  const perPage = 1000;

  while (page <= 100) {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];
    for (const user of users) {
      if (wanted.has(String(user.id))) {
        usersById.set(String(user.id), user);
      }
    }

    if (usersById.size >= wanted.size || users.length < perPage) break;
    page += 1;
  }

  return usersById;
}

async function getPraiaRecipients(notification, config) {
  const { data: profiles, error: profilesError } = await supabaseAdminClient
    .from("profiles")
    .select("id,first_name,last_name,store,default_organization_id")
    .eq("store", config.store);

  if (profilesError) throw profilesError;

  let eligibleProfiles = safeArray(profiles);

  if (notification.organization_id && eligibleProfiles.length) {
    const profileIds = eligibleProfiles.map((profile) => profile.id).filter(Boolean);
    const { data: memberships, error: membershipError } = await supabaseAdminClient
      .from("organization_members")
      .select("user_id,status")
      .eq("organization_id", notification.organization_id)
      .eq("status", "active")
      .in("user_id", profileIds);

    if (membershipError) throw membershipError;
    const allowed = new Set(safeArray(memberships).map((row) => String(row.user_id)));
    eligibleProfiles = eligibleProfiles.filter((profile) => allowed.has(String(profile.id)));
  }

  const usersById = await listAuthUsersById(eligibleProfiles.map((profile) => profile.id));
  const seenEmails = new Set();
  const recipients = [];

  for (const profile of eligibleProfiles) {
    const user = usersById.get(String(profile.id));
    const email = normalizeEmail(user?.email);
    if (!email || seenEmails.has(email)) continue;

    const bannedUntil = user?.banned_until ? new Date(user.banned_until) : null;
    if (bannedUntil && !Number.isNaN(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now()) {
      continue;
    }

    seenEmails.add(email);
    recipients.push({
      userId: profile.id,
      email,
      firstName: String(profile.first_name || "").trim(),
      lastName: String(profile.last_name || "").trim(),
    });
  }

  return recipients;
}

async function sendViaResend({ recipient, notification, config }) {
  if (!config.resendApiKey) {
    throw new Error("RESEND_API_KEY não está configurada.");
  }

  if (!config.from) {
    throw new Error("CAMPAIGN_END_EMAIL_FROM não está configurado.");
  }

  const message = buildCampaignEndEmail(notification, recipient, config);
  const idempotencyKey = buildResendIdempotencyKey(notification, recipient);
  const payload = {
    from: config.from,
    to: [recipient.email],
    subject: message.subject,
    html: message.html,
    text: message.text,
  };

  if (config.replyTo) payload.reply_to = config.replyTo;

  let response;
  try {
    response = await fetch(`${config.resendBaseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const wrapped = new Error(`Resend network error: ${describeNetworkError(error)}`);
    wrapped.cause = error;
    wrapped.idempotencyKey = idempotencyKey;
    throw wrapped;
  }

  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }

  if (!response.ok) {
    const error = new Error(
      `Resend ${response.status}: ${body?.message || body?.error || raw || response.statusText}`,
    );
    error.idempotencyKey = idempotencyKey;
    error.status = response.status;
    throw error;
  }

  return {
    id: body?.id || body?.data?.id || "",
    subject: message.subject,
    idempotencyKey,
  };
}

async function resetStaleSendingRows() {
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { error } = await supabaseAdminClient
    .from(TABLE)
    .update({
      status: "error",
      last_error: "Execução anterior interrompida; notificação recuperada automaticamente.",
    })
    .eq("status", "sending")
    .lt("last_attempt_at", staleBefore);

  if (error) throw error;
}

async function listDueNotifications({ limit, maxAttempts, store }) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .select("*")
    .eq("store", store)
    .in("status", ["pending", "error"])
    .not("campaign_end_at", "is", null)
    .lte("campaign_end_at", now)
    .lt("attempt_count", maxAttempts)
    .order("campaign_end_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return safeArray(data);
}

async function claimNotification(row) {
  const nextAttempt = Number(row.attempt_count || 0) + 1;
  const { data, error } = await supabaseAdminClient
    .from(TABLE)
    .update({
      status: "sending",
      attempt_count: nextAttempt,
      last_attempt_at: new Date().toISOString(),
      last_error: "",
    })
    .eq("id", row.id)
    .in("status", ["pending", "error"])
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function updateNotification(id, patch) {
  const { error } = await supabaseAdminClient.from(TABLE).update(patch).eq("id", id);
  if (error) throw error;
}

async function processNotification(row, { config, dryRun = false }) {
  const recipients = await getPraiaRecipients(row, config);

  if (dryRun) {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      sourceType: row.source_type,
      title: row.title,
      campaignEndAt: row.campaign_end_at,
      articleCount: Number(row.article_count || safeArray(row.items).length || 0),
      recipients: recipients.map((recipient) => recipient.email),
      dryRun: true,
    };
  }

  const claimed = await claimNotification(row);
  if (!claimed) {
    return { id: row.id, skipped: true, reason: "already-claimed" };
  }

  if (!recipients.length) {
    const message = `Nenhum utilizador ativo encontrado com store="${config.store}".`;
    await updateNotification(claimed.id, { status: "error", last_error: message });
    return { id: claimed.id, ok: false, error: message, recipients: [] };
  }

  const delivery = safeObject(claimed.recipient_delivery);
  const failures = [];
  const sentEmails = [];

  for (const recipient of recipients) {
    const previous = safeObject(delivery[recipient.email]);
    if (previous.status === "sent") {
      sentEmails.push(recipient.email);
      continue;
    }

    try {
      const sent = await sendViaResend({ recipient, notification: claimed, config });
      delivery[recipient.email] = {
        status: "sent",
        sentAt: new Date().toISOString(),
        providerId: sent.id || "",
        idempotencyKey: sent.idempotencyKey,
      };
      sentEmails.push(recipient.email);
      await updateNotification(claimed.id, {
        recipient_delivery: delivery,
        recipient_emails: sentEmails,
      });
    } catch (error) {
      const message = error?.message || String(error);
      delivery[recipient.email] = {
        status: "error",
        lastAttemptAt: new Date().toISOString(),
        error: message.slice(0, 1000),
        idempotencyKey:
          error?.idempotencyKey || buildResendIdempotencyKey(claimed, recipient),
      };
      failures.push(`${recipient.email}: ${message}`);
      await updateNotification(claimed.id, { recipient_delivery: delivery });
    }
  }

  if (failures.length) {
    const errorText = failures.join(" | ").slice(0, 4000);
    await updateNotification(claimed.id, {
      status: "error",
      last_error: errorText,
      recipient_emails: sentEmails,
    });

    return {
      id: claimed.id,
      ok: false,
      sent: sentEmails,
      failed: failures,
    };
  }

  await updateNotification(claimed.id, {
    status: "sent",
    sent_at: new Date().toISOString(),
    last_error: "",
    recipient_emails: sentEmails,
    recipient_delivery: delivery,
  });

  return {
    id: claimed.id,
    ok: true,
    sent: sentEmails,
    campaignId: claimed.campaign_id,
    sourceType: claimed.source_type,
  };
}

export async function runCampaignEndNotificationWorker({ dryRun = false, limit } = {}) {
  assertAdminClient();
  const config = getConfig();

  if (!config.enabled && !dryRun) {
    return { ok: true, enabled: false, dryRun: false, due: 0, results: [] };
  }

  if (!dryRun && !config.resendApiKey) {
    throw new Error("RESEND_API_KEY em falta. O worker de fim de campanha usa o Resend para o envio.");
  }

  if (!dryRun) {
    await resetStaleSendingRows();
  }

  const due = await listDueNotifications({
    limit: Math.min(100, Math.max(1, Number(limit) || config.limit)),
    maxAttempts: config.maxAttempts,
    store: config.store,
  });

  const results = [];
  for (const row of due) {
    try {
      results.push(await processNotification(row, { config, dryRun }));
    } catch (error) {
      const message = error?.message || String(error);
      if (!dryRun) {
        await updateNotification(row.id, { status: "error", last_error: message.slice(0, 4000) }).catch(() => {});
      }
      results.push({ id: row.id, ok: false, error: message });
    }
  }

  return {
    ok: results.every((result) => result.ok !== false),
    enabled: config.enabled,
    dryRun,
    store: config.store,
    due: due.length,
    results,
  };
}
