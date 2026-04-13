import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error("Falta GEMINI_API_KEY no ficheiro .env");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/* =========================================================
   CONFIG
   ========================================================= */
const AI_MODEL = "gemini-2.5-flash";
const USE_GROUNDING_FALLBACK = true;

const DB_FILE = path.resolve("../src/data/artigos.json");
const MAX_TEXT_LENGTH = 12000;
const MAX_CANDIDATE_LINKS = 8;
const MAX_SCRAPE_ATTEMPTS = 5;
const SEARCH_DEBUG = true;

const KUANTOKUSTA_PRODUCT_URL_REGEX =
  /^https:\/\/www\.kuantokusta\.pt\/p\/\d+\/.+/i;

const PRODUCT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    titulo_oficial: { type: "string" },
    descricao_oficial: { type: "string" },
    caracteristicas_tecnicas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chave: { type: "string" },
          valor: { type: "string" },
        },
        required: ["chave", "valor"],
      },
    },
    resumo_vendedor: { type: "string" },
    observacoes_ia: { type: "string" },
  },
  required: [
    "titulo_oficial",
    "descricao_oficial",
    "caracteristicas_tecnicas",
    "resumo_vendedor",
    "observacoes_ia",
  ],
};

/* =========================================================
   HELPERS
   ========================================================= */
function debug(...args) {
  if (SEARCH_DEBUG) {
    console.log(...args);
  }
}

function clean(v = "") {
  return String(v).replace(/\s+/g, " ").trim();
}

function hash(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function normalizeCompare(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(arr) {
  return [...new Set(arr.filter(Boolean).map((v) => clean(v)))];
}

function tokenizeSearch(text = "") {
  const stopwords = new Set([
    "com",
    "sem",
    "para",
    "de",
    "da",
    "do",
    "dos",
    "das",
    "the",
    "and",
    "bar",
    "sound",
    "smart",
    "tv",
    "led",
    "qled",
    "oled",
    "uhd",
    "4k",
    "8k",
    "combo",
    "fly",
    "more",
    "preto",
    "branco",
    "azul",
    "vermelho",
  ]);

  return uniqueStrings(
    normalizeCompare(text)
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .filter((t) => !stopwords.has(t)),
  );
}

function hasUsefulTechData(art) {
  return !!(
    art?.caracteristicas_tecnicas &&
    typeof art.caracteristicas_tecnicas === "object" &&
    Object.keys(art.caracteristicas_tecnicas).length > 0
  );
}

function extractBrandAndModel(descricao = "") {
  const text = clean(descricao);

  if (!text) {
    return { marca: "", modelo: "" };
  }

  if (text.includes(" - ")) {
    const [marca, resto] = text.split(" - ", 2);
    return {
      marca: clean(marca),
      modelo: clean(resto),
    };
  }

  return {
    marca: "",
    modelo: text,
  };
}

function normalizeTechSpecs(value) {
  if (Array.isArray(value)) {
    const out = {};

    for (const item of value) {
      const chave = clean(item?.chave || "");
      const valor = clean(item?.valor || "");

      if (chave && valor) {
        out[chave] = valor;
      }
    }

    return out;
  }

  if (value && typeof value === "object") {
    return value;
  }

  return {};
}

function isKuantokustaProductUrl(url = "") {
  return KUANTOKUSTA_PRODUCT_URL_REGEX.test(String(url || "").trim());
}

function safeParseJson(text) {
  const raw = String(text || "").trim();

  if (!raw) {
    throw new Error("Resposta vazia da Gemini.");
  }

  const attempts = [];

  attempts.push(raw);

  const semFences = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  attempts.push(semFences);

  const firstBrace = semFences.indexOf("{");
  const lastBrace = semFences.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(semFences.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continua
    }

    try {
      const repaired = candidate
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");

      return JSON.parse(repaired);
    } catch {
      // continua
    }
  }

  throw new Error("A Gemini não devolveu JSON válido.");
}

async function repairBrokenJsonToSchema(rawText) {
  const prompt = `
Recebeste um texto que deveria ser JSON, mas está mal formado.
Corrige o conteúdo e devolve apenas JSON válido.
Não inventes novos dados.
Mantém exatamente esta estrutura:

{
  "titulo_oficial": "string",
  "descricao_oficial": "string",
  "caracteristicas_tecnicas": [
    { "chave": "string", "valor": "string" }
  ],
  "resumo_vendedor": "string",
  "observacoes_ia": "string"
}

Texto a corrigir:
${String(rawText || "").trim()}
`;

  const r = await ai.models.generateContent({
    model: AI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: PRODUCT_RESPONSE_SCHEMA,
      candidateCount: 1,
      temperature: 0,
      topP: 0.9,
      maxOutputTokens: 1200,
    },
  });

  const text = String(r.text || "").trim();
  debug("[JSON-REPAIR] resposta:", text);

  const parsed = safeParseJson(text);

  return {
    ...parsed,
    caracteristicas_tecnicas: normalizeTechSpecs(
      parsed?.caracteristicas_tecnicas,
    ),
  };
}

