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
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET || process.env.CAMPAIGN_RESEND_WEBHOOK_SECRET || "",
    allowUnsignedInDev: readBoolean("CAMPAIGN_RESEND_INBOUND_ALLOW_UNSIGNED_DEV", false),
    maxTimestampSkewSeconds: Number.parseInt(process.env.RESEND_WEBHOOK_MAX_SKEW_SECONDS || "300", 10) || 300,
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

export function parseResendInboundPayload(rawBody) {
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

  const { text, html } = pickBody(data);
  const headers = data.headers || data.email_headers || {};
  const messageId =
    data.message_id ||
    data.messageId ||
    data.email_id ||
    data.id ||
    headers["message-id"] ||
    headers["Message-ID"] ||
    `resend-${Date.now()}`;

  return {
    ignored: false,
    eventType: eventType || "email.received",
    email: {
      messageId: String(messageId).trim(),
      subject: data.subject || "Campanha automática",
      from: normalizeAddress(data.from || data.sender),
      to: normalizeAddress(data.to || data.recipients),
      receivedAt: data.created_at || data.received_at || data.receivedAt || new Date().toISOString(),
      text,
      html,
      rawText: text || html,
      provider: "resend-inbound",
    },
  };
}
