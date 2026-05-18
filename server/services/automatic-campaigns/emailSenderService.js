import nodemailer from "nodemailer";
import { getAutomaticCampaignConfig, hasSmtpConfig } from "./config.js";

function uniqueAttempts(attempts = []) {
  const seen = new Set();
  return attempts.filter((attempt) => {
    const key = `${attempt.host}:${attempt.port}:${attempt.secure ? "secure" : "starttls"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSmtpAttempts(config) {
  const primary = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    requireTLS: config.smtp.requireTLS,
    label: "primary",
  };

  if (!config.smtp.fallbackEnabled) {
    return [primary];
  }

  const fallbacks = (config.smtp.fallbackAttempts || []).map((fallback) => ({
    host: config.smtp.host,
    port: fallback.port,
    secure: fallback.secure,
    requireTLS: fallback.requireTLS,
    label: `fallback-${fallback.port}-${fallback.secure ? "ssl" : "starttls"}`,
  }));

  return uniqueAttempts([primary, ...fallbacks]);
}

function createTransport(config, attempt) {
  const auth = config.smtp.user
    ? {
        user: config.smtp.user,
        pass: config.smtp.pass,
      }
    : undefined;

  return nodemailer.createTransport({
    host: attempt.host,
    port: attempt.port,
    secure: attempt.secure,
    requireTLS: !attempt.secure && Boolean(attempt.requireTLS),
    auth,
    connectionTimeout: config.smtp.connectionTimeoutMs,
    greetingTimeout: config.smtp.greetingTimeoutMs,
    socketTimeout: config.smtp.socketTimeoutMs,
    dnsTimeout: config.smtp.connectionTimeoutMs,
    logger: config.smtp.debug,
    debug: config.smtp.debug,
    family: 4,
    tls: {
      servername: attempt.host,
      minVersion: "TLSv1.2",
    },
  });
}

function buildEmailBody({ storeLabel, totalItems, subject }) {
  return [
    "Bom dia,",
    "",
    `Segue em anexo o PDF com as etiquetas de campanha para a loja ${storeLabel}.`,
    `Total de etiquetas: ${totalItems}.`,
    subject ? `Email de origem: ${subject}.` : "",
    "",
    "Cumprimentos,",
    "Sistema automático Expert Administração",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildErrorMessage(errors = []) {
  const compact = errors
    .map((error) => `${error.label || "smtp"} ${error.host}:${error.port} → ${error.message}`)
    .join(" | ");
  return compact || "Falha desconhecida no envio SMTP.";
}

export async function sendAutomaticCampaignEmail({ to, storeLabel, pdfBuffer, filename, totalItems, subject }) {
  const config = getAutomaticCampaignConfig();

  if (!hasSmtpConfig(config)) {
    throw new Error("SMTP não configurado. Define CAMPAIGN_SMTP_HOST, CAMPAIGN_SMTP_FROM e credenciais se necessário.");
  }

  if (!to) {
    throw new Error(`Email da loja ${storeLabel || ""} não configurado.`);
  }

  const messageSubject = `PROMOÇÃO - Etiquetas de campanha - ${storeLabel}`;
  const attempts = buildSmtpAttempts(config);
  const errors = [];

  for (const attempt of attempts) {
    const transporter = createTransport(config, attempt);

    if (config.debug || config.smtp.debug) {
      console.log(
        `[campanhas-automaticas] SMTP tentativa ${attempt.label}: ${attempt.host}:${attempt.port} secure=${attempt.secure} requireTLS=${!attempt.secure && Boolean(attempt.requireTLS)} to=${to}`,
      );
    }

    try {
      const result = await transporter.sendMail({
        from: config.smtp.from,
        to,
        subject: messageSubject,
        text: buildEmailBody({ storeLabel, totalItems, subject }),
        attachments: [
          {
            filename: filename || `etiquetas-${storeLabel || "loja"}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      if (config.debug || config.smtp.debug) {
        console.log(
          `[campanhas-automaticas] SMTP enviado com sucesso via ${attempt.host}:${attempt.port} messageId=${result?.messageId || "(sem id)"}`,
        );
      }

      return {
        ...result,
        smtpAttempt: {
          host: attempt.host,
          port: attempt.port,
          secure: attempt.secure,
          label: attempt.label,
        },
      };
    } catch (error) {
      errors.push({
        label: attempt.label,
        host: attempt.host,
        port: attempt.port,
        message: error?.message || String(error),
      });

      if (config.debug || config.smtp.debug) {
        console.warn(
          `[campanhas-automaticas] SMTP falhou via ${attempt.host}:${attempt.port}: ${error?.message || error}`,
        );
      }
    }
  }

  throw new Error(`Falha no envio SMTP após ${attempts.length} tentativa(s). ${buildErrorMessage(errors)}`);
}

export async function verifyAutomaticCampaignSmtp() {
  const config = getAutomaticCampaignConfig();

  if (!hasSmtpConfig(config)) {
    throw new Error("SMTP não configurado. Define CAMPAIGN_SMTP_HOST, CAMPAIGN_SMTP_FROM e credenciais se necessário.");
  }

  const attempts = buildSmtpAttempts(config);
  const errors = [];

  for (const attempt of attempts) {
    const transporter = createTransport(config, attempt);
    try {
      await transporter.verify();
      return {
        ok: true,
        attempt: {
          host: attempt.host,
          port: attempt.port,
          secure: attempt.secure,
          label: attempt.label,
        },
      };
    } catch (error) {
      errors.push({
        label: attempt.label,
        host: attempt.host,
        port: attempt.port,
        message: error?.message || String(error),
      });
    }
  }

  throw new Error(`Falha na verificação SMTP. ${buildErrorMessage(errors)}`);
}