function extractGroundedSources(response) {
  const groundingMetadata =
    response?.candidates?.[0]?.groundingMetadata ||
    response?.candidates?.[0]?.grounding_metadata ||
    {};

  const chunks = groundingMetadata?.groundingChunks || [];
  const urls = chunks
    .map((chunk) => chunk?.web?.uri || chunk?.retrievedContext?.uri || "")
    .filter(Boolean);

  return [...new Set(urls)];
}

/* =========================================================
   DB
   ========================================================= */
async function loadDB() {
  const raw = await fs.readFile(DB_FILE, "utf8");
  return JSON.parse(raw);
}

async function saveDB(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

/* =========================================================
   SEARCH
   ========================================================= */
async function searchProductCandidates(page, { descricao, ean }) {
  const eanClean = clean(ean);
  const descricaoClean = clean(descricao);

  if (!eanClean) {
    return [];
  }

  const query = `site:kuantokusta.pt/p/ "${eanClean}"`;

  debug("====================================");
  debug("[KK+BING] descrição:", descricaoClean);
  debug("[KK+BING] EAN:", eanClean);
  debug("[KK+BING] query:", query);
  debug("====================================");

  await page.goto(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );

  await page.waitForTimeout(2000);

  debug("[KK+BING] final url:", page.url());
  debug("[KK+BING] title:", await page.title());

  const links = await page.$$eval("li.b_algo h2 a, a[href^='http']", (els) =>
    els.map((a) => a.getAttribute("href") || a.href || "").filter(Boolean),
  );

  const normalized = [
    ...new Set(
      links
        .map((href) => String(href || "").trim())
        .filter((href) => /^https?:\/\//i.test(href))
        .filter((href) => isKuantokustaProductUrl(href)),
    ),
  ];

  const ranked = normalized
    .map((link, index) => ({
      link,
      source: "bing-site-kuantokusta",
      query,
      score: 1000 - index,
    }))
    .slice(0, MAX_CANDIDATE_LINKS);

  debug(
    "[KK+BING] candidatos:",
    ranked.map((x) => ({
      score: x.score,
      link: x.link,
    })),
  );

  return ranked;
}

function pageLooksLikeCorrectProduct(raw, { descricao, ean }) {
  const haystack = normalizeCompare(
    [
      raw?.titulo || "",
      raw?.descricao || "",
      raw?.texto || "",
      Object.entries(raw?.caracteristicas || {})
        .map(([k, v]) => `${k} ${v}`)
        .join(" "),
    ].join(" "),
  );

  const eanClean = normalizeCompare(ean);

  if (eanClean) {
    const eanOk = haystack.includes(eanClean);

    debug("Validação página:", {
      titulo: raw?.titulo || "",
      eanOk,
      modo: "ean-first",
    });

    return eanOk;
  }

  const tokens = tokenizeSearch(descricao);
  const tokenHits = tokens.filter((t) => haystack.includes(t));

  debug("Validação página:", {
    titulo: raw?.titulo || "",
    tokenHits,
    tokens,
    modo: "descricao-fallback",
  });

  return tokenHits.length >= Math.min(3, tokens.length);
}

/* =========================================================
   SCRAPE
   ========================================================= */
function extractSpecs($) {
  const specs = {};

  $("table tr").each((_, tr) => {
    const t = $(tr).find("th,td");
    if (t.length >= 2) {
      const key = clean($(t[0]).text());
      const value = clean($(t[1]).text());

      if (key && value && key.length <= 120) {
        specs[key] = value;
      }
    }
  });

  $("dl").each((_, dl) => {
    const dts = $(dl).find("dt");
    dts.each((i, dt) => {
      const key = clean($(dt).text());
      const value = clean($(dl).find("dd").eq(i).text());

      if (key && value && key.length <= 120) {
        specs[key] = value;
      }
    });
  });

  $("li").each((_, li) => {
    const text = clean($(li).text());
    if (!text.includes(":")) return;

    const idx = text.indexOf(":");
    const key = clean(text.slice(0, idx));
    const value = clean(text.slice(idx + 1));

    if (key && value && key.length <= 120) {
      specs[key] = value;
    }
  });

  return specs;
}

async function scrape(page, url) {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForTimeout(2000);

  const html = await page.content();
  const $ = cheerio.load(html);

  const specs = extractSpecs($);
  const bodyText = clean($("body").text());

  return {
    fonte_oficial: url,
    titulo: clean($("h1").first().text()) || clean($("title").first().text()),
    descricao:
      clean($('meta[name="description"]').attr("content")) ||
      clean($(".product-description, .description, .rte").first().text()),
    caracteristicas: specs,
    texto: bodyText.slice(0, MAX_TEXT_LENGTH),
  };
}

/* =========================================================
   AI
   ========================================================= */
async function enrich(artigo, raw) {
  const payload = {
    artigo_interno: artigo.artigo || "",
    descricao_base: artigo.descricao || "",
    codigoBarras: artigo.codigoBarras || "",
    pvp2: artigo.pvp2 || "",
    stock: artigo.stock || "",
    armazem: artigo.armazem || "",
    fonte_oficial: raw.fonte_oficial || "",
    titulo_fonte: raw.titulo || "",
    descricao_fonte: raw.descricao || "",
    caracteristicas_fonte: raw.caracteristicas || {},
    texto_fonte: raw.texto || "",
  };

  const prompt = `
És um assistente para catálogo de produtos.
Responde em português de Portugal.

Usa apenas os dados fornecidos.
Não inventes informação.
Não deduzas características que não estejam explicitamente presentes.
Não mistures dados de vários produtos.
O campo "artigo_interno" é apenas um código interno e não identifica o modelo comercial.
Dá prioridade à descrição_base, ao codigoBarras e aos dados extraídos da página.
Se não tiveres a certeza, deixa vazio ou usa objeto vazio.
Devolve apenas JSON válido.

Estrutura obrigatória:
{
  "titulo_oficial": "string",
  "descricao_oficial": "string",
  "caracteristicas_tecnicas": [
    { "chave": "string", "valor": "string" }
  ],
  "resumo_vendedor": "string",
  "observacoes_ia": "string"
}

Dados:
${JSON.stringify(payload, null, 2)}
`;

  const r = await ai.models.generateContent({
    model: AI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: PRODUCT_RESPONSE_SCHEMA,
      candidateCount: 1,
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: 1200,
    },
  });

  const text = String(r.text || "").trim();
  const parsed = safeParseJson(text);

  return {
    ...parsed,
    caracteristicas_tecnicas: normalizeTechSpecs(
      parsed?.caracteristicas_tecnicas,
    ),
  };
}

async function searchWithGrounding(artigo) {
  const payload = {
    artigo_interno: artigo.artigo || "",
    descricao_base: artigo.descricao || "",
    codigoBarras: artigo.codigoBarras || "",
    pvp2: artigo.pvp2 || "",
    stock: artigo.stock || "",
    armazem: artigo.armazem || "",
  };

  const prompt = `
És um assistente para catálogo de produtos.
Responde em português de Portugal.

Usa Google Search para confirmar informação pública do produto.
Usa apenas informação sustentada pelas fontes encontradas.
Não inventes informação.
Não mistures produtos parecidos.
O campo "artigo_interno" é apenas um código interno.
Dá prioridade à descrição_base e ao codigoBarras.

Quero uma resposta curta mas útil em TEXTO, sem markdown, contendo:
- título confirmado
- descrição confirmada
- características técnicas encontradas
- resumo para vendedor
- observações relevantes
- se houver dúvida de correspondência, diz isso claramente

Produto:
${JSON.stringify(payload, null, 2)}
`;

  const r = await ai.models.generateContent({
    model: AI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      candidateCount: 1,
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: 1200,
    },
  });

  const text = String(r.text || "").trim();
  const fontes = extractGroundedSources(r);

  debug("[GROUNDING] texto bruto:", text);
  debug("[GROUNDING] fontes:", fontes);

  if (!text) {
    throw new Error("A Gemini não devolveu texto no grounding.");
  }

  return {
    texto: text,
    fontes,
  };
}

