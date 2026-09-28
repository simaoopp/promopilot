import { supabaseAdminClient } from "../../lib/supabaseClients.js";
import {
  compareIsoDateOnly,
  deriveCampaignEndDate,
} from "../../../src/shared/campaign-label/campaignDates.js";

const DELIVERY_TABLE = "campaign_end_notification_deliveries";
const PRAIA_STORE = process.env.CAMPAIGN_END_NOTIFICATION_STORE || "Loja da Praia";
const DEFAULT_TIME_ZONE = process.env.CAMPAIGN_END_NOTIFICATION_TIME_ZONE || "Atlantic/Azores";
const DEFAULT_LIMIT = Math.min(1000, Math.max(25, Number(process.env.CAMPAIGN_END_NOTIFICATION_SCAN_LIMIT || 300)));
const ARTICLE_PREVIEW_LIMIT = Math.min(40, Math.max(8, Number(process.env.CAMPAIGN_END_NOTIFICATION_ARTICLE_LIMIT || 18)));

function assertAdminClient() {
  if (!supabaseAdminClient) {
    throw new Error("Supabase service role não configurado. Define SUPABASE_SERVICE_ROLE_KEY no Render.");
  }
}

function todayInTimeZone(timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeToday(value = "") {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return todayInTimeZone();
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value);
  }

  const raw = String(value).trim();
  if (!raw) return "—";
  const compact = raw.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  const normalized = Number(
    compact.includes(",")
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact,
  );
  if (Number.isFinite(normalized) && /\d/.test(raw)) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(normalized);
  }
  return raw;
}

function getCode(item = {}) {
  return String(item.codigo || item.artigo || item.code || "—").trim() || "—";
}

function getDescription(item = {}) {
  return String(item.descricao || item.description || item.titulo || "Sem descrição").trim() || "Sem descrição";
}

function getCurrentPrice(item = {}) {
  return normalizePrice(
    item.atual ?? item.pvp2Atual ?? item.pvp2_atual ?? item.precoAtual ?? item.pvp2 ?? "",
  );
}

function formatDatePt(isoDate = "") {
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(isoDate || "—");
}

function publicAppUrl() {
  return String(
    process.env.CAMPAIGN_END_NOTIFICATION_APP_URL ||
      process.env.APP_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      "https://www.promopilot.pt",
  )
    .trim()
    .replace(/\/+$/, "");
}

function campaignUrl(campaign) {
  const source = campaign.type === "automatic" ? "automatic" : "manual";
  const next = `/Homepage?campaign=${encodeURIComponent(campaign.id)}&source=${source}`;
  return `${publicAppUrl()}${next}`;
}

function emailConfig() {
  return {
    apiKey: String(process.env.CAMPAIGN_END_RESEND_API_KEY || process.env.RESEND_API_KEY || "").trim(),
    baseUrl: String(process.env.RESEND_API_BASE_URL || "https://api.resend.com").replace(/\/+$/, ""),
    from: String(
      process.env.CAMPAIGN_END_EMAIL_FROM ||
        process.env.CAMPAIGN_EMAIL_FROM_ADDRESS ||
        process.env.CAMPAIGN_SMTP_FROM ||
        "",
    ).trim(),
    replyTo: String(process.env.CAMPAIGN_END_EMAIL_REPLY_TO || process.env.CAMPAIGN_EMAIL_REPLY_TO || "").trim(),
    logoUrl: String(process.env.CAMPAIGN_END_LOGO_URL || "").trim(),
  };
}

function assertEmailConfig(config) {
  if (!config.apiKey) throw new Error("RESEND_API_KEY não configurada para as notificações de fim de campanha.");
  if (!config.from) throw new Error("CAMPAIGN_END_EMAIL_FROM ou CAMPAIGN_EMAIL_FROM_ADDRESS não configurado.");
}

function buildArticleRows(items = []) {
  const list = (Array.isArray(items) ? items : []).slice(0, ARTICLE_PREVIEW_LIMIT);
  return list
    .map(
      (item) => `
        <tr>
          <td style="padding:14px 16px;border-top:1px solid #edf1f5;vertical-align:top;">
            <div style="font-size:12px;font-weight:800;color:#147bd1;letter-spacing:.02em;">${escapeHtml(getCode(item))}</div>
            <div style="margin-top:4px;font-size:13px;line-height:1.45;color:#25313c;">${escapeHtml(getDescription(item))}</div>
          </td>
          <td style="padding:14px 16px;border-top:1px solid #edf1f5;vertical-align:top;text-align:right;white-space:nowrap;font-size:13px;font-weight:800;color:#17212b;">${escapeHtml(getCurrentPrice(item))}</td>
        </tr>`,
    )
    .join("");
}

