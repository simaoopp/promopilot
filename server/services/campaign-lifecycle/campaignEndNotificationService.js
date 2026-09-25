import { supabaseAdminClient, hasSupabaseAdminConfig } from "../../lib/supabaseClients.js";
import { automaticCampaignStores, getAutomaticCampaignConfig } from "../automatic-campaigns/config.js";

const TABLES = [
  { table: "campaigns", type: "manual" },
  { table: "automatic_campaigns", type: "automatic" },
];

const SELECT = [
  "id","organization_id","titulo","dados","ano_validade","formato_etiqueta",
  "origem","created_by","created_by_email","created_at","expires_at",
  "total_artigos","store","campaign_end_date",
  "campaign_end_notification_status","campaign_end_notification_attempted_at",
  "campaign_end_notified_at","campaign_end_notification_error"
].join(",");

function assertAdmin() {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error("Supabase service role não configurado no servidor.");
  }
}

function todayAzores() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Atlantic/Azores",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

function targetStore() {
  return process.env.CAMPAIGN_END_NOTIFICATION_STORE ||
    automaticCampaignStores?.praia?.store ||
    "Loja da Praia";
}

function appUrl() {
  return String(
    process.env.APP_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    "https://www.promopilot.pt"
  ).trim().replace(/\/+$/, "");
}

