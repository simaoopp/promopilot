import { supabaseAdminClient } from "../../lib/supabaseClients.js";

const EVENT_TABLE = "campaign_end_events_v4";
const DELIVERY_TABLE = "campaign_end_event_deliveries_v4";
const CLAIM_RPC = "claim_campaign_end_events_v4";

const DEFAULT_STORE = "Loja da Praia";
const DEFAULT_TIME_ZONE = "Atlantic/Azores";

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  return !["0", "false", "off", "no"].includes(String(raw).trim().toLowerCase());
}

function intEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(process.env[name] ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function normalizeText(value = "") {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isPraiaCampaignStore(value = "") {
  const normalized = normalizeText(value);
  return normalized === "praia" || normalized === "loja da praia" || normalized.includes("praia");
}

function assertAdminClient() {
  if (!supabaseAdminClient) {
    throw new Error(
      "Supabase service role não configurado. Define SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no worker.",
    );
  }
}

function publicAppUrl() {
  return clean(
    process.env.CAMPAIGN_END_APP_URL ||
      process.env.APP_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      "https://www.promopilot.pt",
  ).replace(/\/+$/, "");
}

function resendConfig() {
  return {
    apiKey: clean(process.env.CAMPAIGN_END_RESEND_API_KEY || process.env.RESEND_API_KEY),
    baseUrl: clean(process.env.RESEND_API_BASE_URL || "https://api.resend.com").replace(/\/+$/, ""),
    from: clean(
      process.env.CAMPAIGN_END_EMAIL_FROM ||
        process.env.CAMPAIGN_EMAIL_FROM_ADDRESS ||
        process.env.CAMPAIGN_SMTP_FROM,
    ),
    replyTo: clean(
      process.env.CAMPAIGN_END_EMAIL_REPLY_TO ||
        process.env.CAMPAIGN_EMAIL_REPLY_TO,
    ),
    logoUrl: clean(
      process.env.CAMPAIGN_END_LOGO_URL ||
        process.env.PROMOPILOT_EMAIL_LOGO_URL ||
        `${publicAppUrl()}/promopilot-email-logo.png`,
    ),
    timeoutMs: intEnv("CAMPAIGN_END_EMAIL_TIMEOUT_MS", 30_000, { min: 5_000, max: 120_000 }),
  };
}

export function getCampaignEndNotificationConfig() {
  const email = resendConfig();
  const emailEnabled = boolEnv("CAMPAIGN_END_EMAIL_ENABLED", false);

  return {
    enabled: emailEnabled,
    emailEnabled,
    workerEnabled: boolEnv("CAMPAIGN_END_WORKER_ENABLED", false),
    runInApi: boolEnv("CAMPAIGN_END_RUN_IN_API", false),
    sendEnabled: emailEnabled && Boolean(email.apiKey && email.from),
    resendConfigured: Boolean(email.apiKey && email.from),
    storeName: clean(
      process.env.CAMPAIGN_END_STORE_NAME ||
        process.env.CAMPAIGN_END_NOTIFICATION_STORE ||
        DEFAULT_STORE,
    ),
    timeZone: clean(process.env.CAMPAIGN_END_TIME_ZONE || DEFAULT_TIME_ZONE),
    batchSize: intEnv("CAMPAIGN_END_WORKER_LIMIT", 25, { min: 1, max: 100 }),
    maxAttempts: intEnv("CAMPAIGN_END_MAX_ATTEMPTS", 24, { min: 1, max: 100 }),
    intervalMs: intEnv("CAMPAIGN_END_WORKER_INTERVAL_MS", 15 * 60 * 1000, {
      min: 60_000,
      max: 24 * 60 * 60 * 1000,
    }),
    articlePreviewLimit: intEnv("CAMPAIGN_END_ARTICLE_PREVIEW_LIMIT", 18, { min: 5, max: 50 }),
    appUrl: publicAppUrl(),
    eventTable: EVENT_TABLE,
    deliveryTable: DELIVERY_TABLE,
  };
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDatePt(isoDate = "") {
  const match = clean(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(isoDate) || "—";
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value);
  }

  const raw = clean(value);
  if (!raw) return "—";
  const compact = raw.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  const normalized = Number(
    compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact,
  );

  if (Number.isFinite(normalized) && /\d/.test(raw)) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(normalized);
  }

  return raw;
}

function itemCode(item = {}) {
  return clean(item.codigo || item.artigo || item.codigoArtigo || item.code || item.sku || "—") || "—";
}

function itemDescription(item = {}) {
  return clean(item.descricao || item.description || item.titulo || "Sem descrição") || "Sem descrição";
}

function itemBeforePrice(item = {}) {
  return normalizePrice(
    item.antes ??
      item.pvp2Antes ??
      item.pvp2_antes ??
      item.pvp3 ??
      item.pv3 ??
      item.precoSemDescontoSelecionado ??
      "",
  );
}

function itemPromoPrice(item = {}) {
  return normalizePrice(
    item.atual ??
      item.pvp2Atual ??
      item.pvp2_atual ??
      item.pvp2 ??
      item.precoComDescontoSelecionado ??
      "",
  );
}

function itemValidity(item = {}, year = "") {
  const start = clean(item.dataInicio || item.data_inicio || item["DATA INICIO"] || item["DATA INÍCIO"]);
  const end = clean(item.dataFim || item.data_fim || item["DATA FIM"]);
  const withYear = (value) => (value && !/\d{4}/.test(value) && year ? `${value}/${year}` : value);
  if (!start && !end) return "—";
  return `${withYear(start) || "—"} → ${withYear(end) || "—"}`;
}

function campaignDetailsUrl(event) {
  return `${publicAppUrl()}/Campanhas/terminadas/${encodeURIComponent(event.id)}`;
}

function buildArticleRows(event) {
  const config = getCampaignEndNotificationConfig();
  const items = Array.isArray(event.items) ? event.items : [];

  return items
    .slice(0, config.articlePreviewLimit)
    .map(
      (item) => `
        <tr>
          <td style="padding:14px 16px;border-top:1px solid #edf1f5;vertical-align:top;">
            <div style="font-size:12px;font-weight:800;color:#147bd1;letter-spacing:.02em;">${escapeHtml(itemCode(item))}</div>
            <div style="margin-top:4px;font-size:13px;line-height:1.45;color:#25313c;">${escapeHtml(itemDescription(item))}</div>
            <div style="margin-top:5px;font-size:11px;line-height:1.4;color:#8a9690;">${escapeHtml(itemValidity(item, event.campaign_year))}</div>
          </td>
          <td style="padding:14px 8px;border-top:1px solid #edf1f5;vertical-align:top;text-align:right;white-space:nowrap;font-size:12px;color:#87929a;">${escapeHtml(itemBeforePrice(item))}</td>
          <td style="padding:14px 16px 14px 8px;border-top:1px solid #edf1f5;vertical-align:top;text-align:right;white-space:nowrap;font-size:13px;font-weight:800;color:#17212b;">${escapeHtml(itemPromoPrice(item))}</td>
        </tr>`,
    )
    .join("");
}

function buildEmail({ event, recipient }) {
  const config = getCampaignEndNotificationConfig();
  const email = resendConfig();
  const items = Array.isArray(event.items) ? event.items : [];
  const hiddenCount = Math.max(0, items.length - config.articlePreviewLimit);
  const firstName = clean(recipient.firstName);
  const greeting = firstName ? `Olá, ${firstName}.` : "Olá.";
  const url = campaignDetailsUrl(event);
  const endDate = formatDatePt(event.end_date);
  const sourceLabel = event.source_type === "automatic" ? "Automática" : "Manual / Excel";

  const logo = email.logoUrl
    ? `<img src="${escapeHtml(email.logoUrl)}" alt="PromoPilot" width="188" style="display:block;width:188px;max-width:75%;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<div style="font-size:23px;font-weight:900;letter-spacing:-.03em;color:#147bd1;">PromoPilot</div>`;

  const html = `<!doctype html>
<html lang="pt"><body style="margin:0;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#17212b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">A campanha ${escapeHtml(event.title)} terminou. Consulta os artigos e fecha a execução em loja.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f8;padding:36px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(23,33,43,.10);">
        <tr><td style="padding:28px 34px;border-bottom:1px solid #edf1f5;">${logo}</td></tr>
        <tr><td style="padding:32px 34px 20px;">
          <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#eaf4ff;color:#147bd1;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">Loja da Praia · Campanha concluída</div>
          <h1 style="margin:17px 0 10px;font-size:29px;line-height:1.18;letter-spacing:-.03em;color:#17212b;">${escapeHtml(event.title)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.68;color:#5d6a73;">${escapeHtml(greeting)} A campanha chegou ao fim. Este resumo operacional ajuda a equipa a retirar a comunicação promocional, validar preços e concluir o fecho em loja.</p>
        </td></tr>
        <tr><td style="padding:6px 34px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="33%" style="padding:15px;border-radius:14px 0 0 14px;background:#f7f9fb;border:1px solid #edf1f5;">
              <div style="font-size:10px;color:#87929a;text-transform:uppercase;font-weight:800;letter-spacing:.06em;">Terminou</div>
              <div style="margin-top:6px;font-size:16px;font-weight:900;color:#17212b;">${escapeHtml(endDate)}</div>
            </td>
            <td width="33%" style="padding:15px;background:#f7f9fb;border-top:1px solid #edf1f5;border-bottom:1px solid #edf1f5;">
              <div style="font-size:10px;color:#87929a;text-transform:uppercase;font-weight:800;letter-spacing:.06em;">Artigos</div>
              <div style="margin-top:6px;font-size:16px;font-weight:900;color:#17212b;">${Number(event.total_items) || items.length}</div>
            </td>
            <td width="34%" style="padding:15px;border-radius:0 14px 14px 0;background:#f7f9fb;border:1px solid #edf1f5;">
              <div style="font-size:10px;color:#87929a;text-transform:uppercase;font-weight:800;letter-spacing:.06em;">Origem</div>
              <div style="margin-top:6px;font-size:16px;font-weight:900;color:#17212b;">${escapeHtml(sourceLabel)}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 34px 10px;">
          <div style="font-size:12px;font-weight:900;color:#17212b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Artigos da campanha</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #edf1f5;border-radius:14px;border-collapse:separate;border-spacing:0;overflow:hidden;">
            <tr>
              <th align="left" style="padding:11px 16px;background:#f7f9fb;font-size:10px;color:#7a8790;text-transform:uppercase;letter-spacing:.06em;">Artigo</th>
              <th align="right" style="padding:11px 8px;background:#f7f9fb;font-size:10px;color:#7a8790;text-transform:uppercase;letter-spacing:.06em;">Antes</th>
              <th align="right" style="padding:11px 16px 11px 8px;background:#f7f9fb;font-size:10px;color:#7a8790;text-transform:uppercase;letter-spacing:.06em;">Campanha</th>
            </tr>
            ${buildArticleRows(event)}
          </table>
          ${hiddenCount > 0 ? `<p style="margin:11px 0 0;font-size:12px;color:#87929a;">+ ${hiddenCount} artigo${hiddenCount === 1 ? "" : "s"} disponível${hiddenCount === 1 ? "" : "eis"} no detalhe da campanha.</p>` : ""}
        </td></tr>
        <tr><td style="padding:24px 34px 8px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td style="border-radius:12px;background:#147bd1;">
            <a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 28px;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">Abrir campanha no PromoPilot</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:20px 34px 28px;">
          <div style="padding:16px 18px;border-radius:14px;background:#f7faf8;border:1px solid #e8efeb;">
            <div style="font-size:11px;font-weight:900;color:#5f6d65;text-transform:uppercase;letter-spacing:.06em;">Checklist pós-campanha</div>
            <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#536159;">1. Retirar etiquetas e comunicação promocional · 2. Confirmar preços atuais · 3. Validar a exposição dos artigos.</div>
          </div>
        </td></tr>
        <tr><td style="padding:20px 34px;background:#fafbfa;border-top:1px solid #edf1f5;">
          <p style="margin:0;font-size:11px;line-height:1.55;color:#9aa49f;">Mensagem operacional automática do PromoPilot. O acesso ao detalhe exige autenticação e permissões da Loja da Praia.</p>
          <p style="margin:7px 0 0;font-size:10px;line-height:1.5;word-break:break-all;color:#a7b0ab;">${escapeHtml(url)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `PromoPilot · Campanha concluída`,
    "",
    greeting,
    `A campanha \"${event.title}\" terminou em ${endDate}.`,
    `Artigos: ${Number(event.total_items) || items.length}`,
    `Origem: ${sourceLabel}`,
    "",
    "Abrir campanha no PromoPilot:",
    url,
    "",
    "Checklist: retirar comunicação promocional, confirmar preços atuais e validar a exposição dos artigos.",
  ].join("\n");

  return {
    subject: `Campanha concluída · ${event.title}`,
    html,
    text,
    url,
  };
}