async function groundedTextToStructuredJson(artigo, groundedText, fontes = []) {
  const payload = {
    artigo_interno: artigo.artigo || "",
    descricao_base: artigo.descricao || "",
    codigoBarras: artigo.codigoBarras || "",
    pvp2: artigo.pvp2 || "",
    stock: artigo.stock || "",
    armazem: artigo.armazem || "",
    fontes,
    texto_grounded: groundedText || "",
  };

  const prompt = `
És um assistente para catálogo de produtos.
Responde em português de Portugal.

Usa apenas os dados fornecidos.
Não inventes informação.
Não mistures produtos.
Não deduzas características não explícitas.
Se houver dúvidas no texto_grounded, reflete isso em observacoes_ia.
Devolve apenas JSON válido.

Estrutura obrigatória:
{
  "titulo_oficial": "string",
  "descricao_oficial": "string",
  "caracteristicas_tecnicas": [
    { "chave": "string", "valor": "string" }
  ],
  "resumo_vendedor": "string",
  "observacoes_ia": "string"
}

Dados:
${JSON.stringify(payload, null, 2)}
`;

  const r = await ai.models.generateContent({
    model: AI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: PRODUCT_RESPONSE_SCHEMA,
      candidateCount: 1,
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: 1200,
    },
  });

  const text = String(r.text || "").trim();
  debug("[GROUNDING->JSON] resposta bruta:", text);

  try {
    const parsed = safeParseJson(text);

    return {
      ...parsed,
      caracteristicas_tecnicas: normalizeTechSpecs(
        parsed?.caracteristicas_tecnicas,
      ),
    };
  } catch (error) {
    debug("[GROUNDING->JSON] JSON inválido, a tentar reparar...");
    return await repairBrokenJsonToSchema(text);
  }
}

