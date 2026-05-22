function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).toLowerCase().trim());
}

function readNumber(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeUuid(value = "") {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : "";
}

function readList(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const AUTOMATIC_CAMPAIGN_BUCKET =
  process.env.AUTOMATIC_CAMPAIGN_BUCKET || "automatic-campaign-pdfs";

function readTimeoutMs(name, fallback) {
  const value = readNumber(name, fallback);
  return Math.max(1000, value);
}

function parseSmtpFallbacks(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [portPart, modePart] = item.split(":").map((part) => String(part || "").trim().toLowerCase());
      const port = Number.parseInt(portPart, 10);
      if (!Number.isFinite(port)) return null;
      const secure = ["ssl", "secure", "tls", "1", "true"].includes(modePart);
      const requireTLS = ["starttls", "tls-start", "start_tls"].includes(modePart);
      return { port, secure, requireTLS };
    })
    .filter(Boolean);
}

export const automaticCampaignStores = {
  praia: {
    key: "praia",
    store: process.env.CAMPAIGN_STORE_NAME_PRAIA || "Loja da Praia",
    label: process.env.CAMPAIGN_STORE_LABEL_PRAIA || "Praia",
    quantityColumn: "ae",
    email: process.env.CAMPAIGN_STORE_EMAIL_PRAIA || "",
  },
  angra: {
    key: "angra",
    store: process.env.CAMPAIGN_STORE_NAME_ANGRA || "Loja de Angra",
    label: process.env.CAMPAIGN_STORE_LABEL_ANGRA || "Angra",
    quantityColumn: "aea",
    email: process.env.CAMPAIGN_STORE_EMAIL_ANGRA || "",
  },
  valados: {
    key: "valados",
    store: process.env.CAMPAIGN_STORE_NAME_VALADOS || "Loja de Valados",
    label: process.env.CAMPAIGN_STORE_LABEL_VALADOS || "Valados",
    quantityColumn: "aev",
    email: process.env.CAMPAIGN_STORE_EMAIL_VALADOS || "",
  },
};