function maskEmail(email = "") {
  const [name, domain] = clean(email).split("@");
  if (!domain) return "***";
  return `${String(name || "").slice(0, 2)}***@${domain}`;
}

async function listPraiaRecipients(organizationId) {
  if (!organizationId) return [];

  const { data: memberships, error: membershipError } = await supabaseAdminClient
    .from("organization_members")
    .select("user_id,status")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (membershipError) throw membershipError;

  const userIds = [...new Set((memberships || []).map((item) => item.user_id).filter(Boolean))];
  if (!userIds.length) return [];

  const { data: profiles, error: profileError } = await supabaseAdminClient
    .from("profiles")
    .select("id,first_name,last_name,store,role")
    .in("id", userIds);

  if (profileError) throw profileError;

  const praiaProfiles = (profiles || []).filter((profile) => isPraiaCampaignStore(profile.store));
  const recipients = [];

  for (const profile of praiaProfiles) {
    const { data, error } = await supabaseAdminClient.auth.admin.getUserById(profile.id);
    if (error) {
      console.warn(`[campaign-end] Falha ao obter email do utilizador ${profile.id}: ${error.message || error}`);
      continue;
    }

    const email = clean(data?.user?.email).toLowerCase();
    if (!email) continue;

    const bannedUntil = data?.user?.banned_until ? Date.parse(data.user.banned_until) : 0;
    if (Number.isFinite(bannedUntil) && bannedUntil > Date.now()) continue;

    recipients.push({
      userId: profile.id,
      email,
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      role: profile.role || "user",
      store: profile.store || "",
    });
  }

  const seen = new Set();
  return recipients.filter((recipient) => {
    if (seen.has(recipient.email)) return false;
    seen.add(recipient.email);
    return true;
  });
}

