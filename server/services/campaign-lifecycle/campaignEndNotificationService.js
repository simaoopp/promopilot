import { supabaseAdminClient, hasSupabaseAdminConfig } from "../../lib/supabaseClients.js";
import {
  deriveCampaignEndAt,
  formatCampaignEndDate,
} from "../../../src/shared/campaign-label/campaignLifecycle.js";

const MANUAL_TABLE = "campaigns";
const AUTOMATIC_TABLE = "automatic_campaigns";
const ARCHIVE_TABLE = "campaign_end_notifications";
const DEFAULT_STORE = "Loja da Praia";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function readNumber(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isTargetStore(value = "") {
  const target = normalizeText(process.env.CAMPAIGN_END_STORE_NAME || DEFAULT_STORE);
  const current = normalizeText(value);
  if (!target || !current) return false;

  // Tolerante a "Praia" / "Loja da Praia" sem abrir o envio a outras lojas.
  return current === target || (target.includes("praia") && current.includes("praia"));
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function codeOf(item = {}) {
  return String(item.codigo || item.artigo || item.article_code || "").trim();
}

function descriptionOf(item = {}) {
  return String(
    item.descricao ||
      item.description ||
      item.titulo_oficial ||
      item.title ||
      "",
  ).trim();
}

function priceOf(item = {}) {
  return item.atual ?? item.pvp2 ?? item.new_price ?? "";
}

function money(value) {
  if (value === null || value === undefined || value === "") return "—";

  let parsed;
  if (typeof value === "number") {
    parsed = value;
  } else {
    const text = String(value)
      .trim()
      .replace(/\s/g, "")
      .replace(/€/g, "");
    parsed = Number.parseFloat(
      text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text,
    );
  }

  if (!Number.isFinite(parsed)) return String(value);

  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(parsed);
}

function appBaseUrl() {
  return String(
    process.env.CAMPAIGN_END_APP_URL ||
      process.env.APP_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      "https://www.promopilot.pt",
  )
    .trim()
    .replace(/\/+$/, "");
}

function resendConfig() {
  return {
    apiKey: String(
      process.env.RESEND_API_KEY ||
        process.env.CAMPAIGN_EMAIL_API_KEY ||
        "",
    ).trim(),
    from: String(
      process.env.CAMPAIGN_END_EMAIL_FROM ||
        process.env.CAMPAIGN_EMAIL_FROM_ADDRESS ||
        process.env.CAMPAIGN_SMTP_FROM ||
        "",
    ).trim(),
    replyTo: String(
      process.env.CAMPAIGN_END_EMAIL_REPLY_TO ||
        process.env.CAMPAIGN_EMAIL_REPLY_TO ||
        "",
    ).trim(),
    baseUrl: String(
      process.env.RESEND_API_BASE_URL || "https://api.resend.com",
    )
      .trim()
      .replace(/\/+$/, ""),
    logoUrl: String(process.env.CAMPAIGN_END_LOGO_URL || "").trim(),
    timeoutMs: Math.max(
      5000,
      readNumber("CAMPAIGN_END_EMAIL_TIMEOUT_MS", 30000),
    ),
  };
}

function assertRuntimeConfig() {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error(
      "Supabase service role não configurado. Define SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
}

function normalizeCampaignRow(row = {}, sourceType = "manual") {
  const items = Array.isArray(row.dados) ? row.dados.filter(Boolean) : [];
  const endAt =
    row.campaign_end_at ||
    deriveCampaignEndAt({
      items,
      anoValidade: row.ano_validade,
      createdAt: row.created_at,
    }) ||
    null;

  return {
    sourceType,
    table: sourceType === "automatic" ? AUTOMATIC_TABLE : MANUAL_TABLE,
    id: String(row.id || "").trim(),
    organizationId: row.organization_id || null,
    title: String(
      row.titulo ||
        row.email_subject ||
        (sourceType === "automatic"
          ? "Campanha automática"
          : "Campanha"),
    ).trim(),
    items,
    yearValidity:
      Number.parseInt(row.ano_validade, 10) || new Date().getFullYear(),
    articleCount:
      typeof row.total_artigos === "number"
        ? row.total_artigos
        : items.length,
    store: String(row.store || "").trim(),
    createdAt: row.created_at || null,
    campaignEndAt: endAt,
    notificationStatus: row.end_notification_status || "",
    notificationSentAt: row.end_notification_sent_at || null,
    notificationAttempts:
      Number.parseInt(row.end_notification_attempts, 10) || 0,
    notificationRecipients: Array.isArray(row.end_notification_recipients)
      ? row.end_notification_recipients
      : [],
  };
}

async function loadCandidatesFromTable({
  table,
  sourceType,
  limit,
}) {
  const select =
    "id,organization_id,titulo,dados,ano_validade,created_at,campaign_end_at,total_artigos,store,end_notification_status,end_notification_sent_at,end_notification_message_id,end_notification_error,end_notification_attempts,end_notification_last_attempt_at,end_notification_recipients";

  const { data, error } = await supabaseAdminClient
    .from(table)
    .select(select)
    .is("end_notification_sent_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeCampaignRow(row, sourceType))
    .filter((campaign) => campaign.id && isTargetStore(campaign.store));
}

async function loadCandidates(limit) {
  const perTable = Math.max(10, Math.min(MAX_LIMIT, limit));

  const [manual, automatic] = await Promise.all([
    loadCandidatesFromTable({
      table: MANUAL_TABLE,
      sourceType: "manual",
      limit: perTable,
    }),
    loadCandidatesFromTable({
      table: AUTOMATIC_TABLE,
      sourceType: "automatic",
      limit: perTable,
    }),
  ]);

  return [...manual, ...automatic]
    .sort((a, b) => {
      const aa = a.campaignEndAt ? new Date(a.campaignEndAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bb = b.campaignEndAt ? new Date(b.campaignEndAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aa - bb;
    })
    .slice(0, limit);
}

async function loadPraiaProfiles(organizationId = null) {
  let query = supabaseAdminClient
    .from("profiles")
    .select("id,first_name,last_name,store,role");

  const { data: profiles, error: profileError } = await query;

  if (profileError) throw profileError;

  let safeProfiles = (Array.isArray(profiles) ? profiles : []).filter(
    (profile) => profile?.id && isTargetStore(profile?.store),
  );

  if (organizationId && safeProfiles.length) {
    const { data: memberships, error: membershipError } =
      await supabaseAdminClient
        .from("organization_members")
        .select("user_id,status")
        .eq("organization_id", organizationId)
        .eq("status", "active");

    if (!membershipError) {
      const memberIds = new Set(
        (Array.isArray(memberships) ? memberships : [])
          .map((row) => row?.user_id)
          .filter(Boolean),
      );
      safeProfiles = safeProfiles.filter((profile) =>
        memberIds.has(profile.id),
      );
    } else {
      // Em instalações antigas sem organization_members compatível,
      // a loja continua a ser a fronteira de segurança funcional.
      console.warn(
        "[campaign-end] Não foi possível filtrar organization_members:",
        membershipError.message || membershipError,
      );
    }
  }

  return safeProfiles;
}

async function loadRecipientEmails(organizationId = null) {
  const profiles = await loadPraiaProfiles(organizationId);
  if (!profiles.length) return [];

  const users = await Promise.all(
    profiles.map(async (profile) => {
      try {
        const { data, error } =
          await supabaseAdminClient.auth.admin.getUserById(profile.id);

        if (error) {
          console.warn(
            `[campaign-end] Não foi possível obter o email de ${profile.id}:`,
            error.message || error,
          );
          return null;
        }

        const email = String(data?.user?.email || "")
          .trim()
          .toLowerCase();

        if (!email) return null;

        return {
          id: profile.id,
          email,
          firstName: String(profile.first_name || "").trim(),
          lastName: String(profile.last_name || "").trim(),
          role: String(profile.role || "").trim(),
        };
      } catch (error) {
        console.warn(
          `[campaign-end] Falha ao resolver utilizador ${profile.id}:`,
          error?.message || error,
        );
        return null;
      }
    }),
  );

  const seen = new Set();
  return users.filter((user) => {
    if (!user?.email || seen.has(user.email)) return false;
    seen.add(user.email);
    return true;
  });
}

function buildEmailText({ campaign, recipient, detailsUrl }) {
  const lines = [
    `Olá${recipient?.firstName ? ` ${recipient.firstName}` : ""},`,
    "",
    `A campanha "${campaign.title}" terminou.`,
    `Loja: ${campaign.store || DEFAULT_STORE}`,
    `Data de fim: ${formatCampaignEndDate(campaign.campaignEndAt) || campaign.campaignEndAt}`,
    `Artigos: ${campaign.articleCount || campaign.items.length}`,
    "",
    "Ação recomendada: confirma a comunicação em loja e o preço atualmente ativo dos artigos.",
    "",
    "Artigos:",
    ...campaign.items.slice(0, 20).map((item) => {
      const code = codeOf(item) || "—";
      const description = descriptionOf(item) || "Sem descrição";
      const price = money(priceOf(item));
      return `• ${code} — ${description} — ${price}`;
    }),
    campaign.items.length > 20
      ? `… e mais ${campaign.items.length - 20} artigo(s).`
      : "",
    "",
    `Abrir campanha no PromoPilot: ${detailsUrl}`,
    "",
    "PromoPilot",
    "Campaign Operations",
  ];

  return lines.filter(Boolean).join("\n");
}

function buildArticleRows(campaign) {
  const visibleItems = campaign.items.slice(0, 12);

  return visibleItems
    .map((item) => {
      const code = escapeHtml(codeOf(item) || "—");
      const description = escapeHtml(descriptionOf(item) || "Sem descrição");
      const price = escapeHtml(money(priceOf(item)));

      return `
        <tr>
          <td style="padding:12px 10px;border-bottom:1px solid #edf1ef;font-size:13px;font-weight:700;color:#17211c;white-space:nowrap;">${code}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #edf1ef;font-size:13px;line-height:1.45;color:#53615a;">${description}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #edf1ef;font-size:13px;font-weight:700;color:#17211c;text-align:right;white-space:nowrap;">${price}</td>
        </tr>
      `;
    })
    .join("");
}

function buildEmailHtml({ campaign, recipient, detailsUrl }) {
  const config = resendConfig();
  const firstName = escapeHtml(recipient?.firstName || "");
  const greeting = firstName ? `Olá ${firstName},` : "Olá,";
  const endDate =
    formatCampaignEndDate(campaign.campaignEndAt) ||
    String(campaign.campaignEndAt || "—");
  const total = Number(campaign.articleCount || campaign.items.length || 0);
  const moreCount = Math.max(0, campaign.items.length - 12);

  const logo = config.logoUrl
    ? `
      <img
        src="${escapeHtml(config.logoUrl)}"
        alt="PromoPilot"
        width="190"
        style="display:block;width:190px;max-width:70%;height:auto;border:0;"
      />
    `
    : `
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#17211c;">
        Promo<span style="color:#147bd1;">Pilot</span>
      </div>
    `;

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#17211c;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      A campanha ${escapeHtml(campaign.title)} terminou. Consulta os artigos e fecha a operação em loja.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f4;padding:34px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 55px rgba(16,36,28,.10);">

            <tr>
              <td style="padding:28px 34px;border-bottom:1px solid #edf1ef;">
                ${logo}
              </td>
            </tr>

            <tr>
              <td style="padding:34px 34px 18px;">
                <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#eef8f3;color:#23754c;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">
                  Campanha concluída
                </div>

                <h1 style="margin:16px 0 10px;font-size:28px;line-height:1.22;color:#17211c;">
                  ${escapeHtml(campaign.title)}
                </h1>

                <p style="margin:0;font-size:15px;line-height:1.65;color:#65736b;">
                  ${greeting} esta campanha chegou ao fim. O PromoPilot preparou o resumo final para a equipa da <strong>${escapeHtml(campaign.store || DEFAULT_STORE)}</strong>.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:10px 34px 26px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="33.33%" style="padding:0 6px 0 0;">
                      <div style="padding:16px;border:1px solid #e9eeeb;border-radius:14px;background:#fafcfb;">
                        <div style="font-size:11px;color:#839087;text-transform:uppercase;font-weight:700;">Terminou</div>
                        <div style="margin-top:6px;font-size:14px;font-weight:800;color:#17211c;">${escapeHtml(endDate)}</div>
                      </div>
                    </td>
                    <td width="33.33%" style="padding:0 3px;">
                      <div style="padding:16px;border:1px solid #e9eeeb;border-radius:14px;background:#fafcfb;">
                        <div style="font-size:11px;color:#839087;text-transform:uppercase;font-weight:700;">Artigos</div>
                        <div style="margin-top:6px;font-size:20px;font-weight:800;color:#17211c;">${total}</div>
                      </div>
                    </td>
                    <td width="33.33%" style="padding:0 0 0 6px;">
                      <div style="padding:16px;border:1px solid #e9eeeb;border-radius:14px;background:#fafcfb;">
                        <div style="font-size:11px;color:#839087;text-transform:uppercase;font-weight:700;">Origem</div>
                        <div style="margin-top:6px;font-size:14px;font-weight:800;color:#17211c;">${campaign.sourceType === "automatic" ? "Email automático" : "Manual"}</div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 34px 28px;">
                <div style="padding:18px 20px;border-radius:15px;background:#f7f9f8;border-left:4px solid #147bd1;">
                  <div style="font-size:12px;font-weight:800;color:#17211c;text-transform:uppercase;letter-spacing:.04em;">Fecho operacional</div>
                  <p style="margin:7px 0 0;font-size:14px;line-height:1.6;color:#5d6b63;">
                    Confirma a retirada da comunicação promocional e valida o preço atualmente ativo dos artigos. O detalhe completo fica arquivado no PromoPilot.
                  </p>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 34px 8px;">
                <h2 style="margin:0 0 10px;font-size:17px;color:#17211c;">Artigos da campanha</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e8eeea;border-radius:14px;overflow:hidden;border-collapse:separate;border-spacing:0;">
                  <thead>
                    <tr style="background:#f7f9f8;">
                      <th align="left" style="padding:10px;font-size:11px;color:#78857e;text-transform:uppercase;">Código</th>
                      <th align="left" style="padding:10px;font-size:11px;color:#78857e;text-transform:uppercase;">Artigo</th>
                      <th align="right" style="padding:10px;font-size:11px;color:#78857e;text-transform:uppercase;">Preço promo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buildArticleRows(campaign)}
                  </tbody>
                </table>

                ${
                  moreCount > 0
                    ? `<p style="margin:10px 0 0;font-size:12px;color:#839087;">+ ${moreCount} artigo(s) disponíveis no detalhe completo.</p>`
                    : ""
                }
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:28px 34px 34px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:12px;background:#147bd1;">
                      <a
                        href="${escapeHtml(detailsUrl)}"
                        style="display:inline-block;padding:15px 26px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;border-radius:12px;"
                      >
                        Abrir campanha no PromoPilot
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:15px 0 0;font-size:11px;line-height:1.5;color:#9aa59f;">
                  O acesso ao detalhe requer autenticação no PromoPilot.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 34px;background:#fafbfa;border-top:1px solid #edf1ef;">
                <p style="margin:0;font-size:11px;line-height:1.6;color:#9aa59f;">
                  PromoPilot · Campaign Operations · Mensagem automática de fim de campanha
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
}

async function sendWithResend({
  to,
  subject,
  html,
  text,
}) {
  const config = resendConfig();

  if (!config.apiKey) {
    throw new Error(
      "RESEND_API_KEY não configurada para as notificações de fim de campanha.",
    );
  }

  if (!config.from) {
    throw new Error(
      "CAMPAIGN_END_EMAIL_FROM ou CAMPAIGN_EMAIL_FROM_ADDRESS não configurado.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const payload = {
      from: config.from,
      to: [to],
      subject,
      html,
      text,
    };

    if (config.replyTo) {
      payload.reply_to = config.replyTo;
    }

    const response = await fetch(`${config.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
      throw new Error(
        body?.message ||
          body?.error ||
          raw ||
          `Resend HTTP ${response.status}`,
      );
    }

    return {
      id: body?.id || body?.data?.id || "",
      response: body,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Timeout ao enviar email de fim de campanha após ${config.timeoutMs}ms.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getArchive(sourceType, campaignId) {
  const { data, error } = await supabaseAdminClient
    .from(ARCHIVE_TABLE)
    .select(
      "id,source_type,campaign_id,organization_id,title,items,year_validity,article_count,store,campaign_created_at,campaign_end_at,recipients,recipient_results,message_ids,sent_at,last_error,created_at,updated_at",
    )
    .eq("source_type", sourceType)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function ensureArchive(campaign, recipients) {
  const existing = await getArchive(campaign.sourceType, campaign.id);

  const basePayload = {
    source_type: campaign.sourceType,
    campaign_id: campaign.id,
    organization_id: campaign.organizationId || null,
    title: campaign.title || "Campanha",
    items: campaign.items,
    year_validity: campaign.yearValidity,
    article_count: campaign.articleCount,
    store: campaign.store,
    campaign_created_at: campaign.createdAt,
    campaign_end_at: campaign.campaignEndAt,
    recipients: recipients.map((recipient) => recipient.email),
    recipient_results:
      existing?.recipient_results &&
      typeof existing.recipient_results === "object"
        ? existing.recipient_results
        : {},
    message_ids:
      existing?.message_ids &&
      typeof existing.message_ids === "object"
        ? existing.message_ids
        : {},
    last_error: "",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdminClient
    .from(ARCHIVE_TABLE)
    .upsert(basePayload, {
      onConflict: "source_type,campaign_id",
    })
    .select(
      "id,source_type,campaign_id,organization_id,title,items,year_validity,article_count,store,campaign_created_at,campaign_end_at,recipients,recipient_results,message_ids,sent_at,last_error,created_at,updated_at",
    )
    .single();

  if (error) throw error;
  return data;
}

async function updateCampaignNotificationState(campaign, patch) {
  const { error } = await supabaseAdminClient
    .from(campaign.table)
    .update(patch)
    .eq("id", campaign.id);

  if (error) throw error;
}

async function updateArchive(id, patch) {
  const { data, error } = await supabaseAdminClient
    .from(ARCHIVE_TABLE)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(
      "id,source_type,campaign_id,recipient_results,message_ids,sent_at,last_error",
    )
    .single();

  if (error) throw error;
  return data;
}

async function processCampaign(campaign, { dryRun = false } = {}) {
  const now = new Date();
  const end = campaign.campaignEndAt
    ? new Date(campaign.campaignEndAt)
    : null;

  if (!end || !Number.isFinite(end.getTime())) {
    return {
      campaignId: campaign.id,
      sourceType: campaign.sourceType,
      store: campaign.store,
      status: "no-end-date",
    };
  }

  if (end.getTime() > now.getTime()) {
    if (!dryRun && campaign.notificationStatus !== "pending") {
      await updateCampaignNotificationState(campaign, {
        campaign_end_at: campaign.campaignEndAt,
        end_notification_status: "pending",
        end_notification_error: "",
      });
    }

    return {
      campaignId: campaign.id,
      sourceType: campaign.sourceType,
      title: campaign.title,
      store: campaign.store,
      campaignEndAt: campaign.campaignEndAt,
      status: "future",
    };
  }

  const recipients = await loadRecipientEmails(campaign.organizationId);

  if (dryRun) {
    return {
      campaignId: campaign.id,
      sourceType: campaign.sourceType,
      title: campaign.title,
      store: campaign.store,
      campaignEndAt: campaign.campaignEndAt,
      articleCount: campaign.articleCount,
      recipients: recipients.map((recipient) => recipient.email),
      status: "due",
    };
  }

  const attempt = campaign.notificationAttempts + 1;
  const attemptAt = new Date().toISOString();

  await updateCampaignNotificationState(campaign, {
    campaign_end_at: campaign.campaignEndAt,
    end_notification_status: "processing",
    end_notification_attempts: attempt,
    end_notification_last_attempt_at: attemptAt,
    end_notification_error: "",
  });

  if (!recipients.length) {
    const message =
      "Não foram encontrados utilizadores ativos associados à Loja da Praia.";

    await updateCampaignNotificationState(campaign, {
      end_notification_status: "error",
      end_notification_error: message,
      end_notification_recipients: [],
    });

    return {
      campaignId: campaign.id,
      sourceType: campaign.sourceType,
      title: campaign.title,
      status: "error",
      error: message,
    };
  }

  const archive = await ensureArchive(campaign, recipients);
  const recipientResults = {
    ...(archive?.recipient_results &&
    typeof archive.recipient_results === "object"
      ? archive.recipient_results
      : {}),
  };
  const messageIds = {
    ...(archive?.message_ids &&
    typeof archive.message_ids === "object"
      ? archive.message_ids
      : {}),
  };

  const detailsUrl = `${appBaseUrl()}/Homepage?endedCampaign=${encodeURIComponent(
    archive.id,
  )}`;

  const failures = [];
  const sentEmails = [];

  for (const recipient of recipients) {
    if (recipientResults[recipient.email]?.status === "sent") {
      sentEmails.push(recipient.email);
      continue;
    }

    try {
      const result = await sendWithResend({
        to: recipient.email,
        subject: `Campanha concluída · ${campaign.title}`,
        html: buildEmailHtml({
          campaign,
          recipient,
          detailsUrl,
        }),
        text: buildEmailText({
          campaign,
          recipient,
          detailsUrl,
        }),
      });

      recipientResults[recipient.email] = {
        status: "sent",
        sent_at: new Date().toISOString(),
        message_id: result.id || "",
      };
      messageIds[recipient.email] = result.id || "";
      sentEmails.push(recipient.email);

      // Persiste a cada destinatário: se o processo cair, não duplica
      // emails já enviados quando o worker for executado novamente.
      await updateArchive(archive.id, {
        recipient_results: recipientResults,
        message_ids: messageIds,
        last_error: "",
      });
    } catch (error) {
      const message = error?.message || String(error);

      recipientResults[recipient.email] = {
        status: "error",
        attempted_at: new Date().toISOString(),
        error: message,
      };
      failures.push({
        email: recipient.email,
        error: message,
      });

      await updateArchive(archive.id, {
        recipient_results: recipientResults,
        message_ids: messageIds,
        last_error: message,
      });
    }
  }

  if (failures.length) {
    const message = failures
      .map((failure) => `${failure.email}: ${failure.error}`)
      .join(" | ");

    await updateCampaignNotificationState(campaign, {
      end_notification_status: "error",
      end_notification_error: message.slice(0, 5000),
      end_notification_recipients: recipients.map(
        (recipient) => recipient.email,
      ),
    });

    await updateArchive(archive.id, {
      recipient_results: recipientResults,
      message_ids: messageIds,
      last_error: message.slice(0, 5000),
    });

    return {
      campaignId: campaign.id,
      sourceType: campaign.sourceType,
      title: campaign.title,
      notificationId: archive.id,
      status: "error",
      sentEmails,
      failures,
    };
  }

  const sentAt = new Date().toISOString();
  const allMessageIds = Object.values(messageIds).filter(Boolean);

  await updateArchive(archive.id, {
    recipient_results: recipientResults,
    message_ids: messageIds,
    sent_at: sentAt,
    last_error: "",
  });

  await updateCampaignNotificationState(campaign, {
    campaign_end_at: campaign.campaignEndAt,
    end_notification_status: "sent",
    end_notification_sent_at: sentAt,
    end_notification_message_id: allMessageIds.join(",").slice(0, 5000),
    end_notification_error: "",
    end_notification_recipients: recipients.map(
      (recipient) => recipient.email,
    ),
  });

  return {
    campaignId: campaign.id,
    sourceType: campaign.sourceType,
    title: campaign.title,
    notificationId: archive.id,
    campaignEndAt: campaign.campaignEndAt,
    recipients: recipients.map((recipient) => recipient.email),
    status: "sent",
  };
}

export async function runCampaignEndNotificationWorker({
  dryRun = false,
  limit = DEFAULT_LIMIT,
} = {}) {
  assertRuntimeConfig();

  const safeLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(limit) || DEFAULT_LIMIT),
  );

  const candidates = await loadCandidates(safeLimit);
  const results = [];

  for (const campaign of candidates) {
    try {
      results.push(
        await processCampaign(campaign, {
          dryRun,
        }),
      );
    } catch (error) {
      const message = error?.message || String(error);

      if (!dryRun) {
        try {
          await updateCampaignNotificationState(campaign, {
            campaign_end_at: campaign.campaignEndAt || null,
            end_notification_status: "error",
            end_notification_error: message.slice(0, 5000),
            end_notification_attempts:
              campaign.notificationAttempts + 1,
            end_notification_last_attempt_at:
              new Date().toISOString(),
          });
        } catch (updateError) {
          console.error(
            "[campaign-end] Falha a registar o erro da campanha:",
            updateError?.message || updateError,
          );
        }
      }

      results.push({
        campaignId: campaign.id,
        sourceType: campaign.sourceType,
        title: campaign.title,
        status: "error",
        error: message,
      });
    }
  }

  const summary = results.reduce(
    (acc, item) => {
      const key = item.status || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {},
  );

  return {
    ok: !results.some((item) => item.status === "error"),
    dryRun,
    targetStore: process.env.CAMPAIGN_END_STORE_NAME || DEFAULT_STORE,
    scanned: candidates.length,
    summary,
    results,
  };
}
