import nodemailer from "nodemailer";
import { getAutomaticCampaignConfig, hasEmailApiConfig, hasSmtpConfig } from "./config.js";

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

function normalizePvpUpdateCodes(codes = []) {
  const source = Array.isArray(codes)
    ? codes
    : String(codes || "").split(/[|,;\n]+/);

  return [...new Set(source.map((code) => String(code || "").trim()).filter(Boolean))];
}

function buildEmailBody({ storeLabel, totalItems, subject, pvpUpdateCodes = [], hasPdf = false }) {
  const codes = normalizePvpUpdateCodes(pvpUpdateCodes);
  const lines = [
    "Bom dia,",
    "",
  ];

  if (hasPdf) {
    lines.push(
      `Segue em anexo o PDF com as etiquetas de campanha para a loja ${storeLabel}.`,
      `Total de etiquetas: ${Number(totalItems || 0)}.`,
    );
  } else {
    lines.push(
      `Não existem etiquetas promocionais para gerar para a loja ${storeLabel}.`,
      "Total de etiquetas: 0.",
    );
  }

  if (codes.length) {
    lines.push(
      "",
      "ATUALIZAÇÃO/REPOSIÇÃO PVP — artigos excluídos da promoção:",
      codes.join("|"),
      "Estes códigos não foram incluídos nas etiquetas promocionais.",
    );
  }

  if (subject) {
    lines.push("", `Email de origem: ${subject}.`);
  }

  lines.push(
    "",
    "Cumprimentos,",
    "Sistema automático Expert Administração",
  );

  return lines.join("\n");
}