async function getDelivery(eventId, recipientEmail) {
  const { data, error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .select("id,status,attempt_count,provider_message_id,last_error,sent_at")
    .eq("event_id", eventId)
    .eq("recipient_email", recipientEmail)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function markDeliverySending(event, recipient, existing) {
  const payload = {
    event_id: event.id,
    organization_id: event.organization_id,
    recipient_user_id: recipient.userId,
    recipient_email: recipient.email,
    recipient_name: [recipient.firstName, recipient.lastName].filter(Boolean).join(" "),
    status: "sending",
    attempt_count: Number(existing?.attempt_count || 0) + 1,
    last_error: "",
  };

  const { data, error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .upsert(payload, { onConflict: "event_id,recipient_email" })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

async function markDeliverySuccess(deliveryId, providerMessageId) {
  const { error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .update({
      status: "sent",
      provider_message_id: providerMessageId || "",
      last_error: "",
      sent_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);

  if (error) throw error;
}

async function markDeliveryFailure(deliveryId, errorValue) {
  const { error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .update({
      status: "failed",
      last_error: clean(errorValue?.message || errorValue || "Erro desconhecido").slice(0, 2000),
    })
    .eq("id", deliveryId);

  if (error) console.warn("[campaign-end] Não foi possível registar falha de delivery:", error.message || error);
}

async function sendWithResend({ event, recipient, deliveryId }) {
  const config = resendConfig();
  if (!config.apiKey) throw new Error("RESEND_API_KEY não configurada.");
  if (!config.from) throw new Error("CAMPAIGN_END_EMAIL_FROM não configurado.");

  const message = buildEmail({ event, recipient });
  const payload = {
    from: config.from,
    to: [recipient.email],
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
  if (config.replyTo) payload.reply_to = config.replyTo;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  timeout.unref?.();

  let response;
  try {
    response = await fetch(`${config.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `campaign-end/${deliveryId || event.id}/${recipient.userId}`.slice(0, 256),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timeout Resend após ${config.timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }

  if (!response.ok) {
    const message = body?.message || body?.error || raw || `Resend HTTP ${response.status}`;
    throw new Error(`Resend ${response.status}: ${message}`);
  }

  return {
    id: body?.id || body?.data?.id || "",
    url: message.url,
  };
}

function retryAt(attemptCount) {
  const attempt = Math.max(1, Number(attemptCount) || 1);
  const minutes = Math.min(6 * 60, 15 * 2 ** Math.min(attempt - 1, 5));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function finalizeEvent(event, { status, sentAt = null, lastError = "" }) {
  const payload = {
    status,
    locked_at: null,
    last_error: clean(lastError).slice(0, 3000),
    next_attempt_at: status === "sent" ? null : retryAt(event.attempt_count),
  };

  if (sentAt) payload.sent_at = sentAt;

  const { error } = await supabaseAdminClient
    .from(EVENT_TABLE)
    .update(payload)
    .eq("id", event.id);

  if (error) throw error;
}

async function dryRunDueEvents(limit) {
  const { data, error } = await supabaseAdminClient
    .from(EVENT_TABLE)
    .select("*")
    .in("status", ["pending", "failed", "partial", "waiting_recipients"])
    .lte("due_at", new Date().toISOString())
    .lte("next_attempt_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (error.code === "42P01") {
      throw new Error("Tabela campaign_end_events_v4 em falta. Executa a migration V4 definitiva no Supabase.");
    }
    throw error;
  }
  return data || [];
}

async function claimDueEvents(limit, maxAttempts) {
  const { data, error } = await supabaseAdminClient.rpc(CLAIM_RPC, {
    p_limit: limit,
    p_max_attempts: maxAttempts,
  });

  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") {
      throw new Error("RPC claim_campaign_end_events_v4 em falta. Executa a migration V4 definitiva no Supabase e recarrega o schema.");
    }
    throw error;
  }
  return data || [];
}

export async function runCampaignEndNotificationWorker({ dryRun = false } = {}) {
  assertAdminClient();
  const config = getCampaignEndNotificationConfig();

  if (!dryRun && !config.emailEnabled) {
    return {
      ok: true,
      skipped: true,
      reason: "CAMPAIGN_END_EMAIL_ENABLED=0",
      dryRun: false,
      store: config.storeName,
    };
  }

  if (!dryRun && !config.resendConfigured) {
    throw new Error("Notificações de fim de campanha ativas, mas RESEND_API_KEY/CAMPAIGN_END_EMAIL_FROM estão em falta.");
  }

  const events = dryRun
    ? await dryRunDueEvents(config.batchSize)
    : await claimDueEvents(config.batchSize, config.maxAttempts);

  const result = {
    ok: true,
    dryRun,
    store: config.storeName,
    scanned: events.length,
    sent: 0,
    alreadySent: 0,
    failed: 0,
    waitingRecipients: 0,
    events: [],
  };

  for (const event of events) {
    const eventResult = {
      id: event.id,
      sourceType: event.source_type,
      sourceCampaignId: event.source_campaign_id,
      title: event.title,
      endDate: event.end_date,
      totalItems: Number(event.total_items) || (Array.isArray(event.items) ? event.items.length : 0),
      recipients: [],
    };

    let recipients;
    try {
      recipients = await listPraiaRecipients(event.organization_id);
    } catch (error) {
      result.ok = false;
      result.failed += 1;
      eventResult.error = error?.message || String(error);
      if (!dryRun) await finalizeEvent(event, { status: "failed", lastError: eventResult.error });
      result.events.push(eventResult);
      continue;
    }

    if (!recipients.length) {
      result.ok = false;
      result.waitingRecipients += 1;
      eventResult.error = event.organization_id
        ? `Não existem utilizadores ativos da Loja da Praia na organização ${event.organization_id}.`
        : "Campanha sem organization_id; envio bloqueado para impedir fuga entre organizações.";

      if (!dryRun) {
        await finalizeEvent(event, {
          status: "waiting_recipients",
          lastError: eventResult.error,
        });
      }

      result.events.push(eventResult);
      continue;
    }

    let eventSent = 0;
    let eventFailed = 0;

    for (const recipient of recipients) {
      const masked = maskEmail(recipient.email);

      if (dryRun) {
        eventResult.recipients.push({ email: masked, status: "would-send" });
        continue;
      }

      let existing;
      try {
        existing = await getDelivery(event.id, recipient.email);
      } catch (error) {
        result.ok = false;
        eventFailed += 1;
        result.failed += 1;
        eventResult.recipients.push({ email: masked, status: "failed", error: error?.message || String(error) });
        continue;
      }

      if (existing?.status === "sent") {
        result.alreadySent += 1;
        eventSent += 1;
        eventResult.recipients.push({ email: masked, status: "already-sent" });
        continue;
      }

      let delivery = null;
      try {
        delivery = await markDeliverySending(event, recipient, existing);
        const sent = await sendWithResend({ event, recipient, deliveryId: delivery.id });
        await markDeliverySuccess(delivery.id, sent.id);
        result.sent += 1;
        eventSent += 1;
        eventResult.recipients.push({ email: masked, status: "sent", messageId: sent.id || "" });
      } catch (error) {
        result.ok = false;
        result.failed += 1;
        eventFailed += 1;
        if (delivery?.id) await markDeliveryFailure(delivery.id, error);
        eventResult.recipients.push({
          email: masked,
          status: "failed",
          error: error?.message || String(error),
        });
      }
    }

    if (!dryRun) {
      if (eventFailed === 0 && eventSent === recipients.length) {
        await finalizeEvent(event, { status: "sent", sentAt: new Date().toISOString() });
      } else if (eventSent > 0) {
        await finalizeEvent(event, {
          status: "partial",
          lastError: `${eventFailed} entrega(s) falharam; ${eventSent} concluída(s).`,
        });
      } else {
        await finalizeEvent(event, {
          status: "failed",
          lastError: `${eventFailed || recipients.length} entrega(s) falharam.`,
        });
      }
    }

    result.events.push(eventResult);
  }

  return result;
}

export const runCampaignEndNotificationWorkerOnce = runCampaignEndNotificationWorker;

export async function getCampaignEndNotificationById(notificationId) {
  assertAdminClient();
  const id = clean(notificationId);
  if (!id) return null;

  const { data: event, error } = await supabaseAdminClient
    .from(EVENT_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (error.code === "22P02") return null;
    if (error.code === "42P01") {
      throw new Error(
        "Estrutura V4 de fim de campanha em falta. Executa a migration 20260929113000_campaign_end_notifications_v4_definitive.sql.",
      );
    }
    throw error;
  }

  if (!event) return null;

  const items = Array.isArray(event.items) ? event.items : [];
  const sourceTable = event.source_type === "automatic" ? "automatic_campaigns" : "campaigns";

  return {
    id: event.id,
    event_id: event.id,
    source_type: event.source_type,
    source: event.source_type,
    source_table: sourceTable,
    source_campaign_id: event.source_campaign_id,
    campaign_id: event.source_campaign_id,
    organization_id: event.organization_id || null,
    organizationId: event.organization_id || null,
    store: event.store,
    titulo: event.title,
    title: event.title,
    dados: items,
    items,
    ano_validade: event.campaign_year,
    anoValidade: event.campaign_year,
    campaignYear: event.campaign_year,
    formato_etiqueta: event.label_format || "",
    formatoEtiqueta: event.label_format || "",
    origem: event.origin || (event.source_type === "automatic" ? "automatico-email" : "manual"),
    created_at: event.campaign_created_at || event.created_at,
    criadoEm: event.campaign_created_at || event.created_at,
    total_artigos: Number(event.total_items) || items.length,
    totalArtigos: Number(event.total_items) || items.length,
    campaign_end_date: event.end_date,
    campaignEndDate: event.end_date,
    ends_at: event.end_date,
    status: event.status,
    sent_at: event.sent_at,
    created_by: "PromoPilot",
    campaign_snapshot: {
      id: event.source_campaign_id,
      titulo: event.title,
      dados: items,
      ano_validade: event.campaign_year,
      formato_etiqueta: event.label_format || "",
      origem: event.origin || "",
      total_artigos: Number(event.total_items) || items.length,
      store: event.store,
      campaign_end_date: event.end_date,
      organization_id: event.organization_id || null,
    },
  };
}

export default runCampaignEndNotificationWorker;
