import { hasSupabaseAdminConfig, supabaseAdminClient } from "../../lib/supabaseClients.js";

const CAMPAIGN_SOURCES = [
  { table: "campaigns", type: "manual" },
  { table: "automatic_campaigns", type: "automatic" },
];

const ARCHIVE_TABLE = "campaign_end_notification_archive";

const CAMPAIGN_SELECT = [
  "id",
  "organization_id",
  "titulo",
  "dados",
  "ano_validade",
  "formato_etiqueta",
  "origem",
  "created_by",
  "created_by_email",
  "created_at",
  "expires_at",
  "total_artigos",
  "store",
  "campaign_end_date",
  "campaign_end_notification_status",
  "campaign_end_notification_attempted_at",
  "campaign_end_notified_at",
  "campaign_end_notification_error",
  "campaign_end_notification_provider_id",
].join(",");

const ARCHIVE_SELECT = [
  "id",
  "source_type",
  "campaign_id",
  "organization_id",
  "store",
  "campaign_title",
  "campaign_end_date",
  "campaign_snapshot",
  "recipients",
  "deliveries",
  "status",
  "attempts",
  "last_attempt_at",
  "sent_at",
  "error_message",
  "created_at",
  "updated_at",
].join(",");

function assertAdminClient() {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error("Supabase service role não configurado no worker de fim de campanha.");
  }
}

function readBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function targetStore() {
  return String(
    process.env.CAMPAIGN_END_STORE_NAME ||
      process.env.CAMPAIGN_END_NOTIFICATION_STORE ||
      "Loja da Praia",
  ).trim();
}

export function isPraiaCampaignStore(value = "") {
  const normalized = normalize(value);
  const configured = normalize(targetStore());
  return Boolean(
    normalized &&
      (normalized === configured || normalized === "praia" || normalized.includes("praia")),
  );
}

function appUrl() {
  return String(
    process.env.APP_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      "https://www.promopilot.pt",
  )
    .trim()
    .replace(/\/+$/, "");
}

function featureEnabled() {
  return readBoolean(process.env.CAMPAIGN_END_EMAIL_ENABLED, false);
}

function maxAttempts() {
  const parsed = Number.parseInt(process.env.CAMPAIGN_END_MAX_ATTEMPTS || "24", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 24;
}

function todayAzores() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Atlantic/Azores",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function first(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function campaignItems(campaign) {
  return Array.isArray(campaign?.dados) ? campaign.dados.filter(Boolean) : [];
}

function itemCode(item = {}) {
  return first(item.codigo, item.artigo, item.codigoArtigo, item.codigo_artigo, item.sku, "—");
}

function itemDescription(item = {}) {
  return first(item.descricao, item.description, item.titulo, item.titulo_oficial, "Artigo");
}

function itemBefore(item = {}) {
  return first(
    item.antes,
    item.pvp2Antes,
    item.pvp2_antes,
    item.pvp3,
    item.pv3,
    item.precoAntes,
    item.precoSemDescontoSelecionado,
  );
}

function itemPromo(item = {}) {
  return first(
    item.atual,
    item.pvp2Atual,
    item.pvp2_atual,
    item.precoAtual,
    item.precoComDescontoSelecionado,
    item.pvp2,
  );
}

function parseMoney(value) {
  const text = clean(value).replace(/\s/g, "").replace(/€/g, "");
  if (!text) return null;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function eur(value) {
  const number = parseMoney(value);
  if (number === null) return clean(value) || "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(number);
}

function formatDate(value) {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value) || "—";
}

function sourceLabel(campaign, type) {
  if (type === "automatic") return "Automática por email";
  return normalize(campaign?.origem).includes("excel") ? "Importação Excel" : "Manual";
}

function snapshotFor(campaign, type) {
  return {
    id: campaign.id,
    source: type,
    titulo: campaign.titulo || "Campanha",
    dados: campaignItems(campaign),
    anoValidade: campaign.ano_validade,
    formatoEtiqueta: campaign.formato_etiqueta,
    origem: campaign.origem,
    createdBy: campaign.created_by,
    createdByEmail: campaign.created_by_email,
    criadoEm: campaign.created_at,
    expiraEm: campaign.expires_at,
    totalArtigos: Number(campaign.total_artigos || campaignItems(campaign).length || 0),
    store: campaign.store,
    campaignEndDate: campaign.campaign_end_date,
  };
}

