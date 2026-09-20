import {
  hasSupabaseAdminConfig,
  supabaseAdminClient,
} from "../../lib/supabaseClients.js";

const CAMPAIGNS_TABLE = "automatic_campaigns";
const PROFILES_TABLE = "profiles";
const MEMBERS_TABLE = "organization_members";
const DEFAULT_STORE = "Loja da Praia";
const DEFAULT_APP_URL = "https://www.promopilot.pt";
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const PROCESSING_STALE_MS = 30 * 60 * 1000;

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;

  return ["1", "true", "yes", "sim", "on", "y"].includes(
    String(value).trim().toLowerCase(),
  );
}

function readInteger(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(process.env[name] || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function compact(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isPraiaStore(value = "", configuredStore = DEFAULT_STORE) {
  const normalized = normalizeText(value);
  const configured = normalizeText(configuredStore);

  if (!normalized) return false;
  if (configured && normalized === configured) return true;

  return normalized.includes("praia");
}

function buildCampaignUrl(campaignId, appBaseUrl) {
  const base = String(appBaseUrl || DEFAULT_APP_URL).trim().replace(/\/+$/, "");
  return `${base}/Homepage?campaign=${encodeURIComponent(String(campaignId || ""))}`;
}

function formatAzoresDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Atlantic/Azores",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function money(value) {
  if (value === null || value === undefined || value === "") return "";

  const normalized =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(/\s/g, "").replace(",", "."));

  if (!Number.isFinite(normalized)) return compact(value);

  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(normalized);
}

function getArticleCode(item = {}) {
  return compact(
    item.artigo ??
      item.codigo ??
      item.code ??
      item.reference ??
      item.referencia ??
      item.ref ??
      "",
  );
}

function getArticleDescription(item = {}) {
  return compact(
    item.descricao ??
      item.description ??
      item.descricao_oficial ??
      item.titulo_oficial ??
      item.nome ??
      item.title ??
      "",
  );
}

function getArticlePrice(item = {}) {
  const candidate =
    item.pvp_promocional ??
    item.preco_promocional ??
    item.precoPromo ??
    item.pvp2 ??
    item.preco ??
    item.price ??
    "";

  return money(candidate);
}

function normalizeCampaignItems(campaign = {}) {
  if (Array.isArray(campaign.dados)) return campaign.dados;

  if (typeof campaign.dados === "string") {
    try {
      const parsed = JSON.parse(campaign.dados);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function buildArticleRows(items = [], maxRows = 24) {
  const rows = items.slice(0, maxRows).map((item) => {
    const code = getArticleCode(item) || "—";
    const description = getArticleDescription(item) || "Artigo de campanha";
    const price = getArticlePrice(item);

    return `
      <tr>
        <td style="padding:12px 12px;border-bottom:1px solid #edf1ef;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#18231d;white-space:nowrap;">
          ${escapeHtml(code)}
        </td>
        <td style="padding:12px 12px;border-bottom:1px solid #edf1ef;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#53625a;">
          ${escapeHtml(description)}
        </td>
        <td align="right" style="padding:12px 12px;border-bottom:1px solid #edf1ef;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#18231d;white-space:nowrap;">
          ${price ? escapeHtml(price) : "—"}
        </td>
      </tr>`;
  });

  return rows.join("");
}

function buildEndEmail({ campaign, campaignUrl, recipients }) {
  const items = normalizeCampaignItems(campaign);
  const title = compact(campaign?.titulo || campaign?.email_subject || "Campanha promocional");
  const store = compact(campaign?.store || DEFAULT_STORE);
  const total = Number(campaign?.total_artigos) || items.length;
  const endAt = formatAzoresDate(campaign?.campaign_end_at);
  const createdAt = formatAzoresDate(campaign?.created_at);
  const maxRows = 24;
  const remaining = Math.max(0, items.length - maxRows);
  const articleRows = buildArticleRows(items, maxRows);

  const subject = `Campanha terminada · ${title}`;

  const html = `<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f3f6f4;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f4;padding:34px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(20,38,28,.10);">
            <tr>
              <td style="padding:30px 34px 24px;border-bottom:1px solid #edf1ef;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;color:#147bd1;">
                  PromoPilot · Campaign Lifecycle
                </div>
                <h1 style="margin:9px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:27px;line-height:1.25;color:#18231d;">
                  Campanha concluída
                </h1>
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#637168;">
                  A campanha <strong>${escapeHtml(title)}</strong> chegou ao fim na ${escapeHtml(store)}.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:26px 34px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="33.33%" valign="top" style="padding:0 8px 16px 0;">
                      <div style="padding:14px;border-radius:14px;background:#f7faf8;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#87938c;">Artigos</div>
                        <div style="margin-top:5px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#18231d;">${escapeHtml(total)}</div>
                      </div>
                    </td>
                    <td width="33.33%" valign="top" style="padding:0 8px 16px;">
                      <div style="padding:14px;border-radius:14px;background:#f7faf8;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#87938c;">Terminou</div>
                        <div style="margin-top:5px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.45;color:#18231d;">${escapeHtml(endAt)}</div>
                      </div>
                    </td>
                    <td width="33.33%" valign="top" style="padding:0 0 16px 8px;">
                      <div style="padding:14px;border-radius:14px;background:#f7faf8;">
                        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#87938c;">Criada</div>
                        <div style="margin-top:5px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.45;color:#18231d;">${escapeHtml(createdAt)}</div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:2px 34px 24px;">
                <div style="padding:16px 18px;border-radius:14px;background:#fff8f2;border:1px solid #fde3cf;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;color:#b85108;text-transform:uppercase;letter-spacing:.06em;">
                    Ação de loja
                  </div>
                  <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#6c4a34;">
                    Confirma a retirada da comunicação promocional associada a estes artigos e consulta a campanha antes de efetuar qualquer alteração operacional.
                  </p>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 34px 24px;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:17px;color:#18231d;">Artigos da campanha</h2>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e6ece8;border-radius:14px;border-collapse:separate;border-spacing:0;overflow:hidden;">
                  <tr style="background:#f7faf8;">
                    <th align="left" style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#7a8880;">Código</th>
                    <th align="left" style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#7a8880;">Artigo</th>
                    <th align="right" style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#7a8880;">Preço</th>
                  </tr>
                  ${articleRows || `
                    <tr>
                      <td colspan="3" style="padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7a8880;">
                        Consulta o detalhe da campanha no PromoPilot para ver a lista de artigos.
                      </td>
                    </tr>`}
                </table>

                ${remaining > 0 ? `
                  <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#87938c;">
                    + ${remaining} artigo${remaining === 1 ? "" : "s"} no detalhe da campanha.
                  </p>` : ""}
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:0 34px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:12px;background:#147bd1;">
                      <a href="${escapeHtml(campaignUrl)}" style="display:inline-block;padding:15px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">
                        Abrir campanha no PromoPilot
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:13px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#9aa49f;">
                  Notificação automática enviada apenas à equipa da Loja da Praia.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 34px;background:#fafcfb;border-top:1px solid #edf1ef;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.55;color:#9aa49f;">
                  PromoPilot · Gestão inteligente do ciclo de campanhas<br>
                  ID da campanha: ${escapeHtml(campaign?.id || "—")}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textItems = items
    .slice(0, maxRows)
    .map((item) => {
      const code = getArticleCode(item) || "—";
      const description = getArticleDescription(item) || "Artigo de campanha";
      const price = getArticlePrice(item);
      return `- ${code} · ${description}${price ? ` · ${price}` : ""}`;
    })
    .join("\n");

  const text = [
    "PROMOPILOT · CAMPANHA CONCLUÍDA",
    "",
    `${title}`,
    `Loja: ${store}`,
    `Terminou: ${endAt}`,
    `Total de artigos: ${total}`,
    "",
    "Artigos:",
    textItems || "Consulta o detalhe da campanha no PromoPilot.",
    remaining > 0 ? `+ ${remaining} artigo(s) no detalhe da campanha.` : "",
    "",
    `Abrir campanha: ${campaignUrl}`,
    "",
    `Destinatários: ${recipients.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

async function listAuthUsersById() {
  const map = new Map();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];

    for (const user of users) {
      if (!user?.id) continue;
      map.set(user.id, user);
    }

    if (users.length < 1000) break;
    page += 1;
  }

  return map;
}

async function listPraiaRecipients(campaign, config) {
  let query = supabaseAdminClient
    .from(PROFILES_TABLE)
    .select("id,store,role,first_name,last_name");

  const { data: profiles, error: profilesError } = await query;

  if (profilesError) throw profilesError;

  let candidates = (Array.isArray(profiles) ? profiles : []).filter((profile) =>
    isPraiaStore(profile?.store, config.storeName),
  );

  if (!candidates.length) return [];

  const organizationId = campaign?.organization_id || null;

  if (organizationId) {
    const ids = candidates.map((profile) => profile.id).filter(Boolean);

    if (ids.length) {
      const { data: memberships, error: membershipError } = await supabaseAdminClient
        .from(MEMBERS_TABLE)
        .select("user_id,status")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .in("user_id", ids);

      if (membershipError) throw membershipError;

      const activeIds = new Set(
        (Array.isArray(memberships) ? memberships : [])
          .map((row) => row?.user_id)
          .filter(Boolean),
      );

      candidates = candidates.filter((profile) => activeIds.has(profile.id));
    }
  }

  const authUsers = await listAuthUsersById();
  const emails = [];

  for (const profile of candidates) {
    const authUser = authUsers.get(profile.id);
    const email = compact(authUser?.email).toLowerCase();

    if (!email) continue;
    if (authUser?.banned_until) continue;

    emails.push(email);
  }

  return [...new Set(emails)];
}

async function sendResendEmail({ config, to, subject, html, text }) {
  if (!config.resendApiKey) {
    throw new Error(
      "RESEND_API_KEY não configurada para as notificações de fim de campanha.",
    );
  }

  if (!config.fromAddress) {
    throw new Error(
      "CAMPAIGN_EMAIL_FROM_ADDRESS (ou CAMPAIGN_END_EMAIL_FROM_ADDRESS) não configurado.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const payload = {
      from: config.fromAddress,
      to,
      subject,
      html,
      text,
    };

    if (config.replyTo) {
      payload.reply_to = config.replyTo;
    }

    const response = await fetch(
      `${config.resendBaseUrl.replace(/\/+$/, "")}/emails`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );

    const raw = await response.text();
    let body = {};

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw };
    }

    if (!response.ok) {
      const message =
        body?.message ||
        body?.error?.message ||
        body?.name ||
        raw ||
        response.statusText;

      const error = new Error(
        `Resend API falhou (${response.status}): ${message}`,
      );
      error.status = response.status;
      throw error;
    }

    return {
      id: body?.id || body?.data?.id || null,
      response: body,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Resend API timeout após ${config.timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function releaseStaleProcessing(config) {
  const threshold = new Date(Date.now() - PROCESSING_STALE_MS).toISOString();

  const { error } = await supabaseAdminClient
    .from(CAMPAIGNS_TABLE)
    .update({
      end_notification_status: "failed",
      end_notification_error:
        "Execução anterior interrompida antes de concluir o envio.",
    })
    .eq("end_notification_status", "processing")
    .lt("end_notification_last_attempt_at", threshold);

  if (error && config.debug) {
    console.warn(
      "[campaign-end] não foi possível libertar notificações stale:",
      error?.message || error,
    );
  }
}

async function listDueCampaigns({ limit, config }) {
  await releaseStaleProcessing(config);

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdminClient
    .from(CAMPAIGNS_TABLE)
    .select(
      "id,organization_id,titulo,dados,created_at,campaign_end_at,total_artigos,store,status,end_notification_status,end_notification_attempts,end_notification_last_attempt_at,email_subject",
    )
    .not("campaign_end_at", "is", null)
    .lte("campaign_end_at", nowIso)
    .in("end_notification_status", ["pending", "failed"])
    .order("campaign_end_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (Array.isArray(data) ? data : []).filter((campaign) =>
    isPraiaStore(campaign?.store, config.storeName),
  );
}

async function claimCampaign(campaign) {
  const attempts = Number(campaign?.end_notification_attempts || 0) + 1;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdminClient
    .from(CAMPAIGNS_TABLE)
    .update({
      end_notification_status: "processing",
      end_notification_attempts: attempts,
      end_notification_last_attempt_at: nowIso,
      end_notification_error: null,
    })
    .eq("id", campaign.id)
    .in("end_notification_status", ["pending", "failed"])
    .select("id")
    .maybeSingle();

  if (error) throw error;

  return Boolean(data?.id);
}

async function markCampaignSent(campaignId, recipients, messageId) {
  const { error } = await supabaseAdminClient
    .from(CAMPAIGNS_TABLE)
    .update({
      end_notification_status: "sent",
      end_notification_sent_at: new Date().toISOString(),
      end_notification_message_id: messageId || null,
      end_notification_error: null,
      end_notification_recipients: recipients,
    })
    .eq("id", campaignId);

  if (error) throw error;
}

async function markCampaignFailed(campaignId, error) {
  const message = compact(error?.message || error || "Falha desconhecida").slice(
    0,
    2000,
  );

  const { error: updateError } = await supabaseAdminClient
    .from(CAMPAIGNS_TABLE)
    .update({
      end_notification_status: "failed",
      end_notification_error: message,
      end_notification_last_attempt_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (updateError) {
    console.error(
      "[campaign-end] não foi possível registar falha:",
      updateError?.message || updateError,
    );
  }
}

export function getCampaignEndNotificationConfig() {
  return {
    enabled: readBoolean("CAMPAIGN_END_NOTIFICATION_ENABLED", false),
    runOnStart: readBoolean("CAMPAIGN_END_NOTIFICATION_RUN_ON_START", false),
    sendEnabled: readBoolean("CAMPAIGN_END_EMAIL_SEND_ENABLED", false),
    debug: readBoolean("CAMPAIGN_END_DEBUG", false),
    intervalMs: readInteger(
      "CAMPAIGN_END_NOTIFICATION_INTERVAL_MS",
      DEFAULT_INTERVAL_MS,
      { min: 60_000, max: 24 * 60 * 60 * 1000 },
    ),
    defaultLimit: readInteger("CAMPAIGN_END_NOTIFICATION_LIMIT", 20, {
      min: 1,
      max: 100,
    }),
    storeName:
      compact(process.env.CAMPAIGN_END_STORE_NAME) || DEFAULT_STORE,
    appBaseUrl:
      compact(
        process.env.APP_PUBLIC_URL ||
          process.env.PUBLIC_APP_URL ||
          process.env.FRONTEND_URL,
      ) || DEFAULT_APP_URL,
    resendApiKey: compact(process.env.RESEND_API_KEY),
    resendBaseUrl:
      compact(process.env.RESEND_API_BASE_URL) || "https://api.resend.com",
    fromAddress:
      compact(
        process.env.CAMPAIGN_END_EMAIL_FROM_ADDRESS ||
          process.env.CAMPAIGN_EMAIL_FROM_ADDRESS,
      ),
    replyTo: compact(
      process.env.CAMPAIGN_END_EMAIL_REPLY_TO ||
        process.env.CAMPAIGN_EMAIL_REPLY_TO,
    ),
    timeoutMs: readInteger("CAMPAIGN_END_EMAIL_TIMEOUT_MS", 20_000, {
      min: 3_000,
      max: 120_000,
    }),
  };
}

export async function runCampaignEndNotificationWorker({
  dryRun = false,
  limit,
} = {}) {
  if (!hasSupabaseAdminConfig() || !supabaseAdminClient) {
    throw new Error(
      "Supabase service role não configurado. Define SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const config = getCampaignEndNotificationConfig();
  const safeLimit = Math.min(
    100,
    Math.max(1, Number(limit) || config.defaultLimit),
  );

  const campaigns = await listDueCampaigns({
    limit: safeLimit,
    config,
  });

  const processed = [];

  for (const campaign of campaigns) {
    const base = {
      id: campaign.id,
      title: campaign.titulo || campaign.email_subject || "Campanha",
      store: campaign.store,
      endAt: campaign.campaign_end_at,
    };

    try {
      const recipients = await listPraiaRecipients(campaign, config);

      if (!recipients.length) {
        processed.push({
          ...base,
          ok: true,
          skipped: true,
          reason: "Sem funcionários ativos da Loja da Praia com email.",
          recipients: [],
        });
        continue;
      }

      const campaignUrl = buildCampaignUrl(campaign.id, config.appBaseUrl);
      const email = buildEndEmail({
        campaign,
        campaignUrl,
        recipients,
      });

      if (dryRun) {
        processed.push({
          ...base,
          ok: true,
          skipped: false,
          dryRun: true,
          recipients,
          subject: email.subject,
          campaignUrl,
          totalItems:
            Number(campaign.total_artigos) ||
            normalizeCampaignItems(campaign).length,
        });
        continue;
      }

      if (!config.sendEnabled) {
        processed.push({
          ...base,
          ok: true,
          skipped: true,
          reason:
            "Envio real desativado. Define CAMPAIGN_END_EMAIL_SEND_ENABLED=1.",
          recipients,
        });
        continue;
      }

      const claimed = await claimCampaign(campaign);

      if (!claimed) {
        processed.push({
          ...base,
          ok: true,
          skipped: true,
          reason: "Campanha já reclamada/processada por outra execução.",
          recipients,
        });
        continue;
      }

      try {
        const sent = await sendResendEmail({
          config,
          to: recipients,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });

        await markCampaignSent(campaign.id, recipients, sent.id);

        processed.push({
          ...base,
          ok: true,
          skipped: false,
          recipients,
          messageId: sent.id,
          campaignUrl,
        });
      } catch (sendError) {
        await markCampaignFailed(campaign.id, sendError);
        throw sendError;
      }
    } catch (error) {
      processed.push({
        ...base,
        ok: false,
        skipped: false,
        error: compact(error?.message || error || "Falha desconhecida"),
      });
    }
  }

  return {
    ok: processed.every((item) => item.ok !== false),
    dryRun: Boolean(dryRun),
    due: campaigns.length,
    processed,
    config: {
      enabled: config.enabled,
      sendEnabled: config.sendEnabled,
      intervalMs: config.intervalMs,
      storeName: config.storeName,
      appBaseUrl: config.appBaseUrl,
      fromConfigured: Boolean(config.fromAddress),
      resendConfigured: Boolean(config.resendApiKey),
    },
  };
}

export async function runCampaignEndNotificationsOnce(options = {}) {
  return runCampaignEndNotificationWorker({
    dryRun: !getCampaignEndNotificationConfig().sendEnabled,
    ...options,
  });
}
