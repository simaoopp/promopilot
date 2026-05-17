import nodemailer from "nodemailer";
import { getAutomaticCampaignConfig, hasSmtpConfig } from "./config.js";

function createTransport(config) {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user
      ? {
          user: config.smtp.user,
          pass: config.smtp.pass,
        }
      : undefined,
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

export async function sendAutomaticCampaignEmail({ to, storeLabel, pdfBuffer, filename, totalItems, subject }) {
  const config = getAutomaticCampaignConfig();

  if (!hasSmtpConfig(config)) {
    throw new Error("SMTP não configurado. Define CAMPAIGN_SMTP_HOST, CAMPAIGN_SMTP_FROM e credenciais se necessário.");
  }

  if (!to) {
    throw new Error(`Email da loja ${storeLabel || ""} não configurado.`);
  }

  const transporter = createTransport(config);
  const messageSubject = `Etiquetas de campanha - ${storeLabel}`;

  return transporter.sendMail({
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
}
