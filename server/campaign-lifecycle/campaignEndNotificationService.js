import {
  hasSupabaseAdminConfig,
  supabaseAdminClient,
} from "../../lib/supabaseClients.js";
import {
  getAutomaticCampaignConfig,
  hasEmailApiConfig,
} from "../automatic-campaigns/config.js";

const NOTIFICATION_TABLE = "campaign_end_notifications";
const DELIVERY_TABLE = "campaign_end_notification_deliveries";
const PROFILE_TABLE = "profiles";
const MEMBERSHIP_TABLE = "organization_members";
const STORES_TABLE = "stores";

const PRAIA_TOKEN = "praia";
const AZORES_TIME_ZONE = "Atlantic/Azores";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_ARTICLES_IN_EMAIL = 20;
const MAX_RECIPIENTS = 200;

function readBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;

  return ["1", "true", "yes", "sim", "on", "y"].includes(
    String(raw).trim().toLowerCase(),
  );
}

function readNumber(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isPraia(value = "") {
  return normalizeText(value).includes(PRAIA_TOKEN);
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value = "") {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function emailLogoUrl(appUrl) {
  const explicit = String(
    process.env.CAMPAIGN_END_EMAIL_LOGO_URL ||
      process.env.PROMOPILOT_EMAIL_LOGO_URL ||
      "",
  ).trim();

  return explicit || `${appUrl}/logo192.png`;
}

function formatDate(value, options = {}) {
  if (!value) return "";

  const date =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(String(value))
        ? new Date(`${value}T12:00:00Z`)
        : new Date(value);

  if (!Number.isFinite(date.getTime())) return String(value || "");

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: AZORES_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...options,
  }).format(date);
}

function currentAzoresDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AZORES_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${map.year}-${map.month}-${map.day}`;
}

function campaignSourceLabel(sourceType = "") {
  return String(sourceType || "").toLowerCase() === "automatic"
    ? "Campanha automática"
    : "Campanha";
}

function campaignSourceQueryValue(sourceType = "") {
  return String(sourceType || "").toLowerCase() === "automatic"
    ? "automatic"
    : "manual";
}

function buildCampaignUrl(notification, appUrl) {
  const id = encodeURIComponent(String(notification?.source_campaign_id || ""));
  const source = encodeURIComponent(
    campaignSourceQueryValue(notification?.source_type),
  );

  return `${appUrl}/Homepage?campaignId=${id}&campaignSource=${source}`;
}

function getItemCode(item = {}) {
  return String(
    item.codigo ??
      item.artigo ??
      item.codigoArtigo ??
      item.codigo_artigo ??
      item.code ??
      "",
  ).trim();
}

function getItemDescription(item = {}) {
  return String(
    item.descricao ??
      item.description ??
      item.titulo ??
      item.nome ??
      "",
  ).trim();
}

function getItemCurrentPrice(item = {}) {
  const value =
    item.atual ??
    item.precoAtual ??
    item.preco_atual ??
    item.pvp2 ??
    item.precoPromo ??
    item.preco_promo ??
    "";

  return String(value ?? "").trim();
}

function getItemPreviousPrice(item = {}) {
  const value =
    item.antes ??
    item.precoAnterior ??
    item.preco_anterior ??
    item.pvp3 ??
    "";

  return String(value ?? "").trim();
}

function getItemEndDate(item = {}) {
  return String(
    item.dataFim ??
      item.data_fim ??
      item.endDate ??
      item.end_date ??
      "",
  ).trim();
}

function getDisplayName(profile = {}, email = "") {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();

  if (full) return full;

  const local = String(email || "").split("@")[0] || "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function safeErrorMessage(error) {
  if (!error) return "Erro desconhecido.";
  return String(error?.message || error).trim().slice(0, 2000);
}

function assertAdminClient() {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não está configurada. O worker de fim de campanha precisa de service_role.",
    );
  }
}

export function getCampaignEndNotificationConfig() {
  const automaticConfig = getAutomaticCampaignConfig();
  const appUrl = publicAppUrl();

  return {
    // Seguro por defeito: ativa apenas quando a variável for colocada no Render.
    enabled: readBoolean("CAMPAIGN_END_NOTIFICATION_ENABLED", false),
    runOnStart: readBoolean("CAMPAIGN_END_NOTIFICATION_RUN_ON_START", true),
    intervalMs: clamp(
      readNumber("CAMPAIGN_END_NOTIFICATION_INTERVAL_MS", DEFAULT_INTERVAL_MS),
      60_000,
      24 * 60 * 60 * 1000,
    ),
    batchSize: clamp(
      readNumber("CAMPAIGN_END_NOTIFICATION_BATCH_SIZE", DEFAULT_BATCH_SIZE),
      1,
      100,
    ),
    maxArticlesInEmail: clamp(
      readNumber(
        "CAMPAIGN_END_NOTIFICATION_MAX_ARTICLES",
        DEFAULT_MAX_ARTICLES_IN_EMAIL,
      ),
      5,
      100,
    ),
    appUrl,
    logoUrl: emailLogoUrl(appUrl),
    email: {
      provider: "resend",
      apiKey:
        automaticConfig?.emailApi?.apiKey ||
        process.env.RESEND_API_KEY ||
        "",
      from:
        automaticConfig?.emailApi?.from ||
        process.env.CAMPAIGN_EMAIL_FROM_ADDRESS ||
        "",
      replyTo:
        automaticConfig?.emailApi?.replyTo ||
        process.env.CAMPAIGN_EMAIL_REPLY_TO ||
        "",
      baseUrl:
        automaticConfig?.emailApi?.baseUrl ||
        process.env.RESEND_API_BASE_URL ||
        "https://api.resend.com",
      timeoutMs: clamp(
        automaticConfig?.emailApi?.timeoutMs ||
          readNumber("CAMPAIGN_EMAIL_API_TIMEOUT_MS", 30_000),
        5_000,
        120_000,
      ),
    },
  };
}

async function listAllAuthUsers() {
  const users = [];
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const batch = Array.isArray(data?.users) ? data.users : [];
    users.push(...batch);

    if (batch.length < perPage) break;
  }

  return users;
}

async function loadPraiaStoreIds(organizationId) {
  if (!organizationId) return new Set();

  const { data, error } = await supabaseAdminClient
    .from(STORES_TABLE)
    .select("id,name,code,status")
    .eq("organization_id", organizationId);

  if (error) {
    // Compatibilidade com instalações onde a fundação SaaS existe mas stores
    // ainda não está a ser utilizada para atribuição de utilizadores.
    console.warn(
      "[campaign-end] não foi possível consultar stores:",
      error?.message || error,
    );
    return new Set();
  }

  return new Set(
    (Array.isArray(data) ? data : [])
      .filter(
        (store) =>
          String(store?.status || "active").toLowerCase() !== "disabled" &&
          (isPraia(store?.name) || isPraia(store?.code)),
      )
      .map((store) => String(store?.id || "").trim())
      .filter(Boolean),
  );
}

async function loadActiveMemberships(organizationId) {
  if (!organizationId) return [];

  const { data, error } = await supabaseAdminClient
    .from(MEMBERSHIP_TABLE)
    .select("user_id,store_id,status,role")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (error) throw error;

  return Array.isArray(data) ? data : [];
}

async function loadProfilesByIds(ids = []) {
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];

  if (!uniqueIds.length) return [];

  const rows = [];

  for (let offset = 0; offset < uniqueIds.length; offset += 200) {
    const chunk = uniqueIds.slice(offset, offset + 200);

    const { data, error } = await supabaseAdminClient
      .from(PROFILE_TABLE)
      .select("id,first_name,last_name,store,role,allowed_stores")
      .in("id", chunk);

    if (error) throw error;
    rows.push(...(Array.isArray(data) ? data : []));
  }

  return rows;
}

async function loadLegacyPraiaProfiles() {
  const { data, error } = await supabaseAdminClient
    .from(PROFILE_TABLE)
    .select("id,first_name,last_name,store,role,allowed_stores");

  if (error) throw error;

  return (Array.isArray(data) ? data : []).filter((profile) =>
    isPraia(profile?.store),
  );
}

async function resolvePraiaEmployeeRecipients(notification = {}) {
  const organizationId = notification?.organization_id || null;
  let profiles = [];
  let praiaMemberIds = new Set();

  if (organizationId) {
    const [memberships, praiaStoreIds] = await Promise.all([
      loadActiveMemberships(organizationId),
      loadPraiaStoreIds(organizationId),
    ]);

    const activeMemberIds = memberships
      .map((member) => String(member?.user_id || "").trim())
      .filter(Boolean);

    const activeMemberIdSet = new Set(activeMemberIds);
    const memberByUserId = new Map(
      memberships.map((member) => [String(member?.user_id || ""), member]),
    );

    profiles = await loadProfilesByIds(activeMemberIds);

    for (const profile of profiles) {
      const userId = String(profile?.id || "").trim();
      const membership = memberByUserId.get(userId);
      const primaryStoreIsPraia = isPraia(profile?.store);
      const membershipStoreIsPraia =
        membership?.store_id &&
        praiaStoreIds.has(String(membership.store_id));

      if (
        activeMemberIdSet.has(userId) &&
        (primaryStoreIsPraia || membershipStoreIsPraia)
      ) {
        praiaMemberIds.add(userId);
      }
    }
  } else {
    profiles = await loadLegacyPraiaProfiles();

    for (const profile of profiles) {
      const userId = String(profile?.id || "").trim();
      if (userId) praiaMemberIds.add(userId);
    }
  }

  if (!praiaMemberIds.size) return [];

  const profileById = new Map(
    profiles.map((profile) => [String(profile?.id || ""), profile]),
  );
  const authUsers = await listAllAuthUsers();
  const recipients = [];
  const seenEmails = new Set();

  for (const user of authUsers) {
    const userId = String(user?.id || "").trim();

    if (!praiaMemberIds.has(userId)) continue;

    const email = normalizeEmail(user?.email);
    if (!isValidEmail(email) || seenEmails.has(email)) continue;

    if (user?.banned_until) {
      const bannedUntil = new Date(user.banned_until);
      if (
        Number.isFinite(bannedUntil.getTime()) &&
        bannedUntil.getTime() > Date.now()
      ) {
        continue;
      }
    }

    const profile = profileById.get(userId) || {};

    recipients.push({
      userId,
      email,
      displayName: getDisplayName(profile, email),
      role: String(profile?.role || "").trim(),
      store: String(profile?.store || "").trim(),
    });
    seenEmails.add(email);

    if (recipients.length >= MAX_RECIPIENTS) break;
  }

  return recipients;
}

async function loadDueNotificationsForDryRun(limit) {
  const today = currentAzoresDateKey();

  const { data, error } = await supabaseAdminClient
    .from(NOTIFICATION_TABLE)
    .select(
      "id,source_type,source_campaign_id,organization_id,title,store,origin,campaign_year,items,total_items,end_date,status,attempt_count,last_attempt_at,notified_at,last_error,created_at",
    )
    .is("notified_at", null)
    .lt("end_date", today)
    .in("status", ["pending", "failed"])
    .lt("attempt_count", 5)
    .order("end_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return Array.isArray(data) ? data : [];
}

async function claimDueNotifications(limit) {
  const { data, error } = await supabaseAdminClient.rpc(
    "claim_campaign_end_notifications",
    { p_limit: limit },
  );

  if (error) {
    const hint =
      error?.code === "PGRST202" || /claim_campaign_end_notifications/i.test(error?.message || "")
        ? " Confirma que a migration supabase/migrations/20260920_campaign_end_notifications.sql foi aplicada."
        : "";

    throw new Error(
      `Não foi possível reclamar notificações de fim de campanha: ${error?.message || error}.${hint}`,
    );
  }

  return Array.isArray(data) ? data : [];
}

async function loadDeliveries(notificationId) {
  const { data, error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .select(
      "id,notification_id,user_id,email,display_name,status,attempt_count,provider_message_id,last_error,sent_at",
    )
    .eq("notification_id", notificationId);

  if (error) throw error;

  return Array.isArray(data) ? data : [];
}

async function ensureDeliveryRows(notificationId, recipients = []) {
  const existing = await loadDeliveries(notificationId);
  const byEmail = new Map(
    existing.map((row) => [normalizeEmail(row?.email), row]),
  );

  const missing = recipients
    .filter((recipient) => !byEmail.has(normalizeEmail(recipient.email)))
    .map((recipient) => ({
      notification_id: notificationId,
      user_id: recipient.userId || null,
      email: recipient.email,
      display_name: recipient.displayName || "",
      status: "pending",
      attempt_count: 0,
      last_error: "",
    }));

  if (missing.length) {
    const { error } = await supabaseAdminClient
      .from(DELIVERY_TABLE)
      .insert(missing);

    if (error) throw error;
  }

  return loadDeliveries(notificationId);
}

async function updateDelivery(id, patch) {
  const { error } = await supabaseAdminClient
    .from(DELIVERY_TABLE)
    .update(patch)
    .eq("id", id);

  if (error) throw error;
}

async function updateNotification(id, patch) {
  const { error } = await supabaseAdminClient
    .from(NOTIFICATION_TABLE)
    .update(patch)
    .eq("id", id);

  if (error) throw error;
}

function buildSubject(notification = {}) {
  const title = String(notification?.title || "Campanha").trim() || "Campanha";
  return `Campanha concluída · ${title}`;
}

function buildArticleRowsHtml(items = [], maxItems = DEFAULT_MAX_ARTICLES_IN_EMAIL) {
  const list = Array.isArray(items) ? items : [];
  const visible = list.slice(0, maxItems);

  if (!visible.length) {
    return `
      <tr>
        <td colspan="4" style="padding:18px 16px;color:#66736d;font-size:13px;text-align:center;">
          Esta campanha não tem artigos guardados no histórico.
        </td>
      </tr>
    `;
  }

  return visible
    .map((item) => {
      const code = getItemCode(item) || "—";
      const description = getItemDescription(item) || "Sem descrição";
      const before = getItemPreviousPrice(item) || "—";
      const current = getItemCurrentPrice(item) || "—";

      return `
        <tr>
          <td style="padding:12px 14px;border-top:1px solid #edf0ee;font-size:12px;font-weight:700;color:#17211c;white-space:nowrap;">
            ${escapeHtml(code)}
          </td>
          <td style="padding:12px 14px;border-top:1px solid #edf0ee;font-size:12px;color:#44534b;">
            ${escapeHtml(description)}
          </td>
          <td style="padding:12px 14px;border-top:1px solid #edf0ee;font-size:12px;color:#66736d;text-align:right;white-space:nowrap;">
            ${escapeHtml(before)}
          </td>
          <td style="padding:12px 14px;border-top:1px solid #edf0ee;font-size:12px;font-weight:700;color:#17211c;text-align:right;white-space:nowrap;">
            ${escapeHtml(current)}
          </td>
        </tr>
      `;
    })
    .join("");
}

function buildCampaignEndEmail({
  notification,
  recipient,
  campaignUrl,
  config,
}) {
  const title =
    String(notification?.title || "Campanha").trim() || "Campanha";
  const store = String(notification?.store || "Loja da Praia").trim();
  const sourceLabel = campaignSourceLabel(notification?.source_type);
  const totalItems = Math.max(
    Number(notification?.total_items || 0),
    Array.isArray(notification?.items) ? notification.items.length : 0,
  );
  const endDate = formatDate(notification?.end_date);
  const items = Array.isArray(notification?.items) ? notification.items : [];
  const hiddenCount = Math.max(0, items.length - config.maxArticlesInEmail);
  const firstName = String(recipient?.displayName || "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Olá ${escapeHtml(firstName)},` : "Olá,";
  const logo = config.logoUrl
    ? `<img src="${escapeHtml(config.logoUrl)}" alt="PromoPilot" width="176" style="display:block;width:176px;max-width:70%;height:auto;border:0;" />`
    : `<div style="font-size:22px;font-weight:800;color:#147bd1;">PromoPilot</div>`;

  const articleRows = buildArticleRowsHtml(
    items,
    config.maxArticlesInEmail,
  );

  const html = `
<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#17211c;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      A campanha ${escapeHtml(title)} terminou. Consulta os artigos e ações recomendadas.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7f6;padding:32px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 55px rgba(15,23,42,.10);">
            <tr>
              <td style="padding:28px 32px 22px;border-bottom:1px solid #edf0ee;">
                ${logo}
              </td>
            </tr>

            <tr>
              <td style="padding:30px 32px 18px;">
                <div style="font-size:11px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;color:#ec6707;margin-bottom:9px;">
                  Campanha concluída
                </div>

                <h1 style="margin:0 0 14px;font-size:28px;line-height:1.25;color:#17211c;">
                  ${escapeHtml(title)}
                </h1>

                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#44534b;">
                  ${greeting}
                </p>

                <p style="margin:0;font-size:15px;line-height:1.65;color:#66736d;">
                  A campanha terminou na <strong>${escapeHtml(store)}</strong>.
                  Confirma a retirada ou substituição da comunicação promocional e consulta os artigos abrangidos abaixo.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 32px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="33.33%" style="padding:13px 12px;background:#f7faf8;border-radius:12px 0 0 12px;">
                      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a9690;margin-bottom:4px;">Terminou</div>
                      <div style="font-size:13px;font-weight:700;color:#17211c;">${escapeHtml(endDate || "—")}</div>
                    </td>
                    <td width="33.33%" style="padding:13px 12px;background:#f7faf8;border-left:1px solid #e7ece9;">
                      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a9690;margin-bottom:4px;">Artigos</div>
                      <div style="font-size:13px;font-weight:700;color:#17211c;">${totalItems}</div>
                    </td>
                    <td width="33.33%" style="padding:13px 12px;background:#f7faf8;border-left:1px solid #e7ece9;border-radius:0 12px 12px 0;">
                      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a9690;margin-bottom:4px;">Origem</div>
                      <div style="font-size:13px;font-weight:700;color:#17211c;">${escapeHtml(sourceLabel)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:12px;background:#147bd1;">
                      <a href="${escapeHtml(campaignUrl)}" style="display:inline-block;padding:14px 24px;border-radius:12px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">
                        Abrir campanha no PromoPilot
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:10px 0 0;font-size:11px;line-height:1.5;color:#8a9690;">
                  O botão abre diretamente os detalhes desta campanha, após autenticação.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 28px;">
                <div style="padding:0 8px 10px;">
                  <h2 style="margin:0;font-size:16px;color:#17211c;">Artigos da campanha</h2>
                  <p style="margin:5px 0 0;font-size:12px;color:#7a8680;">
                    Referência rápida para validação em loja.
                  </p>
                </div>

                <div style="border:1px solid #e7ece9;border-radius:14px;overflow:hidden;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr style="background:#f7faf8;">
                      <th align="left" style="padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#718078;">Código</th>
                      <th align="left" style="padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#718078;">Descrição</th>
                      <th align="right" style="padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#718078;">Antes</th>
                      <th align="right" style="padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#718078;">Campanha</th>
                    </tr>
                    ${articleRows}
                  </table>
                </div>

                ${
                  hiddenCount > 0
                    ? `<p style="margin:10px 8px 0;font-size:12px;color:#7a8680;">
                         + ${hiddenCount} artigo${hiddenCount === 1 ? "" : "s"} disponível${hiddenCount === 1 ? "" : "eis"} nos detalhes da campanha.
                       </p>`
                    : ""
                }
              </td>
            </tr>

            <tr>
              <td style="padding:18px 32px;background:#fffaf6;border-top:1px solid #f3e7dc;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#8a684f;">
                  <strong>Ação recomendada:</strong> confirma que etiquetas, cartazes e restantes materiais promocionais desta campanha já não estão expostos como promoção ativa.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px;background:#fafbfa;border-top:1px solid #edf0ee;text-align:center;">
                <p style="margin:0;font-size:11px;line-height:1.6;color:#9aa49f;">
                  Notificação automática PromoPilot · enviada apenas a utilizadores atribuídos à Loja da Praia.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  const visibleItems = items.slice(0, config.maxArticlesInEmail);
  const articleLines = visibleItems.map((item) => {
    const code = getItemCode(item) || "—";
    const description = getItemDescription(item) || "Sem descrição";
    const current = getItemCurrentPrice(item);
    return `- ${code} | ${description}${current ? ` | ${current}` : ""}`;
  });

  const text = [
    firstName ? `Olá ${firstName},` : "Olá,",
    "",
    `A campanha "${title}" terminou na ${store}.`,
    endDate ? `Data de fim: ${endDate}.` : "",
    `Total de artigos: ${totalItems}.`,
    "",
    "Artigos:",
    ...(articleLines.length ? articleLines : ["- Sem artigos guardados."]),
    hiddenCount > 0
      ? `- ... e mais ${hiddenCount} artigo${hiddenCount === 1 ? "" : "s"}.`
      : "",
    "",
    `Abrir campanha: ${campaignUrl}`,
    "",
    "Ação recomendada: confirma a retirada ou substituição da comunicação promocional desta campanha em loja.",
    "",
    "PromoPilot",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    subject: buildSubject(notification),
    html,
    text,
  };
}

async function sendViaResend({
  recipient,
  notification,
  campaignUrl,
  config,
}) {
  const emailConfig = config.email;

  if (
    !emailConfig?.apiKey ||
    !emailConfig?.from ||
    !hasEmailApiConfig({
      emailProvider: "resend",
      emailApi: {
        apiKey: emailConfig.apiKey,
        from: emailConfig.from,
      },
    })
  ) {
    throw new Error(
      "Resend não configurado para notificações de fim de campanha. Confirma RESEND_API_KEY e CAMPAIGN_EMAIL_FROM_ADDRESS.",
    );
  }

  const content = buildCampaignEndEmail({
    notification,
    recipient,
    campaignUrl,
    config,
  });

  const payload = {
    from: emailConfig.from,
    to: [recipient.email],
    subject: content.subject,
    html: content.html,
    text: content.text,
    tags: [
      { name: "type", value: "campaign_end" },
      {
        name: "source",
        value: campaignSourceQueryValue(notification?.source_type),
      },
    ],
  };

  if (emailConfig.replyTo) {
    payload.reply_to = emailConfig.replyTo;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), emailConfig.timeoutMs);

  try {
    const response = await fetch(
      `${String(emailConfig.baseUrl || "https://api.resend.com").replace(/\/+$/, "")}/emails`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${emailConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );

    const raw = await response.text();
    let body = null;

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw };
    }

    if (!response.ok) {
      throw new Error(
        `Resend API ${response.status}: ${
          body?.message || body?.error || raw || response.statusText
        }`,
      );
    }

    return {
      id: body?.id || body?.data?.id || "",
      response: body,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Timeout no envio Resend após ${emailConfig.timeoutMs}ms.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function processNotification(notification, config, { dryRun = false } = {}) {
  if (!isPraia(notification?.store)) {
    if (!dryRun) {
      await updateNotification(notification.id, {
        status: "sent",
        notified_at: new Date().toISOString(),
        last_error: "Ignorada: a campanha não pertence à Loja da Praia.",
      });
    }

    return {
      id: notification?.id,
      campaignId: notification?.source_campaign_id,
      ok: true,
      skipped: true,
      reason: "Campanha fora da Loja da Praia.",
    };
  }

  const recipients = await resolvePraiaEmployeeRecipients(notification);
  const campaignUrl = buildCampaignUrl(notification, config.appUrl);

  if (dryRun) {
    return {
      id: notification?.id,
      campaignId: notification?.source_campaign_id,
      sourceType: notification?.source_type,
      title: notification?.title,
      store: notification?.store,
      endDate: notification?.end_date,
      totalItems: notification?.total_items,
      recipients: recipients.map((recipient) => ({
        email: recipient.email,
        displayName: recipient.displayName,
      })),
      recipientCount: recipients.length,
      campaignUrl,
      ok: true,
      skipped: true,
      dryRun: true,
    };
  }

  if (!recipients.length) {
    const message =
      "Não foram encontrados utilizadores ativos atribuídos à Loja da Praia.";

    await updateNotification(notification.id, {
      status: "failed",
      last_error: message,
    });

    return {
      id: notification.id,
      campaignId: notification.source_campaign_id,
      ok: false,
      skipped: false,
      error: message,
      recipients: 0,
    };
  }

  const deliveries = await ensureDeliveryRows(notification.id, recipients);
  const recipientByEmail = new Map(
    recipients.map((recipient) => [normalizeEmail(recipient.email), recipient]),
  );
  const relevantDeliveries = deliveries.filter((delivery) =>
    recipientByEmail.has(normalizeEmail(delivery?.email)),
  );

  let sent = 0;
  let alreadySent = 0;
  const failures = [];

  for (const delivery of relevantDeliveries) {
    const recipient = recipientByEmail.get(normalizeEmail(delivery.email));

    if (!recipient) continue;

    if (String(delivery?.status || "").toLowerCase() === "sent") {
      alreadySent += 1;
      continue;
    }

    const nextAttempt = Number(delivery?.attempt_count || 0) + 1;

    try {
      const result = await sendViaResend({
        recipient,
        notification,
        campaignUrl,
        config,
      });

      await updateDelivery(delivery.id, {
        user_id: recipient.userId || null,
        display_name: recipient.displayName || "",
        status: "sent",
        attempt_count: nextAttempt,
        provider_message_id: result?.id || null,
        last_error: "",
        sent_at: new Date().toISOString(),
      });

      sent += 1;
    } catch (error) {
      const message = safeErrorMessage(error);

      await updateDelivery(delivery.id, {
        user_id: recipient.userId || null,
        display_name: recipient.displayName || "",
        status: "failed",
        attempt_count: nextAttempt,
        last_error: message,
      }).catch((deliveryError) => {
        console.warn(
          "[campaign-end] falha a registar erro de delivery:",
          deliveryError?.message || deliveryError,
        );
      });

      failures.push({
        email: recipient.email,
        error: message,
      });
    }
  }

  if (failures.length) {
    const summary = failures
      .map((failure) => `${failure.email}: ${failure.error}`)
      .join(" | ")
      .slice(0, 2000);

    await updateNotification(notification.id, {
      status: "failed",
      last_error: summary,
    });

    return {
      id: notification.id,
      campaignId: notification.source_campaign_id,
      ok: false,
      skipped: false,
      sent,
      alreadySent,
      failed: failures.length,
      failures,
    };
  }

  await updateNotification(notification.id, {
    status: "sent",
    notified_at: new Date().toISOString(),
    last_error: "",
  });

  return {
    id: notification.id,
    campaignId: notification.source_campaign_id,
    ok: true,
    skipped: false,
    sent,
    alreadySent,
    recipients: relevantDeliveries.length,
  };
}

export async function runCampaignEndNotificationsOnce(options = {}) {
  assertAdminClient();

  const config = getCampaignEndNotificationConfig();
  const dryRun = Boolean(options?.dryRun);
  const batchSize = clamp(
    options?.limit || options?.batchSize || config.batchSize,
    1,
    100,
  );

  const notifications = dryRun
    ? await loadDueNotificationsForDryRun(batchSize)
    : await claimDueNotifications(batchSize);

  const processed = [];

  for (const notification of notifications) {
    try {
      processed.push(
        await processNotification(notification, config, { dryRun }),
      );
    } catch (error) {
      const message = safeErrorMessage(error);

      if (!dryRun && notification?.id) {
        await updateNotification(notification.id, {
          status: "failed",
          last_error: message,
        }).catch((updateError) => {
          console.error(
            "[campaign-end] não foi possível registar a falha:",
            updateError?.message || updateError,
          );
        });
      }

      processed.push({
        id: notification?.id,
        campaignId: notification?.source_campaign_id,
        ok: false,
        skipped: false,
        error: message,
      });
    }
  }

  return {
    ok: processed.every((item) => item?.ok !== false),
    dryRun,
    due: notifications.length,
    processed,
    config: {
      enabled: config.enabled,
      intervalMs: config.intervalMs,
      batchSize: config.batchSize,
      appUrl: config.appUrl,
      emailFromConfigured: Boolean(config.email?.from),
      resendConfigured: Boolean(config.email?.apiKey),
    },
  };
}
