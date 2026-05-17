import { AUTOMATIC_CAMPAIGN_BUCKET } from "./config.js";
import { supabaseAdminClient, hasSupabaseAdminConfig } from "../../lib/supabaseClients.js";

function normalizePathPart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "campanha";
}

export async function ensureAutomaticCampaignBucket() {
  if (!hasSupabaseAdminConfig()) {
    throw new Error("Supabase service role não configurado no servidor.");
  }

  const { data: bucket } = await supabaseAdminClient.storage.getBucket(AUTOMATIC_CAMPAIGN_BUCKET);

  if (bucket) return bucket;

  const { data, error } = await supabaseAdminClient.storage.createBucket(
    AUTOMATIC_CAMPAIGN_BUCKET,
    {
      public: false,
      fileSizeLimit: "20MB",
      allowedMimeTypes: ["application/pdf"],
    },
  );

  if (error && !String(error.message || "").toLowerCase().includes("already exists")) {
    throw error;
  }

  return data;
}

export async function uploadAutomaticCampaignPdf({ pdfBuffer, emailMessageId, storeKey, title }) {
  if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) {
    throw new Error("PDF inválido para upload.");
  }

  await ensureAutomaticCampaignBucket();

  const date = new Date();
  const datePart = date.toISOString().slice(0, 10);
  const safeMessage = normalizePathPart(emailMessageId || title || `email-${date.getTime()}`);
  const safeStore = normalizePathPart(storeKey || "loja");
  const filePath = `${datePart}/${safeMessage}/${safeStore}.pdf`;

  const { error } = await supabaseAdminClient.storage
    .from(AUTOMATIC_CAMPAIGN_BUCKET)
    .upload(filePath, pdfBuffer, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data } = await supabaseAdminClient.storage
    .from(AUTOMATIC_CAMPAIGN_BUCKET)
    .createSignedUrl(filePath, 60 * 60 * 24 * 7);

  return {
    path: filePath,
    signedUrl: data?.signedUrl || "",
    bucket: AUTOMATIC_CAMPAIGN_BUCKET,
  };
}

export async function createAutomaticCampaignPdfSignedUrl(path, expiresInSeconds = 60 * 60) {
  if (!path) return "";
  if (!hasSupabaseAdminConfig()) {
    throw new Error("Supabase service role não configurado no servidor.");
  }

  const { data, error } = await supabaseAdminClient.storage
    .from(AUTOMATIC_CAMPAIGN_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    throw error;
  }

  return data?.signedUrl || "";
}
