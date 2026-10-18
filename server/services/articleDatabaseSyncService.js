import { supabaseAdminClient } from "../lib/supabaseClients.js";
import { userRpc } from "./platform/accessService.js";
import { AppError } from "../middleware/errorHandler.js";

const MAX_BATCH_SIZE = Number(process.env.ARTICLE_DB_SYNC_MAX_BATCH_SIZE || 300);
const DB_READ_CHUNK_SIZE = Number(process.env.ARTICLE_DB_SYNC_READ_CHUNK_SIZE || 80);
const DB_WRITE_CHUNK_SIZE = Number(process.env.ARTICLE_DB_SYNC_WRITE_CHUNK_SIZE || 40);
const ARTICLE_COLUMNS = ["artigo", "descricao", "pvp1", "pvp2", "pvp3", "estado"];

function text(value) {
  return String(value ?? "").trim();
}

function normalizePrice(value) {
  const clean = text(value).replace(/[^\d,.-]/g, "");
  if (!clean || clean === "-") return null;

  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasOwn(input, ...keys) {
  return keys.some((key) =>
    Object.prototype.hasOwnProperty.call(input || {}, key),
  );
}

function normalizeRow(input = {}) {
  const artigo = text(input.artigo || input.Artigo);

  const row = { artigo };

  if (hasOwn(input, "descricao", "Descricao", "Descrição")) {
    row.descricao = text(
      input.descricao ?? input.Descricao ?? input["Descrição"],
    );
  }

  if (hasOwn(input, "pvp1", "PVP1")) {
    row.pvp1 = text(input.pvp1 ?? input.PVP1);
  }

  if (hasOwn(input, "pvp2", "PVP2")) {
    row.pvp2 = normalizePrice(input.pvp2 ?? input.PVP2);
  }

  if (hasOwn(input, "pvp3", "PVP3")) {
    row.pvp3 = text(input.pvp3 ?? input.PVP3);
  }

  if (hasOwn(input, "estado", "Estado")) {
    row.estado = text(input.estado ?? input.Estado);
  }

  if (
    hasOwn(
      input,
      "codigoBarras",
      "codigo_barras",
      "Cód. Barras",
      "EAN",
    )
  ) {
    row.codigoBarras = text(
      input.codigoBarras ??
      input.codigo_barras ??
      input["Cód. Barras"] ??
      input.EAN,
    );
  }

  return row;
}

function requireClient() {
  if (!supabaseAdminClient) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Serviço de base de dados indisponível.",
      { status: 503 },
    );
  }

  return supabaseAdminClient;
}

async function resolveOrganizationId({ req }) {
  if (!req.organizationId) throw new AppError("TENANT_REQUIRED", "Organização obrigatória.");
  return req.organizationId;
}

export async function startArticleDatabaseSync({
  req,
  fileName,
  totalRows,
  columns,
}) {
  const client = requireClient();
  const organizationId = await resolveOrganizationId({ req, client });

  if (!organizationId) {
    throw new AppError(
      "TENANT_REQUIRED",
      "Não foi possível determinar a organização da base de dados.",
    );
  }

  const safeTotalRows = Math.max(0, Number(totalRows) || 0);

  if (safeTotalRows > 300_000) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A atualização suporta no máximo 300.000 artigos por ficheiro.",
    );
  }

  const { data, error } = await client
    .from("article_sync_logs")
    .insert({
      organization_id: organizationId,
      user_id: req.authUser.id,
      user_email: req.auth?.email || req.authUser.email || "",
      file_name: text(fileName).slice(0, 255),
      total_rows: safeTotalRows,
      columns: Array.isArray(columns)
        ? columns.map(text).filter(Boolean).slice(0, 100)
        : [],
      status: "processing",
      last_batch_index: -1,
    })
    .select("id,created_at")
    .single();

  if (error) throw error;

  return {
    syncId: data.id,
    organizationId,
    createdAt: data.created_at,
  };
}

export async function processArticleDatabaseSyncBatch({
  req,
  syncId,
  batchIndex,
  rows,
}) {
  if (!Array.isArray(rows) || rows.length > Math.min(MAX_BATCH_SIZE, 300)) {
    throw new AppError("VALIDATION_ERROR", "Lote inválido: máximo de 300 linhas.");
  }

  const receivedRows = (Array.isArray(rows) ? rows : [])
    .map(normalizeRow)
    // Regra de negócio: só sincronizar artigos com PVP2 não nulo.
    // PVP2 = 0 continua válido; apenas null/undefined são excluídos.
    .filter(
      (row) =>
        row.artigo &&
        row.pvp2 !== null &&
        row.pvp2 !== undefined,
    );

  // Large commercial exports can contain the same article more than once.
  // A duplicate inside the same HTTP batch can otherwise produce:
  // - 23505 duplicate key on INSERT; or
  // - 21000 ON CONFLICT cannot affect row a second time on UPSERT.
  //
  // Keep only the last occurrence in the batch, matching the updater's
  // historical "last occurrence wins" behaviour.
  const rowsByArticle = new Map();
  for (const row of receivedRows) {
    rowsByArticle.set(row.artigo, row);
  }

  const normalizedRows = [...rowsByArticle.values()];
  const safeBatchIndex = Number(batchIndex);

  if (!syncId || !normalizedRows.length) {
    throw new AppError("VALIDATION_ERROR", "Lote inválido ou vazio.");
  }

  if (!Number.isInteger(safeBatchIndex) || safeBatchIndex < 0) {
    throw new AppError("VALIDATION_ERROR", "Índice do lote inválido.");
  }

  if (receivedRows.length > MAX_BATCH_SIZE) {
    throw new AppError(
      "VALIDATION_ERROR",
      `O lote não pode ultrapassar ${MAX_BATCH_SIZE} linhas de artigos.`,
    );
  }

  return userRpc(req, "platform_article_sync_batch", {
    p_org: req.organizationId, p_store: req.storeId || null, p_sync: syncId,
    p_batch: safeBatchIndex, p_rows: normalizedRows, p_received: receivedRows.length,
  });
}

export async function finishArticleDatabaseSync({
  req,
  syncId,
  status = "completed",
  errorMessage = "",
}) {
  const client = requireClient();

  const safeStatus = ["completed", "failed", "cancelled"].includes(status)
    ? status
    : "completed";

  const { data, error } = await client
    .from("article_sync_logs")
    .update({
      status: safeStatus,
      finished_at: new Date().toISOString(),
      error_message: text(errorMessage).slice(0, 2000) || null,
    })
    .eq("id", syncId)
    .eq("user_id", req.authUser.id)
    .eq("organization_id", req.organizationId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listArticleDatabaseSyncHistory({
  req,
  limit = 10,
}) {
  const client = requireClient();
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 30);

  const { data, error } = await client
    .from("article_sync_logs")
    .select(
      "id,file_name,status,total_rows,processed_rows,updated_rows,inserted_rows,unchanged_rows,pvp1_changes,pvp2_changes,pvp3_changes,estado_changes,last_batch_index,created_at,finished_at,error_message,user_email",
    )
    .eq("organization_id", req.organizationId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  return data || [];
}

export {
  ARTICLE_COLUMNS,
  MAX_BATCH_SIZE,
  DB_READ_CHUNK_SIZE,
  DB_WRITE_CHUNK_SIZE,
};
