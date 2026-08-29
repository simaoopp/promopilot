import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

const API_BASE_URL = String(process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");
const BATCH_SIZE = 100;

function normalizeHeader(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function clean(value) {
  return String(value ?? "").trim();
}

function findValue(row, aliases) {
  const keys = Object.keys(row);
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const key = keys.find((candidate) => normalizedAliases.has(normalizeHeader(candidate)));
  return key ? row[key] : "";
}

function normalizePrice(value) {
  const cleanValue = clean(value).replace(/[^\d,.-]/g, "");
  if (!cleanValue || cleanValue === "-") return "";
  return cleanValue;
}

function mapRow(row) {
  return {
    artigo: clean(findValue(row, ["Artigo", "artigo_interno", "codigo"])),
    descricao: clean(findValue(row, ["Descricao", "Descrição"])),
    pvp1: normalizePrice(findValue(row, ["PVP1", "PVP 1"])),
    pvp2: normalizePrice(findValue(row, ["PVP2", "PVP 2"])),
    pvp3: normalizePrice(findValue(row, ["PVP3", "PVP 3"])),
    estado: clean(findValue(row, ["Estado", "Status"])),
  };
}

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message || "Sessão inválida.");
  if (!data?.session?.access_token) throw new Error("Sessão expirada. Inicia sessão novamente.");
  return data.session.access_token;
}

async function api(path, options = {}) {
  const token = await accessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error?.message || data?.error || `Erro HTTP ${response.status}`);
  }
  return data;
}

export async function parseArticleDatabaseFile(file) {
  if (!file) throw new Error("Seleciona um ficheiro.");
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  if (!["ods", "xlsx", "xls"].includes(extension)) {
    throw new Error("Formato não suportado. Usa ODS, XLSX ou XLS.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("O ficheiro não contém uma folha válida.");

  const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false });
  if (!rawRows.length) throw new Error("O ficheiro não contém linhas de artigos.");

  const rows = rawRows.map(mapRow).filter((row) => row.artigo);
  if (!rows.length) throw new Error("Não encontrei a coluna Artigo ou não existem artigos válidos.");

  const sourceColumns = Object.keys(rawRows[0] || {});
  const unique = new Map();
  rows.forEach((row) => unique.set(row.artigo, row));

  return {
    rows: [...unique.values()],
    sourceColumns,
    sheetName: workbook.SheetNames[0],
    totalRows: rawRows.length,
  };
}

export async function syncArticleDatabase({ file, onProgress }) {
  const parsed = await parseArticleDatabaseFile(file);
  const start = await api("/api/admin/articles/database-sync/start", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      totalRows: parsed.rows.length,
      columns: parsed.sourceColumns,
    }),
  });

  const syncId = start.syncId;
  let aggregate = {
    processed: 0,
    updated: 0,
    inserted: 0,
    unchanged: 0,
    changedFields: { pvp1: 0, pvp2: 0, pvp3: 0, estado: 0 },
  };

  try {
    for (let offset = 0; offset < parsed.rows.length; offset += BATCH_SIZE) {
      const rows = parsed.rows.slice(offset, offset + BATCH_SIZE);
      const result = await api("/api/admin/articles/database-sync/batch", {
        method: "POST",
        body: JSON.stringify({ syncId, rows }),
      });
      aggregate.processed += result.processed || 0;
      aggregate.updated += result.updated || 0;
      aggregate.inserted += result.inserted || 0;
      aggregate.unchanged += result.unchanged || 0;
      for (const key of Object.keys(aggregate.changedFields)) {
        aggregate.changedFields[key] += result.changedFields?.[key] || 0;
      }
      onProgress?.({ processed: aggregate.processed, total: parsed.rows.length, aggregate });
    }

    const finished = await api("/api/admin/articles/database-sync/finish", {
      method: "POST",
      body: JSON.stringify({ syncId, status: "completed" }),
    });

    return { parsed, aggregate, item: finished.item };
  } catch (error) {
    try {
      await api("/api/admin/articles/database-sync/finish", {
        method: "POST",
        body: JSON.stringify({ syncId, status: "failed", errorMessage: error?.message || "Erro desconhecido" }),
      });
    } catch {
      // Preserve the original sync error.
    }
    throw error;
  }
}

export async function fetchArticleDatabaseSyncHistory() {
  const data = await api("/api/admin/articles/database-sync/history?limit=8");
  return Array.isArray(data.items) ? data.items : [];
}