/* =========================================================
   MAPPERS
   ========================================================= */
function buildGroundingTextResult(
  art,
  groundedText,
  fontes = [],
  marca = "",
  modelo = "",
) {
  return {
    titulo: art.titulo_oficial || art.descricao || art.artigo || "",
    categoria: art.categoria || "",
    marca: art.marca || marca || "",
    modelo: art.modelo || modelo || "",
    caracteristicas_tecnicas: art.caracteristicas_tecnicas || {},
    resumo_vendedor: art.resumo_vendedor || "",
    observacoes: art.observacoes_ia || "",
    fontes,
    texto_grounding: groundedText || "",
    modo_resposta: "texto",
  };
}

function mapArtigoToResultado(art, marca = "", modelo = "") {
  const fontes = Array.isArray(art.documentos_oficiais)
    ? art.documentos_oficiais.filter(Boolean)
    : art.fonte_oficial
      ? [art.fonte_oficial]
      : [];

  return {
    titulo: art.titulo_oficial || art.descricao || art.artigo || "",
    categoria: art.categoria || "",
    marca: art.marca || marca || "",
    modelo: art.modelo || modelo || "",
    caracteristicas_tecnicas: art.caracteristicas_tecnicas || {},
    resumo_vendedor: art.resumo_vendedor || "",
    observacoes: art.observacoes_ia || "",
    fontes,
    texto_grounding: art.texto_grounding || "",
    modo_resposta: art.texto_grounding ? "texto" : "estruturado",
  };
}

/* =========================================================
   MAIN FLOW
   ========================================================= */
