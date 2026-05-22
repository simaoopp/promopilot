import crypto from "node:crypto";

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).toLowerCase().trim());
}

function getHeader(headers = {}, name) {
  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (Array.isArray(direct)) return direct[0] || "";
  return String(direct || "");
}

function decodeSvixSecret(secret = "") {
  const normalized = String(secret || "").trim();
  const candidate = normalized.startsWith("whsec_") ? normalized.slice("whsec_".length) : normalized;

  try {
    return Buffer.from(candidate, "base64");
  } catch {
    return Buffer.from(normalized, "utf8");
  }
}

function timingSafeEqualBase64(a, b) {
  try {
    const left = Buffer.from(String(a || ""), "base64");
    const right = Buffer.from(String(b || ""), "base64");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function parseSvixSignatures(signatureHeader = "") {
  return String(signatureHeader || "")
    .split(" ")
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("v1,") ? part.slice(3) : part))
    .filter((part) => part && part !== "v1");
}

export function getResendInboundConfig() {
  return {
    enabled: readBoolean("CAMPAIGN_RESEND_INBOUND_ENABLED", false),
    apiKey: process.env.RESEND_API_KEY || "",
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET || process.env.CAMPAIGN_RESEND_WEBHOOK_SECRET || "",
    allowUnsignedInDev: readBoolean("CAMPAIGN_RESEND_INBOUND_ALLOW_UNSIGNED_DEV", false),
    maxTimestampSkewSeconds: Number.parseInt(process.env.RESEND_WEBHOOK_MAX_SKEW_SECONDS || "300", 10) || 300,
    fetchContentTimeoutMs: Number.parseInt(process.env.RESEND_INBOUND_FETCH_TIMEOUT_MS || "15000", 10) || 15000,
  };
}

export function verifyResendWebhookSignature({ rawBody, headers, config = getResendInboundConfig() }) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""));

  if (!config.webhookSecret) {
    if (process.env.NODE_ENV !== "production" && config.allowUnsignedInDev) {
      return { ok: true, skipped: true, reason: "Assinatura ignorada em desenvolvimento." };
    }

    return { ok: false, reason: "RESEND_WEBHOOK_SECRET em falta." };
  }

  const svixId = getHeader(headers, "svix-id");
  const svixTimestamp = getHeader(headers, "svix-timestamp");
  const svixSignature = getHeader(headers, "svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: "Headers Svix/Resend em falta." };
  }

  const timestampSeconds = Number.parseInt(svixTimestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > config.maxTimestampSkewSeconds) {
    return { ok: false, reason: "Timestamp do webhook fora da janela permitida." };
  }

  const signedPayload = `${svixId}.${svixTimestamp}.${body.toString("utf8")}`;
  const expected = crypto
    .createHmac("sha256", decodeSvixSecret(config.webhookSecret))
    .update(signedPayload)
    .digest("base64");

  const signatures = parseSvixSignatures(svixSignature);
  const valid = signatures.some((signature) => timingSafeEqualBase64(signature, expected));

  return valid ? { ok: true } : { ok: false, reason: "Assinatura inválida." };
}

function normalizeAddress(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(normalizeAddress).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const email = value.email || value.address || "";
    const name = value.name || "";
    return name && email ? `${name} <${email}>` : String(email || name || "");
  }
  return String(value);
}

function pickBody(data = {}) {
  const text = data.text || data.text_body || data.body_text || data.body?.text || data.content?.text || "";
  const html = data.html || data.html_body || data.body_html || data.body?.html || data.content?.html || "";
  return { text: String(text || ""), html: String(html || "") };
}

function extractResendApiError(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  return payload.message || payload.error || payload.name || JSON.stringify(payload).slice(0, 500);
}

async function fetchResendReceivedEmail(emailId, config = getResendInboundConfig()) {
  const normalizedEmailId = String(emailId || "").trim();
  if (!normalizedEmailId) return null;

  if (!config.apiKey) {
    throw new Error("RESEND_API_KEY em falta: o webhook email.received não traz o corpo do email; é obrigatório consultar a Receiving API da Resend pelo email_id.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.fetchContentTimeoutMs);

  try {
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(normalizedEmailId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const responseText = await response.text();
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = responseText;
    }

    if (!response.ok) {
      throw new Error(`Falha ao obter conteúdo do email recebido na Resend (${response.status}): ${extractResendApiError(payload)}`);
    }

    return payload?.data || payload || null;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Timeout ao obter conteúdo do email recebido na Resend.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function pickMessageId(source = {}, fallback = {}) {
  const headers = source.headers || fallback.headers || fallback.email_headers || {};
  return (
    source.message_id ||
    source.messageId ||
    fallback.message_id ||
    fallback.messageId ||
    fallback.email_id ||
    fallback.id ||
    source.id ||
    headers["message-id"] ||
    headers["Message-ID"] ||
    `resend-${Date.now()}`
  );
}

function buildEmailFromSources({ webhookData = {}, receivedEmail = null } = {}) {
  const source = receivedEmail || webhookData;
  const fallback = webhookData || {};
  const { text, html } = pickBody(source);
  const headers = source.headers || fallback.headers || fallback.email_headers || {};
  const messageId = pickMessageId(source, fallback);

  return {
    messageId: String(messageId).trim(),
    subject: source.subject || fallback.subject || "Campanha automática",
    from: normalizeAddress(source.from || fallback.from || fallback.sender),
    to: normalizeAddress(source.to || fallback.to || fallback.recipients),
    receivedAt: source.created_at || source.received_at || source.receivedAt || fallback.created_at || fallback.received_at || new Date().toISOString(),
    text,
    html,
    rawText: text || html,
    headers,
    provider: "resend-inbound",
    resendEmailId: fallback.email_id || source.id || "",
  };
}

export async function parseResendInboundPayload(rawBody, { config = getResendInboundConfig() } = {}) {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const payload = JSON.parse(body || "{}");
  const eventType = payload.type || payload.event || "";
  const data = payload.data || payload.email || payload;

  if (eventType && eventType !== "email.received") {
    return {
      ignored: true,
      eventType,
      reason: "Evento Resend ignorado.",
    };
  }

  const webhookBody = pickBody(data);
  const emailId = data.email_id || data.emailId || data.id || "";

  // A Resend envia o webhook com metadados; por desenho, o body/headers/anexos devem ser obtidos
  // pela Receiving API usando data.email_id. Mantemos fallback para payloads locais/testes.
  const shouldFetchContent = Boolean(emailId) && (!webhookBody.text || !webhookBody.html || process.env.RESEND_INBOUND_ALWAYS_FETCH !== "0");
  const receivedEmail = shouldFetchContent ? await fetchResendReceivedEmail(emailId, config) : null;
  const email = buildEmailFromSources({ webhookData: data, receivedEmail });

  if (!email.text && !email.html) {
    throw new Error("Email recebido pela Resend sem corpo disponível. Confirma RESEND_API_KEY e acesso à Receiving API.");
  }

  return {
    ignored: false,
    eventType: eventType || "email.received",
    email,
  };
}
