import { supabaseAdminClient } from "../lib/supabaseClients.js";
import { AppError } from "../middleware/errorHandler.js";

const MAX_BATCH_SIZE = Number(process.env.ARTICLE_DB_SYNC_MAX_BATCH_SIZE || 500);
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

function normalizeRow(input = {}) {
  const artigo = text(input.artigo || input.Artigo);
  return {
    artigo,
    descricao: text(input.descricao || input.Descricao),
    pvp1: text(input.pvp1 ?? input.PVP1),
    pvp2: normalizePrice(input.pvp2 ?? input.PVP2),
    pvp3: text(input.pvp3 ?? input.PVP3),
    estado: text(input.estado ?? input.Estado),
  };
}

function buildSearchTerms(row) {
  return [row.artigo, row.descricao].filter(Boolean).join(" ").toLowerCase();
}

function samePrice(a, b) {
  if (a === null || a === undefined || a === "") return b === null || b === undefined || b === "";
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left === right;
  return text(a) === text(b);
}

function getChangedFields(next, current) {
  const changes = {};
  if (text(current.pvp1) !== next.pvp1) changes.pvp1 = true;
  if (!samePrice(current.pvp2, next.pvp2)) changes.pvp2 = true;
  if (text(current.pvp3) !== next.pvp3) changes.pvp3 = true;
  if (text(current.estado) !== next.estado) changes.estado = true;
  return changes;
}

function requireClient() {
  if (!supabaseAdminClient) {
    throw new AppError("SERVICE_UNAVAILABLE", "Serviço de base de dados indisponível.", { status: 503 });
  }
  return supabaseAdminClient;
}

async function resolveOrganizationId({ req, client }) {
  if (req.organizationId) return req.organizationId;
  if (req.auth?.profile?.default_organization_id) return req.auth.profile.default_organization_id;

  const { data, error } = await client
    .from("profiles")
    .select("default_organization_id")
    .eq("id", req.authUser.id)
    .maybeSingle();

  if (error) throw error;
  if (data?.default_organization_id) return data.default_organization_id;

  const membership = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", req.authUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership.error) throw membership.error;
  return membership.data?.organization_id || null;
}

export async function startArticleDatabaseSync({ req, fileName, totalRows, columns }) {
  const client = requireClient();
  const organizationId = await resolveOrganizationId({ req, client });
  if (!organizationId) {
    throw new AppError("TENANT_REQUIRED", "Não foi possível determinar a organização da base de dados.");
  }

  const { data, error } = await client
    .from("article_sync_logs")
    .insert({
      organization_id: organizationId,
      user_id: req.authUser.id,
      user_email: req.auth?.email || req.authUser.email || "",
      file_name: text(fileName).slice(0, 255),
      total_rows: Math.max(0, Number(totalRows) || 0),
      columns: Array.isArray(columns) ? columns.map(text).filter(Boolean).slice(0, 100) : [],
      status: "processing",
    })
    .select("id,created_at")
    .single();

  if (error) throw error;
  return { syncId: data.id, organizationId, createdAt: data.created_at };
}