function buildEmail({ campaign, recipient }) {
  const items = Array.isArray(campaign.items) ? campaign.items : [];
  const hiddenCount = Math.max(0, items.length - ARTICLE_PREVIEW_LIMIT);
  const firstName = String(recipient.firstName || "").trim();
  const greeting = firstName ? `Olá, ${firstName}.` : "Olá.";
  const url = campaignUrl(campaign);
  const endDate = formatDatePt(campaign.endDate);
  const logo = emailConfig().logoUrl
    ? `<img src="${escapeHtml(emailConfig().logoUrl)}" alt="PromoPilot" width="185" style="display:block;width:185px;max-width:70%;height:auto;border:0;" />`
    : `<div style="font-size:22px;font-weight:900;letter-spacing:-.03em;color:#147bd1;">PromoPilot</div>`;

  const html = `<!doctype html>
<html><body style="margin:0;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#17212b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">A campanha ${escapeHtml(campaign.title)} terminou. Consulta os artigos e próximos passos no PromoPilot.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f8;padding:34px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(23,33,43,.10);">
        <tr><td style="padding:28px 32px;border-bottom:1px solid #edf1f5;">${logo}</td></tr>
        <tr><td style="padding:30px 32px 20px;">
          <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#eaf4ff;color:#147bd1;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">Loja da Praia · Campanha concluída</div>
          <h1 style="margin:16px 0 10px;font-size:28px;line-height:1.18;letter-spacing:-.03em;color:#17212b;">${escapeHtml(campaign.title)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.65;color:#5d6a73;">${escapeHtml(greeting)} A campanha chegou ao fim. O resumo abaixo ajuda a equipa a confirmar os artigos e a fechar a execução em loja.</p>
        </td></tr>
        <tr><td style="padding:4px 32px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="50%" style="padding:16px;border-radius:14px 0 0 14px;background:#f7f9fb;border:1px solid #edf1f5;">
              <div style="font-size:11px;color:#87929a;text-transform:uppercase;font-weight:800;letter-spacing:.06em;">Data final</div>
              <div style="margin-top:6px;font-size:18px;font-weight:900;color:#17212b;">${escapeHtml(endDate)}</div>
            </td>
            <td width="50%" style="padding:16px;border-radius:0 14px 14px 0;background:#f7f9fb;border:1px solid #edf1f5;border-left:0;">
              <div style="font-size:11px;color:#87929a;text-transform:uppercase;font-weight:800;letter-spacing:.06em;">Artigos</div>
              <div style="margin-top:6px;font-size:18px;font-weight:900;color:#17212b;">${items.length}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 32px 8px;">
          <div style="font-size:12px;font-weight:900;color:#17212b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Artigos da campanha</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #edf1f5;border-radius:14px;border-collapse:separate;border-spacing:0;overflow:hidden;">
            <tr><th align="left" style="padding:11px 16px;background:#f7f9fb;font-size:11px;color:#7a8790;text-transform:uppercase;letter-spacing:.05em;">Artigo</th><th align="right" style="padding:11px 16px;background:#f7f9fb;font-size:11px;color:#7a8790;text-transform:uppercase;letter-spacing:.05em;">Preço final</th></tr>
            ${buildArticleRows(items)}
          </table>
          ${hiddenCount ? `<p style="margin:10px 0 0;font-size:12px;color:#7a8790;">+ ${hiddenCount} artigo${hiddenCount === 1 ? "" : "s"} disponível${hiddenCount === 1 ? "" : "eis"} na campanha completa.</p>` : ""}
        </td></tr>
        <tr><td align="center" style="padding:24px 32px 8px;">
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#147bd1;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;padding:15px 26px;border-radius:12px;box-shadow:0 8px 20px rgba(20,123,209,.22);">Abrir campanha no PromoPilot</a>
        </td></tr>
        <tr><td style="padding:20px 32px 28px;">
          <div style="padding:14px 16px;border-radius:13px;background:#fff8f1;border:1px solid #f5e2cf;font-size:12px;line-height:1.6;color:#7c5b3d;"><strong>Fecho operacional:</strong> confirma a retirada de comunicação promocional e valida os preços em loja quando aplicável.</div>
        </td></tr>
        <tr><td align="center" style="padding:20px 32px;background:#fafbfc;border-top:1px solid #edf1f5;font-size:11px;line-height:1.6;color:#98a2aa;">Mensagem automática do PromoPilot · enviada apenas à equipa associada à Loja da Praia.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `PromoPilot — Campanha concluída`,
    "",
    `${greeting}`,
    `A campanha \"${campaign.title}\" terminou em ${endDate}.`,
    `Artigos: ${items.length}.`,
    "",
    ...items.slice(0, ARTICLE_PREVIEW_LIMIT).map((item) => `${getCode(item)} — ${getDescription(item)} — ${getCurrentPrice(item)}`),
    hiddenCount ? `+ ${hiddenCount} artigos na campanha completa.` : "",
    "",
    `Abrir campanha: ${url}`,
    "",
    "PromoPilot · Loja da Praia",
  ].filter(Boolean).join("\n");

  return {
    subject: `Campanha concluída · ${campaign.title}`,
    html,
    text,
    url,
  };
}

