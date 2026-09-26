import { supabaseAdminClient, hasSupabaseAdminConfig } from "../../lib/supabaseClients.js";
import { automaticCampaignStores, getAutomaticCampaignConfig } from "../automatic-campaigns/config.js";

const NOTIFICATIONS_TABLE = "campaign_end_notifications";
const DELIVERIES_TABLE = "campaign_end_notification_deliveries";
const DEFAULT_STORE = automaticCampaignStores.praia?.store || "Loja da Praia";
const AZORES_TIME_ZONE = "Atlantic/Azores";

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function readNumber(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function requireAdminClient() {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY é obrigatória para o worker de fim de campanha.");
  }
  return supabaseAdminClient;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: AZORES_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: AZORES_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return "—";
  if (/€/.test(raw)) return raw;
  return `${raw} €`;
}

function normalizeItem(item = {}) {
  return {
    code: String(item.codigo || item.artigo || item.code || "").trim() || "—",
    description: String(item.descricao || item.description || "").trim() || "Sem descrição",
    before: item.antes ?? item.pvp2Antes ?? item.pvp2AntesRaw ?? item.pvpAnterior ?? "",
    current: item.atual ?? item.pvp2Atual ?? item.pvp2AtualRaw ?? item.pvpPromo ?? "",
    endDate: String(item.dataFim || "").trim(),
    info: String(item.info || item.informacao || "").trim(),
  };
}

function getPublicUrl() {
  return String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "https://www.promopilot.pt")
    .trim()
    .replace(/\/+$/, "");
}

export function getCampaignEndNotificationConfig() {
  const emailConfig = getAutomaticCampaignConfig();
  const publicUrl = getPublicUrl();

  return {
    enabled: readBoolean("CAMPAIGN_END_WORKER_ENABLED", false),
    runOnStart: readBoolean("CAMPAIGN_END_WORKER_RUN_ON_START", true),
    intervalMs: Math.max(60_000, readNumber("CAMPAIGN_END_WORKER_INTERVAL_MS", 15 * 60 * 1000)),
    batchSize: Math.max(1, Math.min(100, readNumber("CAMPAIGN_END_WORKER_BATCH_SIZE", 20))),
    store: String(process.env.CAMPAIGN_END_STORE_NAME || DEFAULT_STORE).trim() || DEFAULT_STORE,
    publicUrl,
    logoUrl: String(process.env.CAMPAIGN_END_EMAIL_LOGO_URL || `${publicUrl}/promopilot-logo.png`).trim(),
    resendApiKey: process.env.RESEND_API_KEY || emailConfig?.emailApi?.apiKey || "",
    resendBaseUrl: process.env.RESEND_API_BASE_URL || emailConfig?.emailApi?.baseUrl || "https://api.resend.com",
    from: process.env.CAMPAIGN_END_EMAIL_FROM_ADDRESS || emailConfig?.emailApi?.from || "",
    replyTo: process.env.CAMPAIGN_END_EMAIL_REPLY_TO || emailConfig?.emailApi?.replyTo || "",
    timeoutMs: Math.max(5_000, readNumber("CAMPAIGN_END_EMAIL_TIMEOUT_MS", 30_000)),
  };
}

async function listAllAuthUsers(client) {
  const users = [];
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const chunk = Array.isArray(data?.users) ? data.users : [];
    users.push(...chunk);
    if (chunk.length < perPage) break;
  }

  return users;
}

export async function listPraiaEmployeeRecipients(store = getCampaignEndNotificationConfig().store) {
  const client = requireAdminClient();

  const { data: profiles, error: profileError } = await client
    .from("profiles")
    .select("id,first_name,last_name,store,role")
    .eq("store", store);

  if (profileError) throw profileError;

  const profileRows = safeArray(profiles);
  if (!profileRows.length) return [];

  const authUsers = await listAllAuthUsers(client);
  const byId = new Map(authUsers.map((user) => [user.id, user]));
  const seen = new Set();

  return profileRows
    .map((profile) => {
      const authUser = byId.get(profile.id);
      const email = normalizeEmail(authUser?.email);
      if (!email || seen.has(email)) return null;
      seen.add(email);

      return {
        userId: profile.id,
        email,
        firstName: String(profile.first_name || "").trim(),
        lastName: String(profile.last_name || "").trim(),
        role: String(profile.role || "user").trim(),
        store: String(profile.store || "").trim(),
      };
    })
    .filter(Boolean);
}