function normalize(value = "") {
  return String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function isPraia(value) {
  return normalize(value) === normalize(targetStore());
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function itemsOf(campaign) {
  return Array.isArray(campaign?.dados) ? campaign.dados.filter(Boolean) : [];
}

function first(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function codeOf(item) {
  return first(item?.codigo, item?.artigo, item?.codigo_artigo, "—");
}

function descriptionOf(item) {
  return first(item?.descricao, item?.description, item?.titulo_oficial, "Artigo");
}

function priceBefore(item) {
  return first(item?.antes, item?.pvp2Antes, item?.pvp2_antes, item?.precoAntes, item?.pvp2);
}

function priceNow(item) {
  return first(item?.atual, item?.pvp2Atual, item?.pvp2_atual, item?.precoAtual, item?.pvp2p);
}

function eur(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  let number = Number(raw.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(number)) return raw;
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(number);
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "—");
}

function deepLink(campaign, type) {
  const url = new URL("/Homepage", `${appUrl()}/`);
  url.searchParams.set("campaignId", String(campaign.id));
  url.searchParams.set("campaignType", type);
  return url.toString();
}

function rowsHtml(campaign) {
  const items = itemsOf(campaign);
  const visible = items.slice(0, 35);
  const rows = visible.map((item) => `
    <tr>
      <td style="padding:12px 10px;border-bottom:1px solid #e9eef2;font-size:12px;font-weight:700;color:#18242c;white-space:nowrap;">${escapeHtml(codeOf(item))}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e9eef2;font-size:12px;color:#46545d;">${escapeHtml(descriptionOf(item))}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e9eef2;font-size:12px;color:#66737b;white-space:nowrap;text-align:right;">${escapeHtml(eur(priceBefore(item)))}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e9eef2;font-size:12px;font-weight:700;color:#147bd1;white-space:nowrap;text-align:right;">${escapeHtml(eur(priceNow(item)))}</td>
    </tr>`).join("");

  return rows + (items.length > visible.length ? `
    <tr><td colspan="4" style="padding:14px 10px;font-size:12px;color:#66737b;text-align:center;background:#f7f9fa;">
      + ${items.length - visible.length} artigo(s). Abre a campanha no PromoPilot para consultar a lista completa.
    </td></tr>` : "");
}

function htmlEmail({ campaign, type, recipientName }) {
  const items = itemsOf(campaign);
  const source = type === "automatic" ? "Automática por email" :
    String(campaign.origem || "").toLowerCase().includes("excel") ? "Importação Excel" : "Manual";
  const logo = String(process.env.PROMOPILOT_EMAIL_LOGO_URL || "").trim();

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#18242c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f8;padding:30px 14px;"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 18px 55px rgba(18,35,45,.10);">
    <tr><td style="padding:26px 30px;background:#101c24;">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="PromoPilot" width="180" style="display:block;max-width:70%;height:auto;border:0;">` : `<div style="font-size:21px;font-weight:800;color:#fff;">PromoPilot</div>`}
      <div style="margin-top:18px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7fc2ff;">Campaign Lifecycle</div>
      <h1 style="margin:7px 0 0;font-size:26px;line-height:1.25;color:#fff;">A campanha terminou</h1>
    </td></tr>
    <tr><td style="padding:28px 30px 12px;">
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#46545d;">${recipientName ? `Olá ${escapeHtml(recipientName)},` : "Olá,"}</p>
      <p style="margin:0;font-size:15px;line-height:1.65;color:#46545d;">
        A campanha <strong style="color:#18242c;">${escapeHtml(campaign.titulo || "Campanha")}</strong> chegou ao fim.
        Este aviso é enviado automaticamente apenas à equipa da <strong>Loja da Praia</strong>.
      </p>
    </td></tr>
    <tr><td style="padding:18px 30px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td width="33%" style="padding:14px;background:#f7f9fa;border-radius:14px 0 0 14px;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7b878f;font-weight:700;">Terminou em</div><div style="margin-top:5px;font-size:15px;font-weight:800;">${escapeHtml(formatDate(campaign.campaign_end_date))}</div></td>
        <td width="33%" style="padding:14px;background:#f7f9fa;border-left:1px solid #e7ecef;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7b878f;font-weight:700;">Artigos</div><div style="margin-top:5px;font-size:15px;font-weight:800;">${items.length}</div></td>
        <td width="34%" style="padding:14px;background:#f7f9fa;border-left:1px solid #e7ecef;border-radius:0 14px 14px 0;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7b878f;font-weight:700;">Origem</div><div style="margin-top:5px;font-size:15px;font-weight:800;">${escapeHtml(source)}</div></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:5px 30px 18px;"><div style="padding:14px 16px;border-left:4px solid #ec6707;background:#fff8f2;border-radius:8px 12px 12px 8px;">
      <div style="font-size:12px;font-weight:800;color:#7a3b0c;">Ação em loja</div>
      <div style="margin-top:4px;font-size:12px;line-height:1.55;color:#6a5749;">Confirma os artigos abaixo e atualiza ou remove a comunicação promocional que já não esteja em vigor.</div>
    </div></td></tr>
    <tr><td style="padding:0 30px 20px;">
      <div style="font-size:13px;font-weight:800;margin-bottom:10px;">Artigos da campanha</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e9eef2;border-radius:14px;overflow:hidden;border-collapse:separate;border-spacing:0;">
        <tr style="background:#f7f9fa;"><th align="left" style="padding:10px;font-size:10px;text-transform:uppercase;color:#7b878f;">Código</th><th align="left" style="padding:10px;font-size:10px;text-transform:uppercase;color:#7b878f;">Descrição</th><th align="right" style="padding:10px;font-size:10px;text-transform:uppercase;color:#7b878f;">Antes</th><th align="right" style="padding:10px;font-size:10px;text-transform:uppercase;color:#7b878f;">Campanha</th></tr>
        ${rowsHtml(campaign)}
      </table>
    </td></tr>
    <tr><td align="center" style="padding:6px 30px 30px;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#147bd1;border-radius:12px;">
        <a href="${escapeHtml(deepLink(campaign, type))}" style="display:inline-block;padding:14px 26px;color:#fff;text-decoration:none;font-size:14px;font-weight:800;border-radius:12px;">Ver campanha no PromoPilot</a>
      </td></tr></table>
      <p style="margin:12px 0 0;font-size:11px;color:#8a969d;">O botão abre diretamente os detalhes desta campanha.</p>
    </td></tr>
    <tr><td style="padding:18px 30px;background:#f8fafb;border-top:1px solid #e9eef2;"><p style="margin:0;font-size:11px;color:#8a969d;text-align:center;">Email operacional automático · PromoPilot · Loja da Praia</p></td></tr>
  </table></td></tr></table></body></html>`;
}

function textEmail({ campaign, type }) {
  const items = itemsOf(campaign);
  return [
    "PROMOPILOT — A CAMPANHA TERMINOU",
    "",
    `Campanha: ${campaign.titulo || "Campanha"}`,
    `Fim: ${formatDate(campaign.campaign_end_date)}`,
    `Artigos: ${items.length}`,
    "",
    ...items.slice(0, 35).map((item) => `- ${codeOf(item)} | ${descriptionOf(item)} | ${eur(priceBefore(item))} → ${eur(priceNow(item))}`),
    items.length > 35 ? `+ ${items.length - 35} artigo(s)` : "",
    "",
    `Ver campanha: ${deepLink(campaign, type)}`,
  ].filter(Boolean).join("\n");
}

async function authUsers() {
  const result = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = Array.isArray(data?.users) ? data.users : [];
    result.push(...users);
    if (users.length < 1000) break;
  }
  return result;
}

async function praiaRecipients() {
  const { data: profiles, error } = await supabaseAdminClient
    .from("profiles")
    .select("id,first_name,last_name,store,role")
    .eq("store", targetStore());
  if (error) throw error;

  const users = await authUsers();
  const byId = new Map(users.map((user) => [user.id, user]));

  return (profiles || []).map((profile) => {
    const user = byId.get(profile.id);
    const email = String(user?.email || "").trim().toLowerCase();
    const confirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at || user?.last_sign_in_at);
    if (!email || !confirmed || !isPraia(profile.store)) return null;
    return {
      id: profile.id,
      email,
      name: [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim(),
      role: profile.role || "user",
    };
  }).filter(Boolean);
}

function resendConfig() {
  const config = getAutomaticCampaignConfig();
  if (String(config.emailProvider || "").toLowerCase() !== "resend" ||
      !config.emailApi?.apiKey || !config.emailApi?.from) {
    throw new Error("Resend não configurado: CAMPAIGN_EMAIL_PROVIDER=resend, RESEND_API_KEY e CAMPAIGN_EMAIL_FROM_ADDRESS.");
  }
  return config;
}

async function sendOne({ campaign, type, recipient }) {
  const config = resendConfig();
  const endpoint = `${String(config.emailApi.baseUrl || "https://api.resend.com").replace(/\/+$/, "")}/emails`;
  const key = ["promopilot","campaign-end",type,campaign.id,recipient.id]
    .join("-").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 250);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(config.emailApi.timeoutMs || 30000));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.emailApi.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        from: config.emailApi.from,
        to: [recipient.email],
        subject: `Campanha terminada · ${campaign.titulo || "Promoção"}`,
        html: htmlEmail({ campaign, type, recipientName: recipient.name }),
        text: textEmail({ campaign, type }),
        ...(config.emailApi.replyTo ? { reply_to: config.emailApi.replyTo } : {}),
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
    if (!response.ok) throw new Error(`Resend (${response.status}): ${body?.message || body?.error || raw}`);
    return { email: recipient.email, id: body?.id || body?.data?.id || "" };
  } finally {
    clearTimeout(timer);
  }
}

