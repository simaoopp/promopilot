import { supabaseAdminClient, hasSupabaseAdminConfig } from "../../lib/supabaseClients.js";

const NOTIFICATION_TABLE = "campaign_end_notifications";
const DELIVERY_TABLE = "campaign_end_notification_deliveries";
const DEFAULT_APP_URL = "https://www.promopilot.pt";
const DEFAULT_TIME_ZONE = "Atlantic/Azores";
const MAX_EMAIL_ITEMS = 40;

function clean(value = "") {
  return String(value ?? "").trim();
}

function escapeHtml(value = "") {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUrl(value = "") {
  return clean(value).replace(/\/+$/, "");
}

function requireAdminClient() {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error("Supabase service role não configurado para o worker de fim de campanha.");
  }
  return supabaseAdminClient;
}

function localDateIso(timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function formatDatePt(value = "") {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw || "—";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return clean(value) || "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(numeric);
}

function articleCode(item = {}) {
  return clean(item.codigo || item.artigo || item.codigoArtigo || item.sku || "");
}

function articleDescription(item = {}) {
  return clean(item.descricao || item.description || item.titulo || "");
}

function articlePromoPrice(item = {}) {
  return (
    item.atual ??
    item.pvp2Atual ??
    item.pvp2_atual ??
    item.pvp2 ??
    item.precoComDescontoSelecionado ??
    ""
  );
}

function articlePreviousPrice(item = {}) {
  return (
    item.antes ??
    item.pvp2Antes ??
    item.pvp2_antes ??
    item.pv3 ??
    item.pvp3 ??
    item.precoSemDescontoSelecionado ??
    ""
  );
}

function articleValidity(item = {}, campaignYear = "") {
  const start = clean(item.dataInicio || item.data_inicio || "");
  const end = clean(item.dataFim || item.data_fim || "");
  if (!start && !end) return "—";

  const addYear = (value) => {
    if (!value || /\d{4}/.test(value)) return value;
    return campaignYear ? `${value}/${campaignYear}` : value;
  };

  return `${addYear(start) || "—"} → ${addYear(end) || "—"}`;
}

function maskEmail(email = "") {
  const [local, domain] = clean(email).split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function buildCampaignUrl(notification) {
  const appUrl = normalizeUrl(
    process.env.CAMPAIGN_END_APP_URL ||
      process.env.APP_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      DEFAULT_APP_URL,
  );
  return `${appUrl}/CampanhaTerminada/${encodeURIComponent(notification.id)}`;
}

function buildLogoHtml() {
  const logoUrl = clean(process.env.PROMOPILOT_EMAIL_LOGO_URL);
  if (logoUrl) {
    return `<img src="${escapeHtml(logoUrl)}" width="190" alt="PromoPilot" style="display:block;width:190px;max-width:70%;height:auto;border:0;margin:0 auto;">`;
  }

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;letter-spacing:-.5px;color:#17211c;">
      Promo<span style="color:#147bd1;">Pilot</span>
    </div>
  `;
}

function buildItemsRows(notification) {
  const items = Array.isArray(notification.items) ? notification.items : [];
  return items.slice(0, MAX_EMAIL_ITEMS).map((item) => {
    const code = articleCode(item) || "—";
    const description = articleDescription(item) || "Sem descrição";
    const previous = articlePreviousPrice(item);
    const promo = articlePromoPrice(item);
    const validity = articleValidity(item, notification.campaign_year);

    return `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #edf0ee;font-size:12px;font-weight:700;color:#17211c;white-space:nowrap;">${escapeHtml(code)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #edf0ee;font-size:12px;line-height:1.45;color:#44534b;">${escapeHtml(description)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #edf0ee;font-size:12px;color:#66736d;white-space:nowrap;">${escapeHtml(formatMoney(previous))}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #edf0ee;font-size:12px;font-weight:700;color:#17211c;white-space:nowrap;">${escapeHtml(formatMoney(promo))}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #edf0ee;font-size:11px;color:#66736d;white-space:nowrap;">${escapeHtml(validity)}</td>
      </tr>
    `;
  }).join("");
}

function buildCampaignEndEmail(notification, recipient) {
  const items = Array.isArray(notification.items) ? notification.items : [];
  const hiddenCount = Math.max(0, items.length - MAX_EMAIL_ITEMS);
  const campaignUrl = buildCampaignUrl(notification);
  const title = clean(notification.title) || "Campanha";
  const endDate = formatDatePt(notification.end_date);
  const recipientName = clean(recipient.displayName).split(/\s+/)[0] || "";
  const greeting = recipientName ? `Olá, ${recipientName}.` : "Olá.";
  const sourceLabel = notification.source_type === "automatic" ? "Automática por email" : "Manual";

  const subject = `Campanha terminada · ${title} · Praia`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#17211c;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7f6;padding:34px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:720px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 55px rgba(15,23,42,.10);">
            <tr>
              <td align="center" style="padding:28px 30px 22px;border-bottom:1px solid #edf0ee;">
                ${buildLogoHtml()}
              </td>
            </tr>

            <tr>
              <td style="padding:32px 34px 12px;">
                <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#eef8f2;color:#27734d;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">
                  Campanha concluída
                </div>

                <h1 style="margin:16px 0 10px;font-size:28px;line-height:1.2;color:#17211c;">${escapeHtml(title)}</h1>

                <p style="margin:0;font-size:15px;line-height:1.65;color:#66736d;">
                  ${escapeHtml(greeting)} A campanha terminou em <strong style="color:#17211c;">${escapeHtml(endDate)}</strong>.
                  Segue o resumo operacional para a equipa da Praia.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 34px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="33.33%" style="padding:14px;background:#f7faf8;border-radius:14px 0 0 14px;">
                      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#8a9690;">Artigos</div>
                      <div style="margin-top:5px;font-size:20px;font-weight:800;color:#17211c;">${Number(notification.total_items || items.length || 0)}</div>
                    </td>
                    <td width="33.33%" style="padding:14px;background:#f7faf8;border-left:1px solid #e8eeea;">
                      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#8a9690;">Loja</div>
                      <div style="margin-top:5px;font-size:14px;font-weight:800;color:#17211c;">${escapeHtml(notification.store || "Praia")}</div>
                    </td>
                    <td width="33.33%" style="padding:14px;background:#f7faf8;border-left:1px solid #e8eeea;border-radius:0 14px 14px 0;">
                      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#8a9690;">Origem</div>
                      <div style="margin-top:5px;font-size:14px;font-weight:800;color:#17211c;">${escapeHtml(sourceLabel)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 34px 8px;">
                <h2 style="margin:0 0 12px;font-size:16px;color:#17211c;">Artigos da campanha</h2>
                <div style="overflow:auto;border:1px solid #edf0ee;border-radius:14px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                    <thead>
                      <tr style="background:#f7faf8;">
                        <th align="left" style="padding:10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8a9690;">Código</th>
                        <th align="left" style="padding:10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8a9690;">Artigo</th>
                        <th align="left" style="padding:10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8a9690;">Antes</th>
                        <th align="left" style="padding:10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8a9690;">Promo</th>
                        <th align="left" style="padding:10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8a9690;">Validade</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${buildItemsRows(notification)}
                    </tbody>
                  </table>
                </div>
                ${hiddenCount > 0 ? `<p style="margin:10px 0 0;font-size:11px;color:#8a9690;">+ ${hiddenCount} artigo(s). Consulta a campanha no PromoPilot para veres a lista completa.</p>` : ""}
              </td>
            </tr>

            <tr>
              <td style="padding:24px 34px 12px;" align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td bgcolor="#147bd1" style="border-radius:12px;">
                      <a href="${escapeHtml(campaignUrl)}" style="display:inline-block;padding:15px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;border-radius:12px;">
                        Abrir campanha no PromoPilot
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 34px 28px;">
                <div style="padding:15px 16px;border-radius:14px;background:#fffaf6;border:1px solid #f2e6da;">
                  <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#a06132;">Próxima ação</div>
                  <p style="margin:6px 0 0;font-size:12px;line-height:1.55;color:#76543b;">
                    Confirma a retirada das etiquetas e materiais promocionais e valida a reposição dos preços em loja, quando aplicável.
                  </p>
                </div>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:20px 30px;background:#fafbfa;border-top:1px solid #edf0ee;">
                <p style="margin:0;font-size:11px;line-height:1.5;color:#9aa49f;">
                  PromoPilot · Operações de campanha · Loja da Praia
                </p>
                <p style="margin:5px 0 0;font-size:10px;line-height:1.5;color:#b0b8b4;">
                  Notificação automática enviada apenas aos utilizadores associados à Loja da Praia.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textRows = items.map((item) => {
    const code = articleCode(item) || "-";
    const desc = articleDescription(item) || "Sem descrição";
    return `- ${code} · ${desc} · Promo: ${formatMoney(articlePromoPrice(item))}`;
  });

  const text = [
    `${greeting}`,
    "",
    `A campanha "${title}" terminou em ${endDate}.`,
    `Loja: ${notification.store || "Praia"}`,
    `Total de artigos: ${notification.total_items || items.length || 0}`,
    "",
    "Artigos:",
    ...textRows,
    "",
    `Mais informações: ${campaignUrl}`,
    "",
    "Próxima ação: confirma a retirada das etiquetas e materiais promocionais e valida a reposição dos preços em loja, quando aplicável.",
    "",
    "PromoPilot",
  ].join("\n");

  return { subject, html, text, campaignUrl };
}

async function getPraiaRecipients() {
  const client = requireAdminClient();

  const { data: profiles, error } = await client
    .from("profiles")
    .select("id,first_name,last_name,store,role")
    .ilike("store", "%praia%")
    .order("first_name", { ascending: true });

  if (error) throw error;

  const safeProfiles = (Array.isArray(profiles) ? profiles : []).filter((profile) =>
    ["user", "manager", "admin", "owner"].includes(clean(profile.role).toLowerCase()),
  );

  const resolved = await Promise.all(
    safeProfiles.map(async (profile) => {
      try {
        const { data, error: authError } = await client.auth.admin.getUserById(profile.id);
        if (authError) throw authError;

        const authUser = data?.user;
        const email = clean(authUser?.email).toLowerCase();
        if (!email || !authUser?.email_confirmed_at) return null;

        const bannedUntil = authUser?.banned_until ? new Date(authUser.banned_until) : null;
        if (bannedUntil && Number.isFinite(bannedUntil.getTime()) && bannedUntil > new Date()) {
          return null;
        }

        return {
          userId: profile.id,
          email,
          displayName: `${clean(profile.first_name)} ${clean(profile.last_name)}`.trim(),
          store: clean(profile.store),
          role: clean(profile.role),
        };
      } catch (authLookupError) {
        console.warn(
          `[campaign-end] Não foi possível resolver email do utilizador ${profile.id}:`,
          authLookupError?.message || authLookupError,
        );
        return null;
      }
    }),
  );

  const unique = new Map();
  for (const recipient of resolved.filter(Boolean)) {
    if (!unique.has(recipient.email)) {
      unique.set(recipient.email, recipient);
    }
  }

  return [...unique.values()];
}

async function sendResendEmail({ to, subject, html, text }) {
  const apiKey = clean(process.env.RESEND_API_KEY || process.env.CAMPAIGN_EMAIL_API_KEY);
  const from = clean(
    process.env.CAMPAIGN_END_EMAIL_FROM ||
      process.env.CAMPAIGN_EMAIL_FROM_ADDRESS ||
      process.env.CAMPAIGN_SMTP_FROM,
  );
  const replyTo = clean(process.env.CAMPAIGN_END_EMAIL_REPLY_TO || process.env.CAMPAIGN_EMAIL_REPLY_TO);

  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada.");
  }

  if (!from) {
    throw new Error("Define CAMPAIGN_END_EMAIL_FROM ou CAMPAIGN_EMAIL_FROM_ADDRESS.");
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(
    5000,
    Number.parseInt(process.env.CAMPAIGN_END_EMAIL_TIMEOUT_MS || "30000", 10) || 30000,
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        html,
        text,
        headers: {
          "X-PromoPilot-Event": "campaign-ended",
        },
      }),
      signal: controller.signal,
    });

    const bodyText = await response.text();
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = { raw: bodyText };
    }

    if (!response.ok) {
      throw new Error(
        `Resend ${response.status}: ${body?.message || body?.error || bodyText || response.statusText}`,
      );
    }

    return {
      provider: "resend",
      id: body?.id || "",
      body,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Resend timeout após ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function listDueNotificationsDryRun(limit = 20) {
  const client = requireAdminClient();
  const today = localDateIso();

  const { data, error } = await client
    .from(NOTIFICATION_TABLE)
    .select("*")
    .is("notified_at", null)
    .lt("end_date", today)
    .lt("attempt_count", 5)
    .order("end_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(Math.min(100, Math.max(1, Number(limit) || 20)));

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function claimDueNotifications(limit = 20) {
  const client = requireAdminClient();
  const { data, error } = await client.rpc("claim_campaign_end_notifications", {
    p_limit: Math.min(100, Math.max(1, Number(limit) || 20)),
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function ensureDelivery(notification, recipient) {
  const client = requireAdminClient();

  const { data, error } = await client
    .from(DELIVERY_TABLE)
    .upsert(
      {
        notification_id: notification.id,
        user_id: recipient.userId,
        email: recipient.email,
        display_name: recipient.displayName,
      },
      { onConflict: "notification_id,email" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function markDeliverySent(deliveryId, providerMessageId = "") {
  const client = requireAdminClient();
  const { error } = await client
    .from(DELIVERY_TABLE)
    .update({
      status: "sent",
      attempt_count: 1,
      provider_message_id: providerMessageId || null,
      last_error: "",
      sent_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);

  if (error) throw error;
}

async function markDeliveryFailed(deliveryId, message = "") {
  const client = requireAdminClient();
  const { error } = await client
    .from(DELIVERY_TABLE)
    .update({
      status: "failed",
      attempt_count: 1,
      last_error: clean(message).slice(0, 2000),
    })
    .eq("id", deliveryId);

  if (error) throw error;
}

async function markNotification(notificationId, patch) {
  const client = requireAdminClient();
  const { error } = await client
    .from(NOTIFICATION_TABLE)
    .update(patch)
    .eq("id", notificationId);

  if (error) throw error;
}

async function sendNotification(notification, recipients) {
  if (!recipients.length) {
    await markNotification(notification.id, {
      status: "failed",
      last_error: "Não existem utilizadores ativos/confirmados associados à Loja da Praia.",
    });
    return {
      id: notification.id,
      sent: 0,
      failed: 0,
      noRecipients: true,
    };
  }

  let sent = 0;
  const failures = [];

  for (const recipient of recipients) {
    const delivery = await ensureDelivery(notification, recipient);

    if (delivery?.status === "sent") {
      sent += 1;
      continue;
    }

    try {
      const message = buildCampaignEndEmail(notification, recipient);
      const result = await sendResendEmail({
        to: recipient.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      await markDeliverySent(delivery.id, result.id);
      sent += 1;

      console.log(
        `[campaign-end] Email enviado event=${notification.id} to=${maskEmail(recipient.email)} resendId=${result.id || "-"}`,
      );
    } catch (error) {
      failures.push({
        email: recipient.email,
        message: error?.message || String(error),
      });

      try {
        await markDeliveryFailed(delivery.id, error?.message || error);
      } catch (deliveryError) {
        console.warn(
          `[campaign-end] Falha ao marcar delivery ${delivery.id}:`,
          deliveryError?.message || deliveryError,
        );
      }
    }
  }

  if (failures.length) {
    const summary = failures
      .map((failure) => `${maskEmail(failure.email)}: ${failure.message}`)
      .join(" | ")
      .slice(0, 4000);

    await markNotification(notification.id, {
      status: "failed",
      last_error: summary,
    });

    return {
      id: notification.id,
      sent,
      failed: failures.length,
      failures,
    };
  }

  await markNotification(notification.id, {
    status: "sent",
    notified_at: new Date().toISOString(),
    last_error: "",
  });

  return {
    id: notification.id,
    sent,
    failed: 0,
  };
}

export async function runCampaignEndNotificationWorker({
  dryRun = false,
  limit = 20,
} = {}) {
  requireAdminClient();

  const recipients = await getPraiaRecipients();
  const notifications = dryRun
    ? await listDueNotificationsDryRun(limit)
    : await claimDueNotifications(limit);

  console.log(
    `[campaign-end] ${dryRun ? "DRY RUN" : "RUN"} due=${notifications.length} praiaRecipients=${recipients.length}`,
  );

  if (recipients.length) {
    console.log(
      `[campaign-end] Destinatários Praia: ${recipients
        .map((recipient) => maskEmail(recipient.email))
        .join(", ")}`,
    );
  }

  if (dryRun) {
    for (const notification of notifications) {
      console.log(
        `[campaign-end] would-send id=${notification.id} title="${notification.title}" end=${notification.end_date} items=${notification.total_items} store="${notification.store}"`,
      );
    }

    return {
      dryRun: true,
      due: notifications.length,
      recipients: recipients.length,
      items: notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        endDate: notification.end_date,
        totalItems: notification.total_items,
        store: notification.store,
      })),
    };
  }

  const results = [];

  for (const notification of notifications) {
    try {
      results.push(await sendNotification(notification, recipients));
    } catch (error) {
      console.error(
        `[campaign-end] Falha event=${notification.id}:`,
        error?.message || error,
      );

      try {
        await markNotification(notification.id, {
          status: "failed",
          last_error: clean(error?.message || error).slice(0, 4000),
        });
      } catch (markError) {
        console.error(
          `[campaign-end] Falha a persistir erro event=${notification.id}:`,
          markError?.message || markError,
        );
      }

      results.push({
        id: notification.id,
        sent: 0,
        failed: 1,
        error: error?.message || String(error),
      });
    }
  }

  return {
    dryRun: false,
    due: notifications.length,
    recipients: recipients.length,
    sentNotifications: results.filter((item) => !item.failed && !item.noRecipients).length,
    failedNotifications: results.filter((item) => item.failed || item.noRecipients).length,
    results,
  };
}

// Compatibility aliases so older worker scripts do not break.
export const runCampaignEndNotificationWorkerOnce = runCampaignEndNotificationWorker;
export const runCampaignEndNotifications = runCampaignEndNotificationWorker;
export const processCampaignEndNotifications = runCampaignEndNotificationWorker;

export default runCampaignEndNotificationWorker;