async function readDueNotificationsDryRun({ store, limit }) {
  const client = requireAdminClient();
  const { data, error } = await client
    .from(NOTIFICATIONS_TABLE)
    .select("*")
    .eq("store", store)
    .is("notification_sent_at", null)
    .lte("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return safeArray(data);
}

async function claimDueNotifications({ store, limit }) {
  const client = requireAdminClient();
  const { data, error } = await client.rpc("claim_campaign_end_notifications", {
    p_store: store,
    p_limit: limit,
  });

  if (error) throw error;
  return safeArray(data);
}

async function ensureDeliveries(notification, recipients) {
  const client = requireAdminClient();
  if (!recipients.length) return [];

  const rows = recipients.map((recipient) => ({
    notification_id: notification.id,
    user_id: recipient.userId,
    email: recipient.email,
    first_name: recipient.firstName || "",
    status: "pending",
    updated_at: new Date().toISOString(),
  }));

  const { error: insertError } = await client
    .from(DELIVERIES_TABLE)
    .upsert(rows, {
      onConflict: "notification_id,user_id",
      ignoreDuplicates: true,
    });

  if (insertError) throw insertError;

  const { data, error } = await client
    .from(DELIVERIES_TABLE)
    .select("*")
    .eq("notification_id", notification.id)
    .order("email", { ascending: true });

  if (error) throw error;
  return safeArray(data);
}

function buildArticleRowsHtml(items) {
  const preview = items.slice(0, 20).map(normalizeItem);

  return preview
    .map((item) => `
      <tr>
        <td style="padding:12px 10px;border-top:1px solid #edf1f4;font-family:Arial,sans-serif;font-size:12px;color:#1f2937;font-weight:700;vertical-align:top;white-space:nowrap;">${escapeHtml(item.code)}</td>
        <td style="padding:12px 10px;border-top:1px solid #edf1f4;font-family:Arial,sans-serif;font-size:12px;color:#475569;vertical-align:top;">${escapeHtml(item.description)}</td>
        <td style="padding:12px 10px;border-top:1px solid #edf1f4;font-family:Arial,sans-serif;font-size:12px;color:#64748b;vertical-align:top;white-space:nowrap;">${escapeHtml(formatPrice(item.before))}</td>
        <td style="padding:12px 10px;border-top:1px solid #edf1f4;font-family:Arial,sans-serif;font-size:12px;color:#0f172a;font-weight:700;vertical-align:top;white-space:nowrap;">${escapeHtml(formatPrice(item.current))}</td>
      </tr>
    `)
    .join("");
}

function buildEmailHtml({ notification, recipient, detailsUrl, logoUrl }) {
  const items = safeArray(notification.dados);
  const total = Number(notification.total_artigos || items.length || 0);
  const previewCount = Math.min(20, items.length);
  const remaining = Math.max(0, total - previewCount);
  const name = recipient.firstName ? `Olá, ${escapeHtml(recipient.firstName)}.` : "Olá.";
  const sourceLabel = notification.source_table === "automatic_campaigns" ? "Campanha automática" : "Campanha manual";

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f3f6f8;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">A campanha ${escapeHtml(notification.titulo)} terminou. Consulta os artigos e os próximos passos.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f8;padding:32px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 16px 50px rgba(15,23,42,.10);">
        <tr>
          <td style="padding:28px 34px 24px;background:#0f2741;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td valign="middle">
                ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" width="150" alt="PromoPilot" style="display:block;max-width:150px;height:auto;border:0;">` : `<div style="font:700 24px Arial,sans-serif;color:#ffffff;">PromoPilot</div>`}
              </td>
              <td align="right" valign="middle"><span style="display:inline-block;padding:7px 11px;border-radius:999px;background:#dff7e8;color:#17633a;font:700 11px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;">Campanha concluída</span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 34px 10px;">
            <p style="margin:0 0 9px;font:600 14px Arial,sans-serif;color:#147bd1;">${name}</p>
            <h1 style="margin:0 0 12px;font:700 28px/1.25 Arial,sans-serif;color:#17212b;">${escapeHtml(notification.titulo || "Campanha")}</h1>
            <p style="margin:0;font:400 15px/1.65 Arial,sans-serif;color:#5d6b75;">Esta campanha chegou ao fim. O PromoPilot reuniu abaixo a informação essencial para a equipa da <strong>${escapeHtml(notification.store)}</strong>.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 34px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td width="33%" style="padding:14px;background:#f7f9fb;border-radius:12px 0 0 12px;"><div style="font:700 18px Arial,sans-serif;color:#17212b;">${total}</div><div style="margin-top:3px;font:400 11px Arial,sans-serif;color:#77838c;">artigos</div></td>
              <td width="33%" style="padding:14px;background:#f7f9fb;border-left:1px solid #e8edf1;"><div style="font:700 14px Arial,sans-serif;color:#17212b;">${escapeHtml(formatShortDate(notification.ends_at))}</div><div style="margin-top:3px;font:400 11px Arial,sans-serif;color:#77838c;">fim da campanha</div></td>
              <td width="34%" style="padding:14px;background:#f7f9fb;border-left:1px solid #e8edf1;border-radius:0 12px 12px 0;"><div style="font:700 13px Arial,sans-serif;color:#17212b;">${escapeHtml(sourceLabel)}</div><div style="margin-top:3px;font:400 11px Arial,sans-serif;color:#77838c;">origem</div></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:4px 34px 8px;">
            <div style="padding:16px 18px;border-radius:14px;background:#fff8f1;border:1px solid #ffe2c5;">
              <div style="font:700 12px Arial,sans-serif;color:#9a4d08;text-transform:uppercase;letter-spacing:.05em;">Próximo passo em loja</div>
              <div style="margin-top:6px;font:400 13px/1.55 Arial,sans-serif;color:#6b5848;">Revê a comunicação promocional, os preços e as etiquetas destes artigos. O detalhe integral permanece disponível no PromoPilot.</div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 34px 6px;">
            <h2 style="margin:0 0 12px;font:700 16px Arial,sans-serif;color:#17212b;">Artigos da campanha</h2>
            <div style="border:1px solid #e7ecf0;border-radius:14px;overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <thead><tr style="background:#f7f9fb;">
                  <th align="left" style="padding:10px;font:700 10px Arial,sans-serif;color:#718096;text-transform:uppercase;">Código</th>
                  <th align="left" style="padding:10px;font:700 10px Arial,sans-serif;color:#718096;text-transform:uppercase;">Artigo</th>
                  <th align="left" style="padding:10px;font:700 10px Arial,sans-serif;color:#718096;text-transform:uppercase;">Antes</th>
                  <th align="left" style="padding:10px;font:700 10px Arial,sans-serif;color:#718096;text-transform:uppercase;">Campanha</th>
                </tr></thead>
                <tbody>${buildArticleRowsHtml(items)}</tbody>
              </table>
            </div>
            ${remaining > 0 ? `<p style="margin:10px 0 0;font:400 12px Arial,sans-serif;color:#7b8790;">+ ${remaining} artigo${remaining === 1 ? "" : "s"} disponível${remaining === 1 ? "" : "eis"} no detalhe da campanha.</p>` : ""}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:26px 34px 34px;">
            <a href="${escapeHtml(detailsUrl)}" style="display:inline-block;padding:14px 26px;border-radius:12px;background:#147bd1;color:#ffffff;text-decoration:none;font:700 14px Arial,sans-serif;">Ver campanha no PromoPilot</a>
            <p style="margin:16px 0 0;font:400 11px/1.5 Arial,sans-serif;color:#98a2aa;">Acesso reservado à equipa autorizada. Enviado automaticamente pelo PromoPilot.</p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font:400 11px Arial,sans-serif;color:#9aa4ac;">PromoPilot · Campaign Operations · ${escapeHtml(notification.store)}</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailText({ notification, recipient, detailsUrl }) {
  const items = safeArray(notification.dados).slice(0, 20).map(normalizeItem);
  const lines = items.map((item) => `• ${item.code} — ${item.description} — ${formatPrice(item.current)}`);
  const remaining = Math.max(0, Number(notification.total_artigos || notification.dados?.length || 0) - items.length);

  return [
    recipient.firstName ? `Olá, ${recipient.firstName}.` : "Olá.",
    "",
    `A campanha \"${notification.titulo || "Campanha"}\" terminou em ${formatDate(notification.ends_at)}.`,
    `Loja: ${notification.store}`,
    `Total de artigos: ${notification.total_artigos || safeArray(notification.dados).length}`,
    "",
    "ARTIGOS",
    ...lines,
    remaining > 0 ? `+ ${remaining} artigos no PromoPilot.` : "",
    "",
    "Próximo passo: revê a comunicação promocional, os preços e as etiquetas em loja.",
    "",
    `Ver campanha: ${detailsUrl}`,
    "",
    "PromoPilot · Campaign Operations",
  ].filter(Boolean).join("\n");
}

async function sendViaResend({ notification, delivery, config }) {
  if (!config.resendApiKey || !config.from) {
    throw new Error("Email de fim de campanha não configurado. Define RESEND_API_KEY e CAMPAIGN_EMAIL_FROM_ADDRESS (ou CAMPAIGN_END_EMAIL_FROM_ADDRESS).");
  }

  const recipient = {
    userId: delivery.user_id,
    email: delivery.email,
    firstName: delivery.first_name || "",
  };

  const detailsUrl = `${config.publicUrl}/Campanhas/terminadas/${encodeURIComponent(notification.id)}`;
  const payload = {
    from: config.from,
    to: [recipient.email],
    subject: `Campanha concluída · ${notification.titulo || "PromoPilot"}`,
    html: buildEmailHtml({ notification, recipient, detailsUrl, logoUrl: config.logoUrl }),
    text: buildEmailText({ notification, recipient, detailsUrl }),
  };

  if (config.replyTo) payload.reply_to = config.replyTo;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${String(config.resendBaseUrl).replace(/\/+$/, "")}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `campaign-end-${notification.id}-${delivery.user_id}`.slice(0, 220),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }

    if (!response.ok) {
      throw new Error(`Resend API falhou (${response.status}): ${body?.message || body?.error || raw || response.statusText}`);
    }

    return { id: body?.id || body?.data?.id || "", body };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Resend timeout após ${config.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function updateNotification(id, patch) {
  const client = requireAdminClient();
  const { error } = await client
    .from(NOTIFICATIONS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function updateDelivery(notificationId, userId, patch) {
  const client = requireAdminClient();
  const { error } = await client
    .from(DELIVERIES_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("notification_id", notificationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function getCampaignEndNotificationById(id) {
  const client = requireAdminClient();
  const { data, error } = await client
    .from(NOTIFICATIONS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function runCampaignEndNotificationWorker({ dryRun = false, limit } = {}) {
  const config = getCampaignEndNotificationConfig();
  const batchSize = Math.max(1, Math.min(Number(limit || config.batchSize), 100));
  const notifications = dryRun
    ? await readDueNotificationsDryRun({ store: config.store, limit: batchSize })
    : await claimDueNotifications({ store: config.store, limit: batchSize });

  const recipients = await listPraiaEmployeeRecipients(config.store);
  const summary = {
    dryRun,
    store: config.store,
    due: notifications.length,
    recipients: recipients.length,
    sentCampaigns: 0,
    sentEmails: 0,
    failedCampaigns: 0,
    waitingRecipients: 0,
    campaigns: [],
  };

  for (const notification of notifications) {
    const itemSummary = {
      id: notification.id,
      title: notification.titulo,
      endsAt: notification.ends_at,
      articles: Number(notification.total_artigos || safeArray(notification.dados).length || 0),
      recipients: recipients.map((recipient) => recipient.email),
      sent: 0,
      failed: 0,
    };

    if (dryRun) {
      summary.campaigns.push(itemSummary);
      continue;
    }

    if (!recipients.length) {
      await updateNotification(notification.id, {
        status: "waiting_recipients",
        recipient_count: 0,
        last_error: `Não foram encontrados funcionários com profile.store = \"${config.store}\" e email Supabase válido.`,
      });
      summary.waitingRecipients += 1;
      summary.campaigns.push(itemSummary);
      continue;
    }

    try {
      const deliveries = await ensureDeliveries(notification, recipients);

      for (const delivery of deliveries) {
        if (delivery.status === "sent" && delivery.sent_at) continue;

        try {
          await updateDelivery(notification.id, delivery.user_id, {
            status: "sending",
            attempt_count: Number(delivery.attempt_count || 0) + 1,
            last_error: null,
          });

          const result = await sendViaResend({ notification, delivery, config });

          await updateDelivery(notification.id, delivery.user_id, {
            status: "sent",
            resend_id: result.id || null,
            sent_at: new Date().toISOString(),
            last_error: null,
          });

          itemSummary.sent += 1;
          summary.sentEmails += 1;
        } catch (error) {
          itemSummary.failed += 1;
          await updateDelivery(notification.id, delivery.user_id, {
            status: "failed",
            last_error: String(error?.message || error).slice(0, 1500),
          });
        }
      }

      const client = requireAdminClient();
      const { data: finalDeliveries, error: deliveryError } = await client
        .from(DELIVERIES_TABLE)
        .select("status,sent_at")
        .eq("notification_id", notification.id);
      if (deliveryError) throw deliveryError;

      const all = safeArray(finalDeliveries);
      const sentCount = all.filter((delivery) => delivery.status === "sent" && delivery.sent_at).length;
      const failedCount = all.length - sentCount;

      if (all.length > 0 && failedCount === 0) {
        await updateNotification(notification.id, {
          status: "sent",
          notification_sent_at: new Date().toISOString(),
          recipient_count: sentCount,
          last_error: null,
        });
        summary.sentCampaigns += 1;
      } else {
        await updateNotification(notification.id, {
          status: "failed",
          recipient_count: sentCount,
          last_error: `${failedCount} envio(s) por concluir. O worker volta a tentar sem duplicar os já enviados.`,
        });
        summary.failedCampaigns += 1;
      }
    } catch (error) {
      summary.failedCampaigns += 1;
      await updateNotification(notification.id, {
        status: "failed",
        last_error: String(error?.message || error).slice(0, 1500),
      });
      itemSummary.error = String(error?.message || error);
    }

    summary.campaigns.push(itemSummary);
  }

  return summary;
}
