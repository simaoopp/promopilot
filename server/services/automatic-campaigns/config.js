function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "sim", "yes", "y", "on"].includes(String(value).toLowerCase().trim());
}

function readNumber(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function readList(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const AUTOMATIC_CAMPAIGN_BUCKET =
  process.env.AUTOMATIC_CAMPAIGN_BUCKET || "automatic-campaign-pdfs";

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
    enabled: readBoolean("CAMPAIGN_EMAIL_WORKER_ENABLED", false),
    intervalMs: readNumber("CAMPAIGN_EMAIL_WORKER_INTERVAL_MS", 5 * 60 * 1000),
    runOnStart: readBoolean("CAMPAIGN_EMAIL_WORKER_RUN_ON_START", false),
    markSeen: readBoolean("CAMPAIGN_EMAIL_MARK_SEEN", false),
    sendEmails: readBoolean("CAMPAIGN_EMAIL_SEND_ENABLED", false),
    defaultFormat: process.env.CAMPAIGN_DEFAULT_FORMAT || "automatico",
    defaultTitle: process.env.CAMPAIGN_DEFAULT_TITLE || "PROMO",
    keepDays: readNumber("AUTOMATIC_CAMPAIGN_HISTORY_DAYS", 2),
    inbox: {
      host: process.env.CAMPAIGN_IMAP_HOST || "",
      port: readNumber("CAMPAIGN_IMAP_PORT", 993),
      secure: readBoolean("CAMPAIGN_IMAP_SECURE", true),
      user: process.env.CAMPAIGN_IMAP_USER || "",
      pass: process.env.CAMPAIGN_IMAP_PASS || "",
      mailbox: process.env.CAMPAIGN_IMAP_MAILBOX || "INBOX",
      from: process.env.CAMPAIGN_EMAIL_FROM || "",
      subjectIncludes: readList("CAMPAIGN_EMAIL_SUBJECT_INCLUDES"),
      maxMessages: readNumber("CAMPAIGN_EMAIL_MAX_MESSAGES", 10),
      seenOnly: readBoolean("CAMPAIGN_EMAIL_SEEN_ONLY", false),
      unseenOnly: readBoolean("CAMPAIGN_EMAIL_UNSEEN_ONLY", true),
    },
    smtp: {
      host: process.env.CAMPAIGN_SMTP_HOST || "",
      port: readNumber("CAMPAIGN_SMTP_PORT", 587),
      secure: readBoolean("CAMPAIGN_SMTP_SECURE", false),
      user: process.env.CAMPAIGN_SMTP_USER || "",
      pass: process.env.CAMPAIGN_SMTP_PASS || "",
      from:
        process.env.CAMPAIGN_SMTP_FROM ||
        process.env.CAMPAIGN_SMTP_USER ||
        "",
    },
  };
}

export function hasInboxConfig(config = getAutomaticCampaignConfig()) {
  return Boolean(
    config?.inbox?.host && config?.inbox?.user && config?.inbox?.pass,
  );
}

export function hasSmtpConfig(config = getAutomaticCampaignConfig()) {
  return Boolean(
    config?.smtp?.host &&
      config?.smtp?.from &&
      (config?.smtp?.user ? config?.smtp?.pass : true),
  );
}