async function resetStale(table) {
  const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabaseAdminClient.from(table).update({
    campaign_end_notification_status: "error",
    campaign_end_notification_error: "Tentativa anterior bloqueada; libertada automaticamente para retry.",
  }).eq("store", targetStore())
    .eq("campaign_end_notification_status", "sending")
    .is("campaign_end_notified_at", null)
    .lt("campaign_end_notification_attempted_at", stale);
}

async function dueRows(source, limit) {
  const { data, error } = await supabaseAdminClient.from(source.table)
    .select(SELECT)
    .eq("store", targetStore())
    .lt("campaign_end_date", todayAzores())
    .is("campaign_end_notified_at", null)
    .in("campaign_end_notification_status", ["pending", "error"])
    .order("campaign_end_date", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []).filter((row) => isPraia(row.store));
}

async function claim(source, row) {
  const { data, error } = await supabaseAdminClient.from(source.table).update({
    campaign_end_notification_status: "sending",
    campaign_end_notification_attempted_at: new Date().toISOString(),
    campaign_end_notification_error: "",
  }).eq("id", row.id)
    .is("campaign_end_notified_at", null)
    .in("campaign_end_notification_status", ["pending", "error"])
    .select(SELECT).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function markSent(source, row, ids) {
  const { error } = await supabaseAdminClient.from(source.table).update({
    campaign_end_notification_status: "sent",
    campaign_end_notified_at: new Date().toISOString(),
    campaign_end_notification_error: "",
    campaign_end_notification_provider_id: ids.filter(Boolean).join(",").slice(0, 2000),
  }).eq("id", row.id);
  if (error) throw error;
}

async function markError(source, row, error) {
  await supabaseAdminClient.from(source.table).update({
    campaign_end_notification_status: "error",
    campaign_end_notification_error: String(error?.message || error || "Erro desconhecido").slice(0, 4000),
  }).eq("id", row.id);
}

export async function runCampaignEndNotificationWorker({ dryRun = false, limit = 50 } = {}) {
  assertAdmin();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const recipients = await praiaRecipients();

  if (!dryRun && !recipients.length) {
    throw new Error("Não existem utilizadores ativos/confirmados associados à Loja da Praia.");
  }

  if (!dryRun) {
    for (const source of TABLES) await resetStale(source.table);
  }

  const summary = {
    ok: true, dryRun, dateAzores: todayAzores(), store: targetStore(),
    recipients: recipients.map(({ email, name, role }) => ({ email, name, role })),
    found: 0, sent: 0, failed: 0, skipped: 0, campaigns: [],
  };

  for (const source of TABLES) {
    const due = await dueRows(source, safeLimit);
    summary.found += due.length;

    for (const candidate of due) {
      if (dryRun) {
        summary.campaigns.push({
          id: candidate.id, type: source.type, title: candidate.titulo,
          endDate: candidate.campaign_end_date, articles: itemsOf(candidate).length,
          status: "would-send", url: deepLink(candidate, source.type),
        });
        continue;
      }

      const locked = await claim(source, candidate);
      if (!locked) { summary.skipped += 1; continue; }

      try {
        const deliveries = [];
        for (const recipient of recipients) {
          deliveries.push(await sendOne({ campaign: locked, type: source.type, recipient }));
        }
        await markSent(source, locked, deliveries.map((d) => d.id));
        summary.sent += 1;
        summary.campaigns.push({
          id: locked.id, type: source.type, title: locked.titulo,
          endDate: locked.campaign_end_date, articles: itemsOf(locked).length,
          recipients: deliveries.map((d) => d.email), status: "sent",
        });
      } catch (error) {
        await markError(source, locked, error).catch(() => {});
        summary.failed += 1;
        summary.campaigns.push({
          id: locked.id, type: source.type, title: locked.titulo,
          status: "error", error: error?.message || String(error),
        });
      }
    }
  }

  return summary;
}

export default runCampaignEndNotificationWorker;