function buildEmailHtml({ storeLabel, totalItems, subject, pvpUpdateCodes = [], hasPdf = false }) {
  const codes = normalizePvpUpdateCodes(pvpUpdateCodes);
  const codeText = codes.join("|");

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>Bom dia,</p>
      ${hasPdf
        ? `<p>Segue em anexo o PDF com as etiquetas de campanha para a loja <strong>${escapeHtml(storeLabel)}</strong>.</p>
           <p><strong>Total de etiquetas:</strong> ${Number(totalItems || 0)}</p>`
        : `<p>Não existem etiquetas promocionais para gerar para a loja <strong>${escapeHtml(storeLabel)}</strong>.</p>
           <p><strong>Total de etiquetas:</strong> 0</p>`}
      ${codes.length
        ? `<div style="margin:20px 0;padding:16px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;">
             <p style="margin:0 0 8px;"><strong>Atualização/Reposição PVP — artigos excluídos da promoção</strong></p>
             <p style="margin:0 0 8px;">Estes artigos não foram incluídos nas etiquetas. Copia os códigos abaixo:</p>
             <p style="margin:0;padding:10px 12px;border-radius:8px;background:#ffffff;font-family:monospace;word-break:break-all;">${escapeHtml(codeText)}</p>
           </div>`
        : ""}
      ${subject ? `<p><strong>Email de origem:</strong> ${escapeHtml(subject)}</p>` : ""}
      <p>Cumprimentos,<br/>Sistema automático Expert Administração</p>
    </div>
  `;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildErrorMessage(errors = []) {
  const compact = errors
    .map((error) => `${error.label || "smtp"} ${error.host || ""}${error.port ? `:${error.port}` : ""} → ${error.message}`)
    .join(" | ");
  return compact || "Falha desconhecida no envio de email.";
}

function normalizeRecipients(to) {
  if (Array.isArray(to)) return to.map(String).map((item) => item.trim()).filter(Boolean);
  return String(to || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildMessageSubject(storeLabel) {
  return `PROMOÇÃO - Etiquetas de campanha - ${storeLabel}`;
}

async function sendViaResend({ config, to, storeLabel, pdfBuffer, filename, totalItems, subject, pvpUpdateCodes = [] }) {
  if (!hasEmailApiConfig(config)) {
    throw new Error("API de email não configurada. Define CAMPAIGN_EMAIL_PROVIDER=resend, RESEND_API_KEY e CAMPAIGN_EMAIL_FROM_ADDRESS.");
  }

  const endpoint = `${config.emailApi.baseUrl.replace(/\/+$/, "")}/emails`;
  const recipients = normalizeRecipients(to);
  const hasPdf = Boolean(pdfBuffer && Buffer.from(pdfBuffer).length);
  const payload = {
    from: config.emailApi.from,
    to: recipients,
    subject: buildMessageSubject(storeLabel),
    text: buildEmailBody({ storeLabel, totalItems, subject, pvpUpdateCodes, hasPdf }),
    html: buildEmailHtml({ storeLabel, totalItems, subject, pvpUpdateCodes, hasPdf }),
  };

  if (hasPdf) {
    payload.attachments = [
      {
        filename: filename || `etiquetas-${storeLabel || "loja"}.pdf`,
        content: Buffer.from(pdfBuffer).toString("base64"),
      },
    ];
  }

  if (config.emailApi.replyTo) {
    payload.reply_to = config.emailApi.replyTo;
  }

  if (config.emailApi.debug || config.debug) {
    console.log(`[campanhas-automaticas] Resend tentativa: endpoint=${endpoint} from=${config.emailApi.from} to=${recipients.join(",")}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.emailApi.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.emailApi.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }

    if (!response.ok) {
      const errorMessage = body?.message || body?.error || text || `HTTP ${response.status}`;
      throw new Error(`Resend API falhou (${response.status}): ${errorMessage}`);
    }

    if (config.emailApi.debug || config.debug) {
      console.log(`[campanhas-automaticas] Resend enviado com sucesso id=${body?.id || body?.data?.id || "(sem id)"}`);
    }

    return {
      provider: "resend",
      id: body?.id || body?.data?.id,
      response: body,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Resend API timeout após ${config.emailApi.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaSmtp({ config, to, storeLabel, pdfBuffer, filename, totalItems, subject, pvpUpdateCodes = [] }) {
  if (!hasSmtpConfig(config)) {
    throw new Error("SMTP não configurado. Define CAMPAIGN_SMTP_HOST, CAMPAIGN_SMTP_FROM e credenciais se necessário.");
  }

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
      const hasPdf = Boolean(pdfBuffer && Buffer.from(pdfBuffer).length);
      const message = {
        from: config.smtp.from,
        to,
        subject: buildMessageSubject(storeLabel),
        text: buildEmailBody({ storeLabel, totalItems, subject, pvpUpdateCodes, hasPdf }),
        html: buildEmailHtml({ storeLabel, totalItems, subject, pvpUpdateCodes, hasPdf }),
      };

      if (hasPdf) {
        message.attachments = [
          {
            filename: filename || `etiquetas-${storeLabel || "loja"}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ];
      }

      const result = await transporter.sendMail(message);

      if (config.debug || config.smtp.debug) {
        console.log(
          `[campanhas-automaticas] SMTP enviado com sucesso via ${attempt.host}:${attempt.port} messageId=${result?.messageId || "(sem id)"}`,
        );
      }

      return {
        ...result,
        provider: "smtp",
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

export async function sendAutomaticCampaignEmail({ to, storeLabel, pdfBuffer, filename, totalItems, subject, pvpUpdateCodes = [] }) {
  const config = getAutomaticCampaignConfig();

  if (!to) {
    throw new Error(`Email da loja ${storeLabel || ""} não configurado.`);
  }

  if (config.emailProvider === "resend") {
    return sendViaResend({ config, to, storeLabel, pdfBuffer, filename, totalItems, subject, pvpUpdateCodes });
  }

  if (config.emailProvider === "smtp") {
    return sendViaSmtp({ config, to, storeLabel, pdfBuffer, filename, totalItems, subject, pvpUpdateCodes });
  }

  throw new Error(`CAMPAIGN_EMAIL_PROVIDER inválido: ${config.emailProvider}. Usa "resend" ou "smtp".`);
}

export async function verifyAutomaticCampaignEmailProvider() {
  const config = getAutomaticCampaignConfig();

  if (config.emailProvider === "resend") {
    if (!hasEmailApiConfig(config)) {
      throw new Error("API de email não configurada. Define CAMPAIGN_EMAIL_PROVIDER=resend, RESEND_API_KEY e CAMPAIGN_EMAIL_FROM_ADDRESS.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.emailApi.timeoutMs);

    try {
      const response = await fetch(`${config.emailApi.baseUrl.replace(/\/+$/, "")}/domains`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.emailApi.apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Resend API não validou (${response.status}): ${body || response.statusText}`);
      }

      return { ok: true, provider: "resend" };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Resend API timeout após ${config.emailApi.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (config.emailProvider === "smtp") {
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
          provider: "smtp",
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

  throw new Error(`CAMPAIGN_EMAIL_PROVIDER inválido: ${config.emailProvider}. Usa "resend" ou "smtp".`);
}

export const verifyAutomaticCampaignSmtp = verifyAutomaticCampaignEmailProvider;
