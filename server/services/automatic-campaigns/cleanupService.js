import { getAutomaticCampaignConfig } from "./config.js";
import {
  deleteAutomaticCampaignRowsByIds,
  listExpiredAutomaticCampaignRows,
} from "./automaticCampaignRepository.js";
import { deleteAutomaticCampaignPdfPaths } from "./storageService.js";

function isLikelyStoragePdfPath(value) {
  const text = String(value || "").trim();
  if (!text || /^https?:\/\//i.test(text)) return false;
  return text.toLowerCase().endsWith(".pdf") && text.includes("/");
}

export function extractAutomaticCampaignPdfPaths(row = {}) {
  const paths = new Set();

  if (isLikelyStoragePdfPath(row.pdf_url)) {
    paths.add(String(row.pdf_url).trim());
  }

  const pdfs = row?.pdfs && typeof row.pdfs === "object" ? row.pdfs : {};

  for (const [key, value] of Object.entries(pdfs)) {
    if (typeof value !== "string") continue;
    const normalizedKey = String(key || "").toLowerCase();

    if (normalizedKey.includes("path") || isLikelyStoragePdfPath(value)) {
      const candidate = value.trim();
      if (isLikelyStoragePdfPath(candidate)) {
        paths.add(candidate);
      }
    }
  }

  return [...paths];
}

export async function cleanupExpiredAutomaticCampaigns(options = {}) {
  const config = options.config || getAutomaticCampaignConfig();
  const maxAgeDays = Math.max(1, Number(options.maxAgeDays || config.cleanup?.maxAgeDays || config.keepDays || 5));
  const batchSize = Math.min(500, Math.max(1, Number(options.batchSize || config.cleanup?.batchSize || 100)));
  const dryRun = Boolean(options.dryRun);

  const rows = await listExpiredAutomaticCampaignRows({ maxAgeDays, limit: batchSize });
  const ids = rows.map((row) => row.id).filter(Boolean);
  const pdfPaths = [...new Set(rows.flatMap(extractAutomaticCampaignPdfPaths))];

  const result = {
    ok: true,
    dryRun,
    maxAgeDays,
    matchedRows: rows.length,
    deletedRows: 0,
    deletedPdfPaths: 0,
    pdfDeleteError: "",
    rowDeleteError: "",
    ids,
    pdfPaths,
  };

  if (!rows.length || dryRun) {
    return result;
  }

  if (pdfPaths.length) {
    try {
      const storageResult = await deleteAutomaticCampaignPdfPaths(pdfPaths);
      result.deletedPdfPaths = storageResult.deletedPaths || 0;
    } catch (error) {
      result.ok = false;
      result.pdfDeleteError = error?.message || String(error);
      console.warn("[campanhas-automaticas] Falha ao apagar PDFs expirados do storage:", result.pdfDeleteError);
    }
  }

  try {
    const deletedRows = await deleteAutomaticCampaignRowsByIds(ids);
    result.deletedRows = deletedRows.length;
  } catch (error) {
    result.ok = false;
    result.rowDeleteError = error?.message || String(error);
    throw error;
  }

  return result;
}
