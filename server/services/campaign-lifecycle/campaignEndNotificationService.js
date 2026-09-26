import { hasSupabaseAdminConfig, supabaseAdminClient } from "../../lib/supabaseClients.js";
import { automaticCampaignStores } from "../automatic-campaigns/config.js";
import { sendTransactionalEmail } from "../automatic-campaigns/emailSenderService.js";

const NOTIFICATIONS_TABLE = "campaign_end_notifications";
const MANUAL_CAMPAIGNS_TABLE = "campaigns";
const AUTOMATIC_CAMPAIGNS_TABLE = "automatic_campaigns";
const DEFAULT_TIMEZONE = "Atlantic/Azores";
const DEFAULT_RECENT_END_DAYS = 7;
const DEFAULT_CAMPAIGN_LOOKBACK_DAYS = 180;
const DEFAULT_BATCH_SIZE = 250;
const EMAIL_PREVIEW_LIMIT = 24;

const MANUAL_SELECT =
  "id,organization_id,titulo,dados,ano_validade,formato_etiqueta,origem,created_by,created_by_email,created_at,expires_at,total_artigos,store,user_id";
const AUTOMATIC_SELECT =
  `${MANUAL_SELECT},email_message_id,email_subject,email_from,email_received_at,processed_at,status,pdf_url,pdfs,error_message`;

function assertAdminClient() {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error(
      "Campaign end worker requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.",
    );
  }
}

function readPositiveInt(name, fallback, { min = 1, max = 10000 } = {}) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function targetStore() {
  return String(
    process.env.CAMPAIGN_END_STORE_NAME_PRAIA ||
      automaticCampaignStores?.praia?.store ||
      "Loja da Praia",
  ).trim();
}

function publicAppUrl() {
  return String(
    process.env.CAMPAIGN_END_PUBLIC_URL ||
      process.env.APP_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      "https://www.promopilot.pt",
  )
    .trim()
    .replace(/\/+$/, "");
}