function deepLink(notificationId) {
  return `${appUrl()}/CampanhaTerminada/${encodeURIComponent(String(notificationId))}`;
}

function logoUrl() {
  return String(
    process.env.PROMOPILOT_EMAIL_LOGO_URL || `${appUrl()}/logo192.png`,
  ).trim();
}

function emailRows(campaign, maxRows = 24) {
  const items = campaignItems(campaign);
  const visible = items.slice(0, maxRows);
  const rows = visible
    .map(
      (item) => `
      <tr>
        <td style="padding:12px 10px;border-top:1px solid #e9eef2;font-size:12px;font-weight:700;color:#18242c;white-space:nowrap;">${escapeHtml(itemCode(item))}</td>
        <td style="padding:12px 10px;border-top:1px solid #e9eef2;font-size:12px;line-height:1.45;color:#46545d;">${escapeHtml(itemDescription(item))}</td>
        <td style="padding:12px 10px;border-top:1px solid #e9eef2;font-size:12px;color:#66737b;text-align:right;white-space:nowrap;">${escapeHtml(eur(itemBefore(item)))}</td>
        <td style="padding:12px 10px;border-top:1px solid #e9eef2;font-size:12px;font-weight:800;color:#147bd1;text-align:right;white-space:nowrap;">${escapeHtml(eur(itemPromo(item)))}</td>
      </tr>`,
    )
    .join("");

  if (items.length <= visible.length) return rows;

  return `${rows}
    <tr>
      <td colspan="4" style="padding:14px 10px;border-top:1px solid #e9eef2;background:#f7f9fa;font-size:12px;color:#66737b;text-align:center;">
        + ${items.length - visible.length} artigo(s). A lista completa está disponível no PromoPilot.
      </td>
    </tr>`;
}