export function getAutomaticCampaignConfig() {
  return {
    debug: readBoolean("CAMPAIGN_EMAIL_DEBUG", false),
    enabled: readBoolean("CAMPAIGN_EMAIL_WORKER_ENABLED", false),
    intervalMs: readNumber("CAMPAIGN_EMAIL_WORKER_INTERVAL_MS", 5 * 60 * 1000),
    runOnStart: readBoolean("CAMPAIGN_EMAIL_WORKER_RUN_ON_START", false),
    markSeen: readBoolean("CAMPAIGN_EMAIL_MARK_SEEN", false),
    sendEmails: readBoolean("CAMPAIGN_EMAIL_SEND_ENABLED", false),
    emailProvider: String(process.env.CAMPAIGN_EMAIL_PROVIDER || "resend").toLowerCase().trim(),
    defaultFormat: process.env.CAMPAIGN_DEFAULT_FORMAT || "automatico",
    defaultTitle: process.env.CAMPAIGN_DEFAULT_TITLE || "PROMOÇÃO",
    titleFromEmail: readBoolean("CAMPAIGN_TITLE_FROM_EMAIL", false),
    dedupeEnabled: readBoolean("CAMPAIGN_DEDUPE_ENABLED", true),
    dedupeBySubject: readBoolean("CAMPAIGN_DEDUPE_BY_SUBJECT", true),
    reprocessErroredCampaigns: readBoolean("CAMPAIGN_REPROCESS_ERRORED", false),
    keepDays: Math.max(1, readNumber("AUTOMATIC_CAMPAIGN_HISTORY_DAYS", 5)),
    defaultOrganizationId: normalizeUuid(process.env.CAMPAIGN_DEFAULT_ORGANIZATION_ID || process.env.DEFAULT_ORGANIZATION_ID || ""),
    cleanup: {
      enabled: readBoolean("AUTOMATIC_CAMPAIGN_CLEANUP_ENABLED", true),
      maxAgeDays: Math.max(1, readNumber("AUTOMATIC_CAMPAIGN_CLEANUP_DAYS", readNumber("AUTOMATIC_CAMPAIGN_HISTORY_DAYS", 5))),
      batchSize: Math.min(500, Math.max(1, readNumber("AUTOMATIC_CAMPAIGN_CLEANUP_BATCH_SIZE", 100))),
    },
    pdfEngine: String(process.env.CAMPAIGN_PDF_ENGINE || "playwright").toLowerCase().trim(),
    allowApproxPdfFallback: readBoolean("CAMPAIGN_PDF_ALLOW_APPROX_FALLBACK", false),
    inbox: {
      host: process.env.CAMPAIGN_IMAP_HOST || "",
      port: readNumber("CAMPAIGN_IMAP_PORT", 993),
      secure: readBoolean("CAMPAIGN_IMAP_SECURE", true),
      user: process.env.CAMPAIGN_IMAP_USER || "",
      pass: process.env.CAMPAIGN_IMAP_PASS || "",
      mailbox: process.env.CAMPAIGN_IMAP_MAILBOX || "INBOX",
      mailboxes: readList("CAMPAIGN_IMAP_MAILBOXES"),
      autoDiscoverMailboxes: readBoolean("CAMPAIGN_IMAP_AUTO_DISCOVER_MAILBOXES", false),
      from: process.env.CAMPAIGN_EMAIL_FROM || "",
      subjectIncludes: readList("CAMPAIGN_EMAIL_SUBJECT_INCLUDES"),
      maxMessages: readNumber("CAMPAIGN_EMAIL_MAX_MESSAGES", 10),
      scanLimit: readNumber("CAMPAIGN_EMAIL_SCAN_LIMIT", Math.max(readNumber("CAMPAIGN_EMAIL_MAX_MESSAGES", 10) * 10, 100)),
      seenOnly: readBoolean("CAMPAIGN_EMAIL_SEEN_ONLY", false),
      unseenOnly: readBoolean("CAMPAIGN_EMAIL_UNSEEN_ONLY", true),
    },
    inbound: {
      provider: readBoolean("CAMPAIGN_RESEND_INBOUND_ENABLED", false) ? "resend" : "imap",
      resendEnabled: readBoolean("CAMPAIGN_RESEND_INBOUND_ENABLED", false),
    },
    emailApi: {
      provider: String(process.env.CAMPAIGN_EMAIL_PROVIDER || "resend").toLowerCase().trim(),
      apiKey: process.env.RESEND_API_KEY || process.env.CAMPAIGN_EMAIL_API_KEY || "",
      from: process.env.CAMPAIGN_EMAIL_FROM_ADDRESS || process.env.CAMPAIGN_SMTP_FROM || "",
      replyTo: process.env.CAMPAIGN_EMAIL_REPLY_TO || "",
      baseUrl: process.env.RESEND_API_BASE_URL || "https://api.resend.com",
      timeoutMs: readTimeoutMs("CAMPAIGN_EMAIL_API_TIMEOUT_MS", 30000),
      debug: readBoolean("CAMPAIGN_EMAIL_API_DEBUG", false),
    },
    smtp: {
      host: process.env.CAMPAIGN_SMTP_HOST || "",
      port: readNumber("CAMPAIGN_SMTP_PORT", 587),
      secure: readBoolean("CAMPAIGN_SMTP_SECURE", false),
      requireTLS: readBoolean("CAMPAIGN_SMTP_REQUIRE_TLS", true),
      user: process.env.CAMPAIGN_SMTP_USER || "",
      pass: process.env.CAMPAIGN_SMTP_PASS || "",
      from:
        process.env.CAMPAIGN_SMTP_FROM ||
        process.env.CAMPAIGN_SMTP_USER ||
        "",
      connectionTimeoutMs: readTimeoutMs("CAMPAIGN_SMTP_CONNECTION_TIMEOUT_MS", 30000),
      greetingTimeoutMs: readTimeoutMs("CAMPAIGN_SMTP_GREETING_TIMEOUT_MS", 30000),
      socketTimeoutMs: readTimeoutMs("CAMPAIGN_SMTP_SOCKET_TIMEOUT_MS", 60000),
      debug: readBoolean("CAMPAIGN_SMTP_DEBUG", false),
      fallbackEnabled: readBoolean("CAMPAIGN_SMTP_FALLBACK_ENABLED", true),
      fallbackAttempts: parseSmtpFallbacks(process.env.CAMPAIGN_SMTP_FALLBACKS || "465:ssl,587:starttls"),
    },
  };
}

export function hasInboxConfig(config = getAutomaticCampaignConfig()) {
  return Boolean(
    config?.inbox?.host && config?.inbox?.user && config?.inbox?.pass,
  );
}

export function hasEmailApiConfig(config = getAutomaticCampaignConfig()) {
  return Boolean(
    config?.emailProvider === "resend" &&
      config?.emailApi?.apiKey &&
      config?.emailApi?.from,
  );
}

export function hasSmtpConfig(config = getAutomaticCampaignConfig()) {
  return Boolean(
    config?.smtp?.host &&
      config?.smtp?.from &&
      (config?.smtp?.user ? config?.smtp?.pass : true),
  );
}