function campaignTimezone() {
  return String(process.env.CAMPAIGN_END_TIMEZONE || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
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

function datePartsToIso(year, month, day) {
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";
  if (y < 2000 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return "";

  const test = new Date(Date.UTC(y, m - 1, d));
  if (
    test.getUTCFullYear() !== y ||
    test.getUTCMonth() !== m - 1 ||
    test.getUTCDate() !== d
  ) {
    return "";
  }

  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseCampaignCalendarDate(value, fallbackYear) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (match) return datePartsToIso(match[1], match[2], match[3]);

  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return datePartsToIso(match[3], match[2], match[1]);

  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (match) return datePartsToIso(fallbackYear, match[2], match[1]);

  return "";
}

export function getCampaignEndDate(row = {}) {
  const fallbackYear =
    Number.parseInt(row.ano_validade, 10) ||
    Number.parseInt(row.anoValidade, 10) ||
    new Date().getUTCFullYear();

  const ends = safeArray(row.dados)
    .map((item) =>
      parseCampaignCalendarDate(
        item?.dataFim ?? item?.data_fim ?? item?.fim ?? item?.endDate,
        fallbackYear,
      ),
    )
    .filter(Boolean)
    .sort();

  return ends.at(-1) || "";
}

function getLocalIsoDate(timeZone = campaignTimezone(), date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function isoDateToUtcMs(value = "") {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function differenceCalendarDays(laterIso, earlierIso) {
  const later = isoDateToUtcMs(laterIso);
  const earlier = isoDateToUtcMs(earlierIso);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return Number.NaN;
  return Math.round((later - earlier) / (24 * 60 * 60 * 1000));
}

function formatPtDate(isoDate = "") {
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(isoDate || "-");
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "-";
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(number);
}

function articleCode(item = {}) {
  return String(item.codigo || item.artigo || item.code || "-").trim() || "-";
}

function articleDescription(item = {}) {
  return String(item.descricao || item.description || item.titulo || "-").trim() || "-";
}

function articleOldPrice(item = {}) {
  return item.antes ?? item.pvpAnterior ?? item.pvp1 ?? item.pvp2Antes ?? "";
}

function articleCurrentPrice(item = {}) {
  return item.atual ?? item.pvpAtual ?? item.pvp2 ?? item.pvp2Atual ?? "";
}

function emailBrandHeader() {
  const logoUrl = String(
    process.env.CAMPAIGN_END_LOGO_URL || `${publicAppUrl()}/promopilot-email-logo.png`,
  ).trim();

  return `<img src="${escapeHtml(logoUrl)}" alt="PromoPilot" width="190" style="display:block;width:190px;max-width:70%;height:auto;border:0;" />`;
}

function buildArticleRows(items = []) {
  const preview = safeArray(items).slice(0, EMAIL_PREVIEW_LIMIT);
  return preview
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 10px;border-bottom:1px solid #edf1ef;font-size:13px;font-weight:700;color:#17212b;white-space:nowrap;">${escapeHtml(articleCode(item))}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #edf1ef;font-size:13px;color:#55635c;">${escapeHtml(articleDescription(item))}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #edf1ef;font-size:13px;color:#66736d;text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(articleOldPrice(item)))}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #edf1ef;font-size:13px;font-weight:700;color:#17212b;text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(articleCurrentPrice(item)))}</td>
        </tr>`,
    )
    .join("");
}

function buildEndEmail({ campaign, notificationId, endedOn, recipientName = "" }) {
  const title = String(campaign.titulo || campaign.email_subject || "Campanha").trim();
  const store = String(campaign.store || targetStore()).trim();
  const items = safeArray(campaign.dados);
  const total = Number(campaign.total_artigos ?? items.length) || items.length;
  const source = String(campaign.origem || "manual").includes("automatic")
    ? "Campanha automática"
    : "Campanha manual";
  const campaignPath = `/Homepage?campaignEnd=${encodeURIComponent(notificationId)}`;
  const detailUrl = `${publicAppUrl()}/login?next=${encodeURIComponent(campaignPath)}`;
  const firstName = String(recipientName || "").trim();
  const greeting = firstName ? `Olá ${firstName},` : "Olá,";
  const extra = Math.max(0, items.length - EMAIL_PREVIEW_LIMIT);

  const subject = `Campanha concluída · ${title} · ${formatPtDate(endedOn)}`;
  const textLines = [
    greeting,
    "",
    `A campanha \"${title}\" terminou em ${formatPtDate(endedOn)}.`,
    `Loja: ${store}`,
    `Artigos: ${total}`,
    `Origem: ${source}`,
    "",
    "Artigos:",
    ...items.slice(0, EMAIL_PREVIEW_LIMIT).map(
      (item) => `${articleCode(item)} · ${articleDescription(item)} · ${formatMoney(articleOldPrice(item))} → ${formatMoney(articleCurrentPrice(item))}`,
    ),
    ...(extra ? [`+ ${extra} artigo(s) — consulta a campanha completa no PromoPilot.`] : []),
    "",
    `Abrir campanha: ${detailUrl}`,
    "",
    "Revê a campanha e confirma os materiais promocionais ainda em exposição na loja.",
    "",
    "PromoPilot · Campaign Lifecycle",
  ];

  const html = `
  <div style="margin:0;padding:0;background:#f3f6f5;font-family:Arial,Helvetica,sans-serif;color:#17212b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f5;padding:34px 14px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 55px rgba(15,23,42,.10);">
          <tr>
            <td style="padding:28px 34px 20px;border-bottom:1px solid #e9efec;">
              ${emailBrandHeader()}
            </td>
          </tr>
          <tr>
            <td style="padding:30px 34px 12px;">
              <span style="display:inline-block;padding:7px 11px;border-radius:999px;background:#fff2e8;color:#c85305;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Campanha concluída</span>
              <h1 style="margin:16px 0 10px;font-size:28px;line-height:1.25;color:#17212b;letter-spacing:-.02em;">${escapeHtml(title)}</h1>
              <p style="margin:0;font-size:15px;line-height:1.65;color:#66736d;">${escapeHtml(greeting)} esta campanha terminou e já está pronta para revisão operacional.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 34px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="33.33%" style="padding:14px;background:#f7faf8;border-radius:14px 0 0 14px;border-right:4px solid #fff;">
                    <div style="font-size:10px;color:#89948e;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Terminou</div>
                    <div style="margin-top:5px;font-size:15px;font-weight:800;color:#17212b;">${escapeHtml(formatPtDate(endedOn))}</div>
                  </td>
                  <td width="33.33%" style="padding:14px;background:#f7faf8;border-right:4px solid #fff;">
                    <div style="font-size:10px;color:#89948e;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Artigos</div>
                    <div style="margin-top:5px;font-size:15px;font-weight:800;color:#17212b;">${total}</div>
                  </td>
                  <td width="33.33%" style="padding:14px;background:#f7faf8;border-radius:0 14px 14px 0;">
                    <div style="font-size:10px;color:#89948e;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Loja</div>
                    <div style="margin-top:5px;font-size:15px;font-weight:800;color:#17212b;">${escapeHtml(store)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 34px 4px;">
              <div style="font-size:12px;font-weight:800;color:#44534b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;">Resumo de artigos</div>
              <div style="overflow:hidden;border:1px solid #e5ebe8;border-radius:14px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f8faf9;">
                      <th align="left" style="padding:10px;font-size:10px;color:#89948e;text-transform:uppercase;letter-spacing:.05em;">Código</th>
                      <th align="left" style="padding:10px;font-size:10px;color:#89948e;text-transform:uppercase;letter-spacing:.05em;">Artigo</th>
                      <th align="right" style="padding:10px;font-size:10px;color:#89948e;text-transform:uppercase;letter-spacing:.05em;">Antes</th>
                      <th align="right" style="padding:10px;font-size:10px;color:#89948e;text-transform:uppercase;letter-spacing:.05em;">Final</th>
                    </tr>
                  </thead>
                  <tbody>${buildArticleRows(items)}</tbody>
                </table>
              </div>
              ${extra ? `<p style="margin:10px 0 0;font-size:12px;color:#75817b;">+ ${extra} artigo${extra === 1 ? "" : "s"}. A lista completa está disponível no PromoPilot.</p>` : ""}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 34px 12px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="background:#147bd1;border-radius:12px;">
                <a href="${escapeHtml(detailUrl)}" style="display:inline-block;padding:15px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;border-radius:12px;">Abrir campanha no PromoPilot</a>
              </td></tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 34px 30px;">
              <div style="padding:15px 17px;background:#f7faf8;border-radius:14px;border-left:4px solid #21a366;">
                <div style="font-size:12px;font-weight:800;color:#2f4b3d;margin-bottom:4px;">Próximo passo</div>
                <div style="font-size:12px;line-height:1.55;color:#66736d;">Revê a campanha e confirma os materiais promocionais ainda em exposição na loja. O botão acima abre o registo completo, mesmo depois de sair do histórico normal.</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 34px;background:#17212b;">
              <table role="presentation" width="100%"><tr>
                <td style="font-size:11px;line-height:1.5;color:#c9d2cd;">PromoPilot · Campaign Lifecycle<br/>Notificação automática · ${escapeHtml(source)}</td>
                <td align="right" style="font-size:11px;color:#8fa099;">${escapeHtml(store)}</td>
              </tr></table>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </div>`;

  return { subject, text: textLines.join("\n"), html, detailUrl };
}

async function listRecentCampaignRows(table, select, store, lookbackDays, limit) {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdminClient
    .from(table)
    .select(select)
    .ilike("store", store)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function listAuthUsersById() {
  const byId = new Map();
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = Array.isArray(data?.users) ? data.users : [];
    users.forEach((user) => byId.set(user.id, user));
    if (users.length < perPage) break;
  }

  return byId;
}

export async function listPraiaEmployeeRecipients(store = targetStore()) {
  assertAdminClient();

  const { data: profiles, error } = await supabaseAdminClient
    .from("profiles")
    .select("id,first_name,last_name,store,role")
    .ilike("store", store)
    .order("first_name", { ascending: true });

  if (error) throw error;

  const authUsers = await listAuthUsersById();
  const recipients = [];

  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const user = authUsers.get(profile.id);
    const email = normalizeEmail(user?.email);
    const confirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
    if (!email || !confirmed) continue;

    recipients.push({
      userId: profile.id,
      email,
      firstName: String(profile.first_name || "").trim(),
      lastName: String(profile.last_name || "").trim(),
      role: String(profile.role || "user").trim(),
      store: String(profile.store || store).trim(),
    });
  }

  const seen = new Set();
  return recipients.filter((recipient) => {
    if (seen.has(recipient.email)) return false;
    seen.add(recipient.email);
    return true;
  });
}

function isTableMissing(error) {
  return error?.code === "42P01" || /campaign_end_notifications.*does not exist/i.test(String(error?.message || ""));
}

async function findExistingNotification({ source, campaignId, store, allowMissingTable = false }) {
  const { data, error } = await supabaseAdminClient
    .from(NOTIFICATIONS_TABLE)
    .select("*")
    .eq("campaign_source", source)
    .eq("campaign_id", campaignId)
    .eq("store", store)
    .maybeSingle();

  if (error) {
    if (allowMissingTable && isTableMissing(error)) return null;
    throw error;
  }
  return data || null;
}

async function createOrLoadNotification({ source, campaign, endedOn, recipients }) {
  const payload = {
    organization_id: campaign.organization_id || null,
    campaign_source: source,
    campaign_id: String(campaign.id),
    store: String(campaign.store || targetStore()),
    ended_on: endedOn,
    campaign_title: String(campaign.titulo || campaign.email_subject || "Campanha"),
    total_articles: Number(campaign.total_artigos ?? safeArray(campaign.dados).length) || 0,
    campaign_snapshot: campaign,
    recipient_emails: recipients.map((item) => item.email),
    status: recipients.length ? "pending" : "no_recipients",
  };

  const { data, error } = await supabaseAdminClient
    .from(NOTIFICATIONS_TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (!error) return data;

  if (error.code === "23505") {
    return findExistingNotification({ source, campaignId: campaign.id, store: payload.store });
  }

  if (isTableMissing(error)) {
    throw new Error(
      "A migration campaign_end_notifications ainda não foi aplicada no Supabase. Aplica 20260926_campaign_end_notifications.sql antes do modo --send.",
    );
  }

  throw error;
}

async function updateNotification(id, patch) {
  const { data, error } = await supabaseAdminClient
    .from(NOTIFICATIONS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function processEndedCampaign({ source, campaign, endedOn, recipients, dryRun, sendEmails }) {
  const store = String(campaign.store || targetStore()).trim();
  const existing = await findExistingNotification({
    source,
    campaignId: campaign.id,
    store,
    allowMissingTable: dryRun,
  });

  if (existing?.status === "sent") {
    return {
      source,
      campaignId: campaign.id,
      title: campaign.titulo,
      endedOn,
      store,
      status: "already_sent",
      notificationId: existing.id,
      recipients: safeArray(existing.recipient_emails),
    };
  }

  if (dryRun || !sendEmails) {
    return {
      source,
      campaignId: campaign.id,
      title: campaign.titulo,
      endedOn,
      store,
      status: existing ? `would_retry_${existing.status}` : "would_send",
      notificationId: existing?.id || null,
      recipients: recipients.map((item) => item.email),
      totalArticles: Number(campaign.total_artigos ?? safeArray(campaign.dados).length) || 0,
    };
  }

  let notification = existing || (await createOrLoadNotification({ source, campaign, endedOn, recipients }));
  const delivered = new Set(safeArray(notification?.delivered_to).map(normalizeEmail).filter(Boolean));
  const currentRecipientEmails = recipients.map((item) => item.email);
  const providerMessageIds =
    notification?.provider_message_ids && typeof notification.provider_message_ids === "object"
      ? { ...notification.provider_message_ids }
      : {};
  const failures = {};

  if (!recipients.length) {
    notification = await updateNotification(notification.id, {
      status: "no_recipients",
      recipient_emails: [],
      error_message: `Não existem utilizadores confirmados associados à ${store}.`,
    });

    return {
      source,
      campaignId: campaign.id,
      title: campaign.titulo,
      endedOn,
      store,
      status: notification.status,
      notificationId: notification.id,
      recipients: [],
    };
  }

  await updateNotification(notification.id, {
    status: "pending",
    recipient_emails: currentRecipientEmails,
    error_message: "",
  });

  for (const recipient of recipients) {
    if (delivered.has(recipient.email)) continue;

    const message = buildEndEmail({
      campaign,
      notificationId: notification.id,
      endedOn,
      recipientName: recipient.firstName,
    });

    try {
      const result = await sendTransactionalEmail({
        to: recipient.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      delivered.add(recipient.email);
      providerMessageIds[recipient.email] = result?.id || result?.messageId || null;
    } catch (error) {
      failures[recipient.email] = error?.message || String(error);
    }
  }

  const deliveredCurrent = currentRecipientEmails.filter((email) => delivered.has(email));
  const allDelivered = deliveredCurrent.length === currentRecipientEmails.length;
  const status = allDelivered ? "sent" : deliveredCurrent.length ? "partial" : "error";
  const failureMessages = Object.entries(failures).map(([email, message]) => `${email}: ${message}`);

  notification = await updateNotification(notification.id, {
    status,
    delivered_to: [...delivered],
    failed_to: failures,
    provider_message_ids: providerMessageIds,
    sent_at: allDelivered ? new Date().toISOString() : notification.sent_at || null,
    error_message: failureMessages.join(" | ").slice(0, 4000),
  });

  return {
    source,
    campaignId: campaign.id,
    title: campaign.titulo,
    endedOn,
    store,
    status: notification.status,
    notificationId: notification.id,
    recipients: currentRecipientEmails,
    delivered: deliveredCurrent,
    failed: failures,
  };
}

export async function runCampaignEndNotificationWorker({ dryRun = true, sendEmails = false } = {}) {
  assertAdminClient();

  const store = targetStore();
  const timeZone = campaignTimezone();
  const today = getLocalIsoDate(timeZone);
  const recentEndDays = readPositiveInt(
    "CAMPAIGN_END_NOTIFY_LOOKBACK_DAYS",
    DEFAULT_RECENT_END_DAYS,
    { min: 1, max: 90 },
  );
  const campaignLookbackDays = readPositiveInt(
    "CAMPAIGN_END_CAMPAIGN_LOOKBACK_DAYS",
    DEFAULT_CAMPAIGN_LOOKBACK_DAYS,
    { min: 7, max: 730 },
  );
  const batchSize = readPositiveInt("CAMPAIGN_END_BATCH_SIZE", DEFAULT_BATCH_SIZE, {
    min: 1,
    max: 1000,
  });

  const [manualRows, automaticRows, recipients] = await Promise.all([
    listRecentCampaignRows(MANUAL_CAMPAIGNS_TABLE, MANUAL_SELECT, store, campaignLookbackDays, batchSize),
    listRecentCampaignRows(AUTOMATIC_CAMPAIGNS_TABLE, AUTOMATIC_SELECT, store, campaignLookbackDays, batchSize),
    listPraiaEmployeeRecipients(store),
  ]);

  const candidates = [
    ...manualRows.map((campaign) => ({ source: "manual", campaign })),
    ...automaticRows.map((campaign) => ({ source: "automatic", campaign })),
  ]
    .map((entry) => ({ ...entry, endedOn: getCampaignEndDate(entry.campaign) }))
    .filter((entry) => entry.endedOn)
    .filter((entry) => {
      const ageDays = differenceCalendarDays(today, entry.endedOn);
      return Number.isFinite(ageDays) && ageDays >= 1 && ageDays <= recentEndDays;
    })
    .sort((a, b) => a.endedOn.localeCompare(b.endedOn));

  const results = [];
  for (const candidate of candidates) {
    results.push(
      await processEndedCampaign({
        ...candidate,
        recipients,
        dryRun: Boolean(dryRun),
        sendEmails: Boolean(sendEmails) && !dryRun,
      }),
    );
  }

  return {
    ok: true,
    mode: dryRun || !sendEmails ? "dry-run" : "send",
    store,
    timeZone,
    localDate: today,
    recipients: recipients.map((item) => ({
      email: item.email,
      name: [item.firstName, item.lastName].filter(Boolean).join(" "),
      role: item.role,
    })),
    scanned: {
      manual: manualRows.length,
      automatic: automaticRows.length,
    },
    candidates: candidates.length,
    sent: results.filter((item) => item.status === "sent").length,
    alreadySent: results.filter((item) => item.status === "already_sent").length,
    results,
  };
}

export async function getCampaignEndNotificationById(id) {
  assertAdminClient();
  const safeId = String(id || "").trim();
  if (!safeId) return null;

  const { data, error } = await supabaseAdminClient
    .from(NOTIFICATIONS_TABLE)
    .select(
      "id,organization_id,campaign_source,campaign_id,store,ended_on,campaign_title,total_articles,campaign_snapshot,status,sent_at,created_at,updated_at",
    )
    .eq("id", safeId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export function toPublicCampaignEndNotification(row = {}) {
  const campaign = row.campaign_snapshot && typeof row.campaign_snapshot === "object"
    ? row.campaign_snapshot
    : {};

  return {
    id: row.id,
    source: row.campaign_source,
    store: row.store,
    endedOn: row.ended_on,
    title: row.campaign_title,
    totalArticles: row.total_articles,
    status: row.status,
    sentAt: row.sent_at,
    campaign: {
      id: campaign.id || row.campaign_id,
      titulo: campaign.titulo || row.campaign_title || "Campanha",
      dados: safeArray(campaign.dados),
      anoValidade: campaign.ano_validade || new Date().getFullYear(),
      formatoEtiqueta: campaign.formato_etiqueta || "a6",
      origem: campaign.origem || row.campaign_source,
      createdBy: campaign.created_by || "",
      createdByEmail: campaign.created_by_email || "",
      criadoEm: campaign.created_at || row.created_at,
      expiraEm: campaign.expires_at || "",
      totalArtigos: Number(campaign.total_artigos ?? row.total_articles) || 0,
      store: campaign.store || row.store,
      emailSubject: campaign.email_subject || "",
      emailFrom: campaign.email_from || "",
      emailReceivedAt: campaign.email_received_at || "",
      processedAt: campaign.processed_at || "",
      pdfUrl: campaign.pdf_url || "",
      pdfs: campaign.pdfs && typeof campaign.pdfs === "object" ? campaign.pdfs : {},
    },
  };
}