async function enrichSingleArticle({ artigoInterno, codigoBarras, descricao }) {
  const db = await loadDB();

  if (!db || !Array.isArray(db.artigos)) {
    throw new Error('O JSON deve ter a estrutura { "artigos": [] }');
  }

  const art = db.artigos.find(
    (item) =>
      (artigoInterno && item.artigo === artigoInterno) ||
      (codigoBarras && item.codigoBarras === codigoBarras),
  );

  if (!art) {
    throw new Error("Artigo não encontrado no JSON.");
  }

  if (hasUsefulTechData(art)) {
    const { marca, modelo } = extractBrandAndModel(art.descricao || descricao);

    return {
      fromCache: true,
      artigoAtualizado: art,
      resultado: mapArtigoToResultado(art, marca, modelo),
    };
  }

  const browser = await chromium.launch({ headless: true });
  const searchPage = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const scrapePage = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  try {
    const descricaoPesquisa = clean(art.descricao || descricao || "");
    const eanPesquisa = clean(art.codigoBarras || codigoBarras || "");

    if (!eanPesquisa) {
      throw new Error("Este modo requer código EAN.");
    }

    const { marca, modelo } = extractBrandAndModel(descricaoPesquisa);

    const candidates = await searchProductCandidates(searchPage, {
      descricao: descricaoPesquisa,
      ean: eanPesquisa,
    });

    let selectedUrl = "";
    let raw = null;
    const candidateErrors = [];

    for (const candidate of candidates.slice(0, MAX_SCRAPE_ATTEMPTS)) {
      try {
        debug("A testar candidato:", {
          score: candidate.score,
          source: candidate.source,
          query: candidate.query,
          link: candidate.link,
        });

        const scraped = await scrape(scrapePage, candidate.link);

        if (
          !pageLooksLikeCorrectProduct(scraped, {
            descricao: descricaoPesquisa,
            ean: eanPesquisa,
          })
        ) {
          candidateErrors.push(
            `Sem correspondência suficiente: ${candidate.link}`,
          );
          continue;
        }

        selectedUrl = candidate.link;
        raw = scraped;
        break;
      } catch (err) {
        candidateErrors.push(
          `[${candidate.link}] ${err?.message || String(err)}`,
        );
      }
    }

    let enriched;
    let extraFontes = [];

    if (!selectedUrl || !raw) {
      debug("Falhas candidatos:", candidateErrors);

      if (!USE_GROUNDING_FALLBACK) {
        throw new Error(
          "Não foi encontrada uma página credível no KuantoKusta para o artigo.",
        );
      }

      debug("[GROUNDING] A usar fallback com Google Search...");
      const grounded = await searchWithGrounding(art);

      extraFontes = grounded.fontes || [];

      Object.assign(art, {
        fonte_oficial: extraFontes[0] || "",
        raw_hash: hash({
          grounded: true,
          descricao: art.descricao || "",
          codigoBarras: art.codigoBarras || "",
          fontes: extraFontes,
          texto_grounding: grounded.texto || "",
        }),
        ultima_atualizacao: new Date().toISOString(),
        observacoes_ia: grounded.texto || "",
        documentos_oficiais: extraFontes,
        texto_grounding: grounded.texto || "",
      });

      await saveDB(db);

      return {
        fromCache: false,
        artigoAtualizado: art,
        resultado: buildGroundingTextResult(
          art,
          grounded.texto,
          extraFontes,
          marca,
          modelo,
        ),
      };
    }

    const h = hash({
      fonte_oficial: raw.fonte_oficial,
      titulo: raw.titulo,
      descricao: raw.descricao,
      caracteristicas: raw.caracteristicas,
      texto: raw.texto,
    });

    enriched = await enrich(art, raw);

    Object.assign(art, {
      fonte_oficial: selectedUrl,
      raw_hash: h,
      ultima_atualizacao: new Date().toISOString(),
      titulo_oficial: enriched.titulo_oficial || "",
      descricao_oficial: enriched.descricao_oficial || "",
      caracteristicas_tecnicas: enriched.caracteristicas_tecnicas || {},
      resumo_vendedor: enriched.resumo_vendedor || "",
      observacoes_ia: enriched.observacoes_ia || "",
      documentos_oficiais: [selectedUrl],
    });

    await saveDB(db);

    return {
      fromCache: false,
      artigoAtualizado: art,
      resultado: {
        ...mapArtigoToResultado(art, marca, modelo),
        fontes: art.documentos_oficiais?.length
          ? art.documentos_oficiais
          : art.fonte_oficial
            ? [art.fonte_oficial]
            : [],
      },
    };
  } finally {
    await searchPage.close().catch(() => {});
    await scrapePage.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/* =========================================================
   API
   ========================================================= */
app.get("/api/artigos", async (_req, res) => {
  try {
    const db = await loadDB();
    return res.json(db);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro ao carregar artigos.",
    });
  }
});

app.post("/api/ai-produto", async (req, res) => {
  try {
    const { artigoInterno, codigoBarras, descricao } = req.body || {};

    if (!artigoInterno && !codigoBarras && !descricao) {
      return res.status(400).json({
        ok: false,
        error: "Faltam dados para identificar o artigo.",
      });
    }

    const result = await enrichSingleArticle({
      artigoInterno,
      codigoBarras,
      descricao,
    });

    return res.json({
      ok: true,
      fromCache: result.fromCache,
      resultado: result.resultado,
      artigoAtualizado: result.artigoAtualizado,
    });
  } catch (error) {
    console.error("Erro /api/ai-produto:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro interno no servidor.",
    });
  }
});

app.listen(3001, () => {
  console.log("API ativa em http://localhost:3001");
});
