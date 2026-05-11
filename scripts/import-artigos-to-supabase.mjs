import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve("server/.env") });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ARTICLES_TABLE = process.env.ARTICLES_TABLE || "articles";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no server/.env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function normalizeArticle(item) {
  const ts = item.ultima_atualizacao?.trim?.() || "";
  return {
    artigo: String(item.artigo || "").trim(),
    descricao: String(item.descricao || "").trim(),
    pvp1: String(item.pvp1 || "").trim(),
    pvp2: String(item.pvp2 || "").trim(),
    pvp3: String(item.pvp3 || item.pv3 || "").trim(),
    codigo_barras: String(item.codigoBarras || "").trim() || null,
    fonte_oficial: String(item.fonte_oficial || "").trim(),
    raw_hash: String(item.raw_hash || "").trim(),
    ultima_atualizacao: ts || null,
    titulo_oficial: String(item.titulo_oficial || "").trim(),
    descricao_oficial: String(item.descricao_oficial || "").trim(),
    caracteristicas_tecnicas:
      item.caracteristicas_tecnicas && typeof item.caracteristicas_tecnicas === "object"
        ? item.caracteristicas_tecnicas
        : {},
    documentos_oficiais: Array.isArray(item.documentos_oficiais)
      ? item.documentos_oficiais
      : [],
    resumo_vendedor: String(item.resumo_vendedor || "").trim(),
    observacoes_ia: String(item.observacoes_ia || "").trim(),
  };
}

async function main() {
  const filePath = path.resolve("src/data/artigos.json");
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const artigos = Array.isArray(parsed?.artigos) ? parsed.artigos : [];

  console.log(`A importar ${artigos.length} artigos...`);

  const batchSize = 500;

  for (let i = 0; i < artigos.length; i += batchSize) {
    const batch = artigos.slice(i, i + batchSize).map(normalizeArticle);

    const { error } = await supabase
      .from(ARTICLES_TABLE)
      .upsert(batch, { onConflict: "artigo" });

    if (error) {
      throw error;
    }

    console.log(`Batch ${i + 1} - ${Math.min(i + batchSize, artigos.length)} concluído`);
  }

  console.log("Importação concluída.");
}

main().catch((error) => {
  console.error("Erro na importação:", error);
  process.exit(1);
});