function htmlEmail({ campaign, type, recipient, notificationId }) {
  const items = campaignItems(campaign);
  const title = campaign.titulo || "Campanha";
  const url = deepLink(notificationId);
  const logo = logoUrl();
  const source = sourceLabel(campaign, type);
  const recipientName = clean(recipient?.name).split(/\s+/)[0] || "";

  return `<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f2f5f7;font-family:Arial,Helvetica,sans-serif;color:#18242c;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">A campanha ${escapeHtml(title)} terminou. Consulta os artigos e conclui o fecho operacional em loja.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f2f5f7;padding:34px 14px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:720px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 55px rgba(18,35,45,.10);">
          <tr>
            <td style="padding:28px 32px 30px;background:#101c24;">
              <img src="${escapeHtml(logo)}" alt="PromoPilot" width="176" style="display:block;width:176px;max-width:68%;height:auto;border:0;outline:none;">
              <div style="margin-top:22px;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#78bfff;">Retail Operations · Campaign Lifecycle</div>
              <h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;color:#ffffff;font-weight:800;">Campanha concluída</h1>
              <p style="margin:9px 0 0;font-size:14px;line-height:1.55;color:#b8c5cc;">O período promocional terminou e a campanha entrou na fase de fecho operacional.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 10px;">
              <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#46545d;">${recipientName ? `Olá ${escapeHtml(recipientName)},` : "Olá,"}</p>
              <p style="margin:0;font-size:15px;line-height:1.65;color:#46545d;">
                A campanha <strong style="color:#18242c;">${escapeHtml(title)}</strong> terminou na <strong>Loja da Praia</strong>.
                Consulta os artigos abrangidos e confirma o fecho da comunicação promocional em loja.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="33%" style="padding:15px;background:#f7f9fa;border-radius:14px 0 0 14px;">
                    <div style="font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#7b878f;">Data de fim</div>
                    <div style="margin-top:6px;font-size:15px;font-weight:800;color:#18242c;">${escapeHtml(formatDate(campaign.campaign_end_date))}</div>
                  </td>
                  <td width="33%" style="padding:15px;background:#f7f9fa;border-left:1px solid #e7ecef;">
                    <div style="font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#7b878f;">Artigos</div>
                    <div style="margin-top:6px;font-size:15px;font-weight:800;color:#18242c;">${items.length}</div>
                  </td>
                  <td width="34%" style="padding:15px;background:#f7f9fa;border-left:1px solid #e7ecef;border-radius:0 14px 14px 0;">
                    <div style="font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#7b878f;">Origem</div>
                    <div style="margin-top:6px;font-size:14px;font-weight:800;color:#18242c;">${escapeHtml(source)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:3px 32px 20px;">
              <div style="padding:15px 17px;border-left:4px solid #ec6707;background:#fff8f2;border-radius:8px 13px 13px 8px;">
                <div style="font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#8a470f;">Fecho operacional</div>
                <div style="margin-top:6px;font-size:12px;line-height:1.6;color:#6d5747;">Retira a comunicação promocional expirada, confirma o preço em sistema e valida a exposição dos artigos antes da abertura seguinte.</div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 24px;">
              <div style="margin-bottom:10px;font-size:13px;font-weight:800;color:#18242c;">Artigos da campanha</div>
              <div style="overflow:hidden;border:1px solid #e9eef2;border-radius:14px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr style="background:#f7f9fa;">
                    <th align="left" style="padding:10px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#7b878f;">Código</th>
                    <th align="left" style="padding:10px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#7b878f;">Artigo</th>
                    <th align="right" style="padding:10px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#7b878f;">Antes</th>
                    <th align="right" style="padding:10px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#7b878f;">Promo</th>
                  </tr>
                  ${emailRows(campaign)}
                </table>
              </div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:3px 32px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="background:#147bd1;border-radius:12px;">
                  <a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 28px;border-radius:12px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">Abrir campanha no PromoPilot</a>
                </td></tr>
              </table>
              <p style="margin:12px 0 0;font-size:11px;line-height:1.5;color:#8a969d;">Consulta a lista completa, pesquisa artigos e copia todos os códigos num clique.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:19px 32px;background:#f8fafb;border-top:1px solid #e9eef2;">
              <p style="margin:0;font-size:10px;line-height:1.55;color:#8a969d;text-align:center;">Mensagem operacional automática · PromoPilot · Loja da Praia</p>
              <p style="margin:5px 0 0;font-size:10px;line-height:1.55;color:#a3adb3;text-align:center;">Enviada exclusivamente a colaboradores ativos associados à Loja da Praia.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function textEmail({ campaign, type, notificationId }) {
  const items = campaignItems(campaign);
  return [
    "PROMOPILOT — CAMPANHA CONCLUÍDA",
    "",
    `Campanha: ${campaign.titulo || "Campanha"}`,
    `Loja: ${campaign.store || "Loja da Praia"}`,
    `Fim: ${formatDate(campaign.campaign_end_date)}`,
    `Origem: ${sourceLabel(campaign, type)}`,
    `Artigos: ${items.length}`,
    "",
    "FECHO OPERACIONAL",
    "Retira a comunicação promocional expirada, confirma o preço em sistema e valida a exposição dos artigos.",
    "",
    ...items.slice(0, 35).map(
      (item) => `- ${itemCode(item)} | ${itemDescription(item)} | ${eur(itemBefore(item))} → ${eur(itemPromo(item))}`,
    ),
    items.length > 35 ? `+ ${items.length - 35} artigo(s) no PromoPilot.` : "",
    "",
    `Abrir campanha: ${deepLink(notificationId)}`,
    "",
    "PromoPilot · Retail Operations",
  ]
    .filter(Boolean)
    .join("\n");
}

function resendConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || process.env.CAMPAIGN_EMAIL_API_KEY || "").trim();
  const from = String(
    process.env.CAMPAIGN_END_EMAIL_FROM ||
      process.env.CAMPAIGN_EMAIL_FROM_ADDRESS ||
      process.env.CAMPAIGN_SMTP_FROM ||
      "",
  ).trim();
  const replyTo = String(
    process.env.CAMPAIGN_END_EMAIL_REPLY_TO || process.env.CAMPAIGN_EMAIL_REPLY_TO || "",
  ).trim();
  const baseUrl = String(process.env.RESEND_API_BASE_URL || "https://api.resend.com")
    .trim()
    .replace(/\/+$/, "");
  const timeout = Number.parseInt(process.env.CAMPAIGN_END_EMAIL_TIMEOUT_MS || "30000", 10);

  if (!apiKey || !from) {
    throw new Error("Resend não configurado. Define RESEND_API_KEY e CAMPAIGN_END_EMAIL_FROM.");
  }

  return {
    apiKey,
    from,
    replyTo,
    baseUrl,
    timeoutMs: Number.isFinite(timeout) ? Math.max(3000, timeout) : 30000,
  };
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = Array.isArray(data?.users) ? data.users : [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

async function listPraiaProfiles() {
  const { data, error } = await supabaseAdminClient
    .from("profiles")
    .select("id,first_name,last_name,store,role");
  if (error) throw error;
  return (data || []).filter((profile) => isPraiaCampaignStore(profile?.store));
}

async function allowedUserIdsForOrganization(organizationId, candidateIds) {
  if (!organizationId || !candidateIds.length) return new Set(candidateIds);

  const { data, error } = await supabaseAdminClient
    .from("organization_members")
    .select("user_id,status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("user_id", candidateIds);

  if (error) throw error;
  return new Set((data || []).map((row) => row.user_id).filter(Boolean));
}

async function recipientsForCampaign(campaign, directory) {
  const allowedIds = await allowedUserIdsForOrganization(
    campaign.organization_id,
    directory.profiles.map((profile) => profile.id),
  );

  return directory.profiles
    .filter((profile) => allowedIds.has(profile.id))
    .map((profile) => {
      const user = directory.authById.get(profile.id);
      const email = clean(user?.email).toLowerCase();
      const confirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
      if (!email || !confirmed) return null;
      return {
        id: profile.id,
        email,
        name: [profile.first_name, profile.last_name].map(clean).filter(Boolean).join(" "),
        role: clean(profile.role) || "user",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.email.localeCompare(b.email));
}

async function buildRecipientDirectory() {
  const [profiles, authUsers] = await Promise.all([listPraiaProfiles(), listAuthUsers()]);
  return {
    profiles,
    authById: new Map(authUsers.map((user) => [user.id, user])),
  };
}

async function getArchiveByCampaign({ type, campaign }) {
  const { data, error } = await supabaseAdminClient
    .from(ARCHIVE_TABLE)
    .select(ARCHIVE_SELECT)
    .eq("source_type", type)
    .eq("campaign_id", String(campaign.id))
    .eq("campaign_end_date", campaign.campaign_end_date)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function createOrRefreshArchive({ type, campaign, recipients }) {
  const existing = await getArchiveByCampaign({ type, campaign });
  const snapshot = snapshotFor(campaign, type);
  const recipientSnapshot = recipients.map(({ id, email, name, role }) => ({ id, email, name, role }));

  if (existing) {
    const { data, error } = await supabaseAdminClient
      .from(ARCHIVE_TABLE)
      .update({
        organization_id: campaign.organization_id || null,
        store: campaign.store || targetStore(),
        campaign_title: campaign.titulo || "Campanha",
        campaign_snapshot: snapshot,
        recipients: recipientSnapshot,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(ARCHIVE_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdminClient
    .from(ARCHIVE_TABLE)
    .insert({
      source_type: type,
      campaign_id: String(campaign.id),
      organization_id: campaign.organization_id || null,
      store: campaign.store || targetStore(),
      campaign_title: campaign.titulo || "Campanha",
      campaign_end_date: campaign.campaign_end_date,
      campaign_snapshot: snapshot,
      recipients: recipientSnapshot,
      deliveries: [],
      status: recipients.length ? "sending" : "waiting_recipients",
      attempts: 0,
      error_message: recipients.length ? "" : "Não existem colaboradores ativos/confirmados na Loja da Praia.",
    })
    .select(ARCHIVE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

function deliveryMap(deliveries) {
  const map = new Map();
  for (const delivery of Array.isArray(deliveries) ? deliveries : []) {
    if (delivery?.email) map.set(String(delivery.email).toLowerCase(), delivery);
  }
  return map;
}

async function saveArchiveState(archiveId, patch) {
  const { data, error } = await supabaseAdminClient
    .from(ARCHIVE_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", archiveId)
    .select(ARCHIVE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

async function sendOne({ campaign, type, recipient, archive }) {
  const config = resendConfig();
  const endpoint = `${config.baseUrl}/emails`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const idempotencyKey = [
    "promopilot",
    "campaign-end-v3",
    type,
    campaign.id,
    campaign.campaign_end_date,
    recipient.id,
  ]
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 250);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [recipient.email],
        subject: `Fim de campanha · ${campaign.titulo || "Promoção"} · Loja da Praia`,
        html: htmlEmail({ campaign, type, recipient, notificationId: archive.id }),
        text: textEmail({ campaign, type, notificationId: archive.id }),
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = { raw };
    }

    if (!response.ok) {
      throw new Error(`Resend (${response.status}): ${body?.message || body?.error || raw || "falha no envio"}`);
    }

    return {
      email: recipient.email,
      userId: recipient.id,
      status: "sent",
      providerId: body?.id || body?.data?.id || "",
      sentAt: new Date().toISOString(),
      error: "",
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Resend timeout após ${config.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function resetStaleClaims(table) {
  const staleBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdminClient
    .from(table)
    .update({
      campaign_end_notification_status: "error",
      campaign_end_notification_error: "Tentativa anterior bloqueada; libertada automaticamente para retry.",
    })
    .eq("campaign_end_notification_status", "sending")
    .is("campaign_end_notified_at", null)
    .lt("campaign_end_notification_attempted_at", staleBefore);
  if (error) throw error;
}

async function dueRows(source, limit) {
  const { data, error } = await supabaseAdminClient
    .from(source.table)
    .select(CAMPAIGN_SELECT)
    .lt("campaign_end_date", todayAzores())
    .is("campaign_end_notified_at", null)
    .in("campaign_end_notification_status", ["pending", "error"])
    .order("campaign_end_date", { ascending: true })
    .limit(limit);
  if (error) throw error;

  return (data || []).filter(
    (row) => row.campaign_end_date && isPraiaCampaignStore(row.store),
  );
}

async function claimCampaign(source, campaign) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdminClient
    .from(source.table)
    .update({
      campaign_end_notification_status: "sending",
      campaign_end_notification_attempted_at: now,
      campaign_end_notification_error: "",
    })
    .eq("id", campaign.id)
    .is("campaign_end_notified_at", null)
    .in("campaign_end_notification_status", ["pending", "error"])
    .select(CAMPAIGN_SELECT)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function markCampaignSent(source, campaign, deliveries) {
  const ids = deliveries.map((delivery) => delivery.providerId).filter(Boolean).join(",").slice(0, 2000);
  const { error } = await supabaseAdminClient
    .from(source.table)
    .update({
      campaign_end_notification_status: "sent",
      campaign_end_notified_at: new Date().toISOString(),
      campaign_end_notification_error: "",
      campaign_end_notification_provider_id: ids,
    })
    .eq("id", campaign.id);
  if (error) throw error;
}

async function markCampaignError(source, campaign, error) {
  const { error: updateError } = await supabaseAdminClient
    .from(source.table)
    .update({
      campaign_end_notification_status: "error",
      campaign_end_notification_error: clean(error?.message || error || "Erro desconhecido").slice(0, 4000),
    })
    .eq("id", campaign.id);
  if (updateError) throw updateError;
}

async function processCampaign({ source, campaign, directory }) {
  const recipients = await recipientsForCampaign(campaign, directory);
  let archive = await createOrRefreshArchive({ type: source.type, campaign, recipients });
  const attempts = Number(archive.attempts || 0) + 1;

  if (!recipients.length) {
    const message = "Não existem colaboradores ativos e confirmados associados à Loja da Praia nesta organização.";
    archive = await saveArchiveState(archive.id, {
      status: "waiting_recipients",
      attempts,
      last_attempt_at: new Date().toISOString(),
      error_message: message,
    });
    await markCampaignError(source, campaign, new Error(message));
    return { status: "waiting_recipients", archive, recipients: [], deliveries: [], errors: [message] };
  }

  const byEmail = deliveryMap(archive.deliveries);
  const deliveries = [...byEmail.values()];
  const errors = [];

  archive = await saveArchiveState(archive.id, {
    status: "sending",
    attempts,
    last_attempt_at: new Date().toISOString(),
    error_message: "",
  });

  for (const recipient of recipients) {
    const previous = byEmail.get(recipient.email.toLowerCase());
    if (previous?.status === "sent") continue;

    try {
      const delivery = await sendOne({ campaign, type: source.type, recipient, archive });
      byEmail.set(recipient.email.toLowerCase(), delivery);
    } catch (error) {
      const failed = {
        email: recipient.email,
        userId: recipient.id,
        status: "failed",
        providerId: "",
        sentAt: "",
        error: clean(error?.message || error || "Falha no envio").slice(0, 1000),
        attemptedAt: new Date().toISOString(),
      };
      byEmail.set(recipient.email.toLowerCase(), failed);
      errors.push(`${recipient.email}: ${failed.error}`);
    }

    archive = await saveArchiveState(archive.id, {
      deliveries: [...byEmail.values()],
    });
  }

  const finalDeliveries = [...byEmail.values()];
  const sentEmails = new Set(
    finalDeliveries.filter((delivery) => delivery.status === "sent").map((delivery) => delivery.email.toLowerCase()),
  );
  const allSent = recipients.every((recipient) => sentEmails.has(recipient.email.toLowerCase()));

  if (allSent) {
    const sentAt = new Date().toISOString();
    archive = await saveArchiveState(archive.id, {
      status: "sent",
      deliveries: finalDeliveries,
      sent_at: sentAt,
      error_message: "",
    });
    await markCampaignSent(source, campaign, finalDeliveries.filter((delivery) => delivery.status === "sent"));
    return { status: "sent", archive, recipients, deliveries: finalDeliveries, errors: [] };
  }

  const status = sentEmails.size ? "partial" : "failed";
  const message = errors.join(" | ") || "Nem todos os destinatários receberam o email.";
  archive = await saveArchiveState(archive.id, {
    status,
    deliveries: finalDeliveries,
    error_message: message.slice(0, 4000),
  });
  await markCampaignError(source, campaign, new Error(message));
  return { status, archive, recipients, deliveries: finalDeliveries, errors };
}

export async function getCampaignEndNotificationById(id) {
  assertAdminClient();
  const safeId = clean(id);
  if (!safeId) return null;

  const { data, error } = await supabaseAdminClient
    .from(ARCHIVE_TABLE)
    .select(ARCHIVE_SELECT)
    .eq("id", safeId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function runCampaignEndNotificationWorker({ dryRun = false, limit = 50 } = {}) {
  assertAdminClient();

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const enabled = featureEnabled();
  const directory = await buildRecipientDirectory();
  const summary = {
    ok: true,
    enabled,
    dryRun,
    dateAzores: todayAzores(),
    store: targetStore(),
    praiaProfiles: directory.profiles.length,
    found: 0,
    sent: 0,
    failed: 0,
    partial: 0,
    waitingRecipients: 0,
    skipped: 0,
    campaigns: [],
  };

  if (!dryRun && !enabled) {
    return {
      ...summary,
      disabled: true,
      message: "CAMPAIGN_END_EMAIL_ENABLED não está ativo. Nenhum email foi enviado.",
    };
  }

  if (!dryRun) {
    for (const source of CAMPAIGN_SOURCES) {
      await resetStaleClaims(source.table);
    }
  }

  let remaining = safeLimit;

  for (const source of CAMPAIGN_SOURCES) {
    if (remaining <= 0) break;
    const due = await dueRows(source, remaining);
    summary.found += due.length;
    remaining -= due.length;

    for (const candidate of due) {
      const recipients = await recipientsForCampaign(candidate, directory);

      if (dryRun) {
        summary.campaigns.push({
          id: candidate.id,
          type: source.type,
          title: candidate.titulo,
          endDate: candidate.campaign_end_date,
          articles: campaignItems(candidate).length,
          recipients: recipients.map((recipient) => recipient.email),
          status: recipients.length ? "would-send" : "waiting-recipients",
        });
        continue;
      }

      const existingArchive = await getArchiveByCampaign({ type: source.type, campaign: candidate });
      if (Number(existingArchive?.attempts || 0) >= maxAttempts() && existingArchive?.status !== "sent") {
        summary.skipped += 1;
        summary.campaigns.push({
          id: candidate.id,
          type: source.type,
          title: candidate.titulo,
          endDate: candidate.campaign_end_date,
          status: "max-attempts",
          attempts: existingArchive.attempts,
        });
        continue;
      }

      const claimed = await claimCampaign(source, candidate);
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }

      try {
        const result = await processCampaign({ source, campaign: claimed, directory });
        if (result.status === "sent") summary.sent += 1;
        else if (result.status === "partial") {
          summary.partial += 1;
          summary.failed += 1;
        } else if (result.status === "waiting_recipients") {
          summary.waitingRecipients += 1;
          summary.failed += 1;
        } else {
          summary.failed += 1;
        }

        summary.campaigns.push({
          id: claimed.id,
          type: source.type,
          title: claimed.titulo,
          endDate: claimed.campaign_end_date,
          articles: campaignItems(claimed).length,
          notificationId: result.archive?.id || "",
          recipients: result.recipients.map((recipient) => recipient.email),
          status: result.status,
          errors: result.errors,
        });
      } catch (error) {
        await markCampaignError(source, claimed, error).catch(() => {});
        summary.failed += 1;
        summary.campaigns.push({
          id: claimed.id,
          type: source.type,
          title: claimed.titulo,
          endDate: claimed.campaign_end_date,
          status: "error",
          error: error?.message || String(error),
        });
      }
    }
  }

  return summary;
}

export default runCampaignEndNotificationWorker;