export async function processArticleDatabaseSyncBatch({ req, syncId, rows }) {
  const client = requireClient();
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizeRow).filter((row) => row.artigo);

  if (!syncId || !normalizedRows.length) {
    throw new AppError("VALIDATION_ERROR", "Lote inválido ou vazio.");
  }
  if (normalizedRows.length > MAX_BATCH_SIZE) {
    throw new AppError("VALIDATION_ERROR", `O lote não pode ultrapassar ${MAX_BATCH_SIZE} artigos.`);
  }

  const { data: log, error: logError } = await client
    .from("article_sync_logs")
    .select("id,organization_id,status")
    .eq("id", syncId)
    .eq("user_id", req.authUser.id)
    .maybeSingle();
  if (logError) throw logError;
  if (!log) throw new AppError("NOT_FOUND", "Sincronização não encontrada.");
  if (log.status !== "processing") throw new AppError("VALIDATION_ERROR", "Esta sincronização já terminou.");

  const codes = [...new Set(normalizedRows.map((row) => row.artigo))];
  const { data: existingData, error: existingError } = await client
    .from("articles")
    .select("artigo,pvp1,pvp2,pvp3,estado")
    .in("artigo", codes);
  if (existingError) throw existingError;

  const existing = new Map((existingData || []).map((row) => [row.artigo, row]));
  const updates = [];
  const inserts = [];
  const changedFields = { pvp1: 0, pvp2: 0, pvp3: 0, estado: 0 };
  let unchanged = 0;

  for (const row of normalizedRows) {
    const current = existing.get(row.artigo);
    if (current) {
      const changes = getChangedFields(row, current);
      if (!Object.keys(changes).length) {
        unchanged += 1;
        continue;
      }
      for (const field of Object.keys(changes)) changedFields[field] += 1;
      updates.push({
        artigo: row.artigo,
        pvp1: row.pvp1,
        pvp2: row.pvp2,
        pvp3: row.pvp3,
        estado: row.estado,
      });
    } else {
      inserts.push({
        artigo: row.artigo,
        descricao: row.descricao,
        pvp1: row.pvp1,
        pvp2: row.pvp2,
        pvp3: row.pvp3,
        estado: row.estado,
        organization_id: log.organization_id,
        codigo_barras: "",
        search_terms: buildSearchTerms(row),
      });
    }
  }

  if (updates.length) {
    const { error } = await client.from("articles").upsert(updates, { onConflict: "artigo" });
    if (error) throw error;
  }

  if (inserts.length) {
    const { error } = await client.from("articles").insert(inserts);
    if (error) throw error;
  }

  const { data: updatedLog, error: updateLogError } = await client
    .from("article_sync_logs")
    .update({
      processed_rows: Number(log.processed_rows || 0) + normalizedRows.length,
      updated_rows: Number(log.updated_rows || 0) + updates.length,
      inserted_rows: Number(log.inserted_rows || 0) + inserts.length,
      unchanged_rows: Number(log.unchanged_rows || 0) + unchanged,
      pvp1_changes: Number(log.pvp1_changes || 0) + changedFields.pvp1,
      pvp2_changes: Number(log.pvp2_changes || 0) + changedFields.pvp2,
      pvp3_changes: Number(log.pvp3_changes || 0) + changedFields.pvp3,
      estado_changes: Number(log.estado_changes || 0) + changedFields.estado,
      last_batch_at: new Date().toISOString(),
    })
    .eq("id", syncId)
    .select("processed_rows,updated_rows,inserted_rows,unchanged_rows,pvp1_changes,pvp2_changes,pvp3_changes,estado_changes")
    .single();

  if (updateLogError) throw updateLogError;
  return {
    processed: normalizedRows.length,
    updated: updates.length,
    inserted: inserts.length,
    unchanged,
    changedFields,
    totals: updatedLog,
  };
}

export async function finishArticleDatabaseSync({ req, syncId, status = "completed", errorMessage = "" }) {
  const client = requireClient();
  const safeStatus = ["completed", "failed", "cancelled"].includes(status) ? status : "completed";
  const { data, error } = await client
    .from("article_sync_logs")
    .update({
      status: safeStatus,
      finished_at: new Date().toISOString(),
      error_message: text(errorMessage).slice(0, 2000) || null,
    })
    .eq("id", syncId)
    .eq("user_id", req.authUser.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listArticleDatabaseSyncHistory({ req, limit = 10 }) {
  const client = requireClient();
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 30);
  const { data, error } = await client
    .from("article_sync_logs")
    .select("id,file_name,status,total_rows,processed_rows,updated_rows,inserted_rows,unchanged_rows,pvp1_changes,pvp2_changes,pvp3_changes,estado_changes,created_at,finished_at,error_message,user_email")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return data || [];
}

export { ARTICLE_COLUMNS, MAX_BATCH_SIZE };