async function sendWithResend({ recipient, campaign }) {
  const config = emailConfig();
  assertEmailConfig(config);
  const message = buildEmail({ campaign, recipient });
  const payload = {
    from: config.from,
    to: [recipient.email],
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
  if (config.replyTo) payload.reply_to = config.replyTo;

  const response = await fetch(`${config.baseUrl}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }

  if (!response.ok) {
    throw new Error(body?.message || body?.error || raw || `Resend HTTP ${response.status}`);
  }

  return { id: body?.id || body?.data?.id || "", url: message.url };
}

async function listPraiaRecipients(organizationId = null) {
  let allowedUserIds = null;

  if (organizationId) {
    const { data: memberships, error: membershipError } = await supabaseAdminClient
      .from("organization_members")
      .select("user_id,status")
      .eq("organization_id", organizationId)
      .eq("status", "active");

    if (membershipError) throw membershipError;
    allowedUserIds = (memberships || []).map((item) => item.user_id).filter(Boolean);
    if (!allowedUserIds.length) return [];
  }

  let profileQuery = supabaseAdminClient
    .from("profiles")
    .select("id,first_name,last_name,store,role")
    .eq("store", PRAIA_STORE)
    .order("first_name", { ascending: true });

  if (allowedUserIds) profileQuery = profileQuery.in("id", allowedUserIds);

  const { data: profiles, error } = await profileQuery;
  if (error) throw error;

  const recipients = [];
  for (const profile of profiles || []) {
    const { data, error: authError } = await supabaseAdminClient.auth.admin.getUserById(profile.id);
    if (authError) {
      console.warn(`[campaign-end] Não foi possível obter email de ${profile.id}: ${authError.message}`);
      continue;
    }

    const email = String(data?.user?.email || "").trim().toLowerCase();
    const bannedUntil = data?.user?.banned_until ? Date.parse(data.user.banned_until) : 0;
    if (!email || (Number.isFinite(bannedUntil) && bannedUntil > Date.now())) continue;

    recipients.push({
      userId: profile.id,
      email,
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      role: profile.role || "user",
    });
  }

  const seen = new Set();
  return recipients.filter((recipient) => {
    if (seen.has(recipient.email)) return false;
    seen.add(recipient.email);
    return true;
  });
}

async function loadCampaigns(table, type) {
  const automatic = type === "automatic";
  const select = automatic
    ? "id,organization_id,titulo,dados,ano_validade,formato_etiqueta,origem,created_at,expires_at,total_artigos,store,status,pdf_url,pdfs"
    : "id,organization_id,titulo,dados,ano_validade,formato_etiqueta,origem,created_at,expires_at,total_artigos,store";

  const { data, error } = await supabaseAdminClient
    .from(table)
    .select(select)
    .eq("store", PRAIA_STORE)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) throw error;

  return (data || []).map((row) => ({
    type,
    id: row.id,
    organizationId: row.organization_id || null,
    title: row.titulo || (automatic ? "Campanha automática" : "Campanha"),
    items: Array.isArray(row.dados) ? row.dados : [],
    year: Number(row.ano_validade) || new Date().getFullYear(),
    format: row.formato_etiqueta || "",
    origin: row.origem || "",
    createdAt: row.created_at || "",
    expiresAt: row.expires_at || "",
    store: row.store || PRAIA_STORE,
    totalItems: Number(row.total_artigos) || (Array.isArray(row.dados) ? row.dados.length : 0),
    status: row.status || "",
    pdfUrl: row.pdf_url || "",
    pdfs: row.pdfs || {},
    endDate: deriveCampaignEndDate(row.dados, Number(row.ano_validade) || new Date().getFullYear()),
  }));
}

async function getDelivery(campaign, recipient) {
  const { data, error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .select("id,status,attempt_count,provider_message_id,sent_at,last_error")
    .eq("campaign_type", campaign.type)
    .eq("campaign_id", campaign.id)
    .eq("recipient_email", recipient.email)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      throw new Error("Tabela de notificações em falta. Executa a migration 20260928_campaign_end_notification_deliveries.sql no Supabase.");
    }
    throw error;
  }

  return data || null;
}

async function markPending(campaign, recipient, existing) {
  const payload = {
    campaign_type: campaign.type,
    campaign_id: campaign.id,
    organization_id: campaign.organizationId,
    store: campaign.store,
    campaign_title: campaign.title,
    campaign_end_date: campaign.endDate,
    recipient_user_id: recipient.userId,
    recipient_email: recipient.email,
    status: "pending",
    attempt_count: Number(existing?.attempt_count || 0) + 1,
    last_error: "",
  };

  const { data, error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .upsert(payload, { onConflict: "campaign_type,campaign_id,recipient_email" })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

async function markDeliverySuccess(id, providerMessageId) {
  const { error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .update({
      status: "sent",
      provider_message_id: providerMessageId || "",
      last_error: "",
      sent_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

async function markDeliveryFailure(id, errorValue) {
  const { error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .update({
      status: "failed",
      last_error: String(errorValue?.message || errorValue || "Erro desconhecido").slice(0, 2000),
    })
    .eq("id", id);
  if (error) console.warn("[campaign-end] Não foi possível registar falha:", error.message || error);
}

function maskEmail(email = "") {
  const [name, domain] = String(email).split("@");
  if (!domain) return "***";
  return `${String(name || "").slice(0, 2)}***@${domain}`;
}

export async function runCampaignEndNotificationWorker({ dryRun = false, today = "" } = {}) {
  assertAdminClient();
  const currentDate = normalizeToday(today);
  const enabled = !["0", "false", "off", "no"].includes(
    String(process.env.CAMPAIGN_END_NOTIFICATION_ENABLED ?? "true").trim().toLowerCase(),
  );

  if (!enabled && !dryRun) {
    return { ok: true, skipped: true, reason: "CAMPAIGN_END_NOTIFICATION_ENABLED=false", today: currentDate };
  }

  const [manualCampaigns, automaticCampaigns] = await Promise.all([
    loadCampaigns("campaigns", "manual"),
    loadCampaigns("automatic_campaigns", "automatic"),
  ]);

  const due = [...manualCampaigns, ...automaticCampaigns].filter(
    (campaign) => campaign.endDate && compareIsoDateOnly(campaign.endDate, currentDate) <= 0,
  );

  const result = {
    ok: true,
    dryRun,
    today: currentDate,
    dateOnly: true,
    store: PRAIA_STORE,
    recipients: 0,
    dueCampaigns: due.length,
    sent: 0,
    skippedAlreadySent: 0,
    failed: 0,
    campaigns: [],
  };

  const recipientCache = new Map();

  for (const campaign of due) {
    const recipientKey = campaign.organizationId || "__no_org__";
    if (!recipientCache.has(recipientKey)) {
      recipientCache.set(recipientKey, await listPraiaRecipients(campaign.organizationId));
    }
    const recipients = recipientCache.get(recipientKey) || [];
    result.recipients = Math.max(result.recipients, recipients.length);

    if (!recipients.length) {
      result.ok = false;
      result.failed += 1;
      result.campaigns.push({
        id: campaign.id,
        type: campaign.type,
        title: campaign.title,
        endDate: campaign.endDate,
        totalItems: campaign.items.length,
        deliveries: [],
        error: `Não existem utilizadores ativos de ${PRAIA_STORE} na organização da campanha.`,
      });
      continue;
    }
    const campaignResult = {
      id: campaign.id,
      type: campaign.type,
      title: campaign.title,
      endDate: campaign.endDate,
      totalItems: campaign.items.length,
      deliveries: [],
    };

    for (const recipient of recipients) {
      if (dryRun) {
        campaignResult.deliveries.push({ email: maskEmail(recipient.email), status: "would-send" });
        continue;
      }

      const existing = await getDelivery(campaign, recipient);
      if (existing?.status === "sent") {
        result.skippedAlreadySent += 1;
        campaignResult.deliveries.push({ email: maskEmail(recipient.email), status: "already-sent" });
        continue;
      }

      let deliveryRow = null;
      try {
        deliveryRow = await markPending(campaign, recipient, existing);
        const sent = await sendWithResend({ recipient, campaign });
        await markDeliverySuccess(deliveryRow.id, sent.id);
        result.sent += 1;
        campaignResult.deliveries.push({ email: maskEmail(recipient.email), status: "sent", messageId: sent.id || "" });
      } catch (error) {
        result.ok = false;
        result.failed += 1;
        if (deliveryRow?.id) await markDeliveryFailure(deliveryRow.id, error);
        campaignResult.deliveries.push({
          email: maskEmail(recipient.email),
          status: "failed",
          error: error?.message || String(error),
        });
      }
    }

    result.campaigns.push(campaignResult);
  }

  return result;
}

export const runCampaignEndNotificationWorkerOnce = runCampaignEndNotificationWorker;
export default runCampaignEndNotificationWorker;
