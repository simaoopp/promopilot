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
const STRUCTURED_OUTPUT_MAX_TOKENS = 1400;
const GROUNDING_OUTPUT_MAX_TOKENS = 2200;

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
function logRuntimeInfo(tag = "BOOT") {
  console.log(`[${tag}] cwd=`, process.cwd());
  console.log(`[${tag}] DB_FILE=`, DB_FILE);
  console.log(`[${tag}] GEMINI_API_KEY exists=`, !!process.env.GEMINI_API_KEY);
  console.log(`[${tag}] NODE_ENV=`, process.env.NODE_ENV || "");
  console.log(`[${tag}] NETLIFY=`, process.env.NETLIFY || "");
}

function debug(...args) {
  if (SEARCH_DEBUG) {
    console.log(...args);
  }
}

function clean(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
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

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => clean(value)))];
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
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .filter((token) => !stopwords.has(token)),
  );
}

function hasUsefulTechData(item) {
  if (
    !item?.caracteristicas_tecnicas ||
    typeof item.caracteristicas_tecnicas !== "object"
  ) {
    return false;
  }

  const blacklist = new Set(["estado", "info", "alterado"]);

  const validEntries = Object.entries(item.caracteristicas_tecnicas)
    .filter(([key, value]) => clean(key) && clean(value))
    .filter(([key]) => !blacklist.has(normalizeCompare(key)));

  const hasResumo = !!clean(item?.resumo_vendedor || "");
  const hasFontes = Array.isArray(item?.documentos_oficiais)
    ? item.documentos_oficiais.some(Boolean)
    : !!clean(item?.fonte_oficial || "");

  return validEntries.length >= 2 || hasResumo || hasFontes;
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
    const output = {};

    for (const item of value) {
      const chave = clean(item?.chave || "");
      const valor = clean(item?.valor || "");

      if (chave && valor) {
        output[chave] = valor;
      }
    }

    return output;
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

  const withoutFences = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  attempts.push(withoutFences);

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(withoutFences.slice(firstBrace, lastBrace + 1));
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

function buildEmptyStructuredResult(rawText = "") {
  return {
    titulo_oficial: "",
    descricao_oficial: "",
    caracteristicas_tecnicas: {},
    resumo_vendedor: "",
    observacoes_ia: clean(rawText || ""),
  };
}

function extractStructuredFieldsFromText(rawText = "") {
  const text = String(rawText || "").trim();

  if (!text) {
    return buildEmptyStructuredResult("");
  }

  const normalized = text.replace(/\r/g, "").replace(/\n{2,}/g, "\n").trim();

  const lines = normalized
    .split("\n")
    .map((line) => clean(line))
    .filter(Boolean);

  const result = {
    titulo_oficial: "",
    descricao_oficial: "",
    caracteristicas_tecnicas: {},
    resumo_vendedor: "",
    observacoes_ia: "",
  };

  let specsMode = false;

  for (const line of lines) {
    if (/^t[ií]tulo confirmado:/i.test(line)) {
      result.titulo_oficial = clean(
        line.replace(/^t[ií]tulo confirmado:/i, ""),
      );
      specsMode = false;
      continue;
    }

    if (/^descri[cç][aã]o confirmada:/i.test(line)) {
      result.descricao_oficial = clean(
        line.replace(/^descri[cç][aã]o confirmada:/i, ""),
      );
      specsMode = false;
      continue;
    }

    if (/^resumo para vendedor:/i.test(line)) {
      result.resumo_vendedor = clean(
        line.replace(/^resumo para vendedor:/i, ""),
      );
      specsMode = false;
      continue;
    }

    if (
      /^observa[cç][õo]es relevantes:/i.test(line) ||
      /^observa[cç][õo]es:/i.test(line)
    ) {
      result.observacoes_ia = clean(
        line
          .replace(/^observa[cç][õo]es relevantes:/i, "")
          .replace(/^observa[cç][õo]es:/i, ""),
      );
      specsMode = false;
      continue;
    }

    if (/^caracter[ií]sticas t[eé]cnicas encontradas:/i.test(line)) {
      const afterHeader = clean(
        line.replace(/^caracter[ií]sticas t[eé]cnicas encontradas:/i, ""),
      );

      if (afterHeader) {
        const idx = afterHeader.indexOf(":");
        if (idx > 0) {
          const key = clean(afterHeader.slice(0, idx));
          const value = clean(afterHeader.slice(idx + 1));
          if (key && value) {
            result.caracteristicas_tecnicas[key] = value;
          }
        }
      }

      specsMode = true;
      continue;
    }

    if (specsMode) {
      const bulletLine = line.replace(/^[-•*]\s*/, "");
      const idx = bulletLine.indexOf(":");

      if (idx > 0) {
        const key = clean(bulletLine.slice(0, idx));
        const value = clean(bulletLine.slice(idx + 1));

        if (key && value) {
          result.caracteristicas_tecnicas[key] = value;
          continue;
        }
      }
    }

    if (!result.observacoes_ia) {
      result.observacoes_ia = line;
    } else {
      result.observacoes_ia = `${result.observacoes_ia} ${line}`.trim();
    }
  }

  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("503") ||
    message.includes("service unavailable") ||
    message.includes("high demand") ||
    message.includes("unavailable") ||
    message.includes("deadline exceeded") ||
    message.includes("overloaded")
  );
}

async function generateContentWithRetry(
  request,
  {
    maxRetries = 4,
    initialDelayMs = 1500,
    maxDelayMs = 10000,
  } = {},
) {
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      attempt += 1;

      const retryable = isRetryableGeminiError(error);
      const isLastAttempt = attempt > maxRetries;

      console.error("[GEMINI] erro na chamada:", {
        attempt,
        retryable,
        message: error?.message || String(error),
      });

      if (!retryable || isLastAttempt) {
        throw error;
      }

      await sleep(delay);
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
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

  try {
    const response = await generateContentWithRetry({
      model: AI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: PRODUCT_RESPONSE_SCHEMA,
        candidateCount: 1,
        temperature: 0,
        topP: 0.9,
        maxOutputTokens: STRUCTURED_OUTPUT_MAX_TOKENS,
      },
    });

    const text = String(response.text || "").trim();
    debug("[JSON-REPAIR] resposta:", text);

    const parsed = safeParseJson(text);

    return {
      ...parsed,
      caracteristicas_tecnicas: normalizeTechSpecs(
        parsed?.caracteristicas_tecnicas,
      ),
    };
  } catch (error) {
    console.error("[JSON-REPAIR] falhou, a usar extração local:", {
      error: error?.message || String(error),
      rawPreview: String(rawText || "").slice(0, 1000),
    });

    const extracted = extractStructuredFieldsFromText(rawText);

    return {
      ...buildEmptyStructuredResult(rawText),
      ...extracted,
      caracteristicas_tecnicas: normalizeTechSpecs(
        extracted?.caracteristicas_tecnicas,
      ),
    };
  }
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

function resolveArticle(artigos, { artigoInterno, codigoBarras }) {
  if (artigoInterno) {
    const byInternalCode = artigos.find(
      (item) => item.artigo === artigoInterno,
    );
    if (byInternalCode) {
      return byInternalCode;
    }
  }

  if (codigoBarras) {
    const byBarcode = artigos.find(
      (item) => item.codigoBarras === codigoBarras,
    );
    if (byBarcode) {
      return byBarcode;
    }
  }

  return null;
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
    {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    },
  );

  await page.waitForTimeout(2000);

  const links = await page.$$eval(
    "li.b_algo h2 a, a[href^='http']",
    (elements) =>
      elements
        .map((anchor) => anchor.getAttribute("href") || anchor.href || "")
        .filter(Boolean),
  );

  return [
    ...new Set(
      links
        .map((href) => String(href || "").trim())
        .filter((href) => /^https?:\/\//i.test(href))
        .filter((href) => isKuantokustaProductUrl(href)),
    ),
  ]
    .map((link, index) => ({
      link,
      source: "bing-site-kuantokusta",
      query,
      score: 1000 - index,
    }))
    .slice(0, MAX_CANDIDATE_LINKS);
}

function pageLooksLikeCorrectProduct(raw, { descricao, ean }) {
  const haystack = normalizeCompare(
    [
      raw?.titulo || "",
      raw?.descricao || "",
      raw?.texto || "",
      Object.entries(raw?.caracteristicas || {})
        .map(([key, value]) => `${key} ${value}`)
        .join(" "),
    ].join(" "),
  );

  const eanClean = normalizeCompare(ean);

  if (eanClean) {
    return haystack.includes(eanClean);
  }

  const tokens = tokenizeSearch(descricao);
  const tokenHits = tokens.filter((token) => haystack.includes(token));

  return tokenHits.length >= Math.min(3, tokens.length);
}

/* =========================================================
   SCRAPE
   ========================================================= */
function extractSpecs($) {
  const specs = {};

  $("table tr").each((_, tr) => {
    const cells = $(tr).find("th,td");

    if (cells.length >= 2) {
      const key = clean($(cells[0]).text());
      const value = clean($(cells[1]).text());

      if (key && value && key.length <= 120) {
        specs[key] = value;
      }
    }
  });

  $("dl").each((_, dl) => {
    const terms = $(dl).find("dt");

    terms.each((index, dt) => {
      const key = clean($(dt).text());
      const value = clean($(dl).find("dd").eq(index).text());

      if (key && value && key.length <= 120) {
        specs[key] = value;
      }
    });
  });

  $("li").each((_, li) => {
    const text = clean($(li).text());

    if (!text.includes(":")) {
      return;
    }

    const index = text.indexOf(":");
    const key = clean(text.slice(0, index));
    const value = clean(text.slice(index + 1));

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

  const response = await generateContentWithRetry({
    model: AI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: PRODUCT_RESPONSE_SCHEMA,
      candidateCount: 1,
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: STRUCTURED_OUTPUT_MAX_TOKENS,
    },
  });

  const text = String(response.text || "").trim();
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

Quero a resposta em TEXTO SIMPLES, organizada exatamente com estas secções e nesta ordem.
Não uses markdown.
Não uses [cite], [source], notas de rodapé, colchetes de citação nem referências inline.
Cada secção deve começar numa nova linha.

Formato obrigatório:

Título confirmado:
<texto>

Descrição confirmada:
<texto>

Marca:
<texto>

Modelo:
<texto>

Série:
<texto>

Categoria:
<texto>

Características técnicas encontradas:
- chave: valor
- chave: valor
- chave: valor

Resumo para vendedor:
<texto>

Observações relevantes:
<texto>

Se houver dúvida de correspondência, diz isso claramente em "Observações relevantes".

Produto:
${JSON.stringify(payload, null, 2)}
`;

  const response = await generateContentWithRetry({
    model: AI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      candidateCount: 1,
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: GROUNDING_OUTPUT_MAX_TOKENS,
    },
  });

  const text = String(response.text || "").trim();
  const fontes = extractGroundedSources(response);

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

  const response = await generateContentWithRetry({
    model: AI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: PRODUCT_RESPONSE_SCHEMA,
      candidateCount: 1,
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: STRUCTURED_OUTPUT_MAX_TOKENS,
    },
  });

  const text = String(response.text || "").trim();

  try {
    const parsed = safeParseJson(text);

    return {
      ...parsed,
      caracteristicas_tecnicas: normalizeTechSpecs(
        parsed?.caracteristicas_tecnicas,
      ),
    };
  } catch (error) {
    console.error("[GROUNDING->JSON] JSON inválido, a tentar reparar...", {
      error: error?.message || String(error),
      rawPreview: text.slice(0, 1000),
    });

    return await repairBrokenJsonToSchema(text);
  }
}

/* =========================================================
   MAPPERS
   ========================================================= */
function mapArtigoToResultado(art, marca = "", modelo = "") {
  const fontes = Array.isArray(art.documentos_oficiais)
    ? art.documentos_oficiais.filter(Boolean)
    : art.fonte_oficial
      ? [art.fonte_oficial]
      : [];

  const caracteristicas = art.caracteristicas_tecnicas || {};
  const temEstrutura =
    Object.keys(caracteristicas).length > 0 ||
    !!clean(art.resumo_vendedor || "") ||
    !!clean(art.observacoes_ia || "");

  return {
    titulo:
      art.titulo_oficial ||
      art.descricao_oficial ||
      art.descricao ||
      art.artigo ||
      "",
    categoria: art.categoria || "",
    marca: art.marca || marca || "",
    modelo: art.modelo || modelo || "",
    caracteristicas_tecnicas: caracteristicas,
    resumo_vendedor: art.resumo_vendedor || "",
    observacoes: art.observacoes_ia || "",
    fontes,
    texto_grounding: art.texto_grounding || "",
    modo_resposta: temEstrutura
      ? "estruturado"
      : art.texto_grounding
        ? "texto"
        : "estruturado",
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

  const art = resolveArticle(db.artigos, { artigoInterno, codigoBarras });

  if (!art) {
    throw new Error("Artigo não encontrado no JSON.");
  }

  const descricaoPesquisa = clean(art.descricao || descricao || "");
  const eanPesquisa = clean(art.codigoBarras || codigoBarras || "");
  const { marca, modelo } = extractBrandAndModel(descricaoPesquisa);

  if (hasUsefulTechData(art)) {
    return {
      fromCache: true,
      artigoAtualizado: art,
      resultado: mapArtigoToResultado(art, marca, modelo),
    };
  }

  const applyGroundingFallback = async () => {
    const grounded = await searchWithGrounding(art);
    const structured = await groundedTextToStructuredJson(
      art,
      grounded.texto,
      grounded.fontes || [],
    );

    Object.assign(art, {
      marca: art.marca || marca || "",
      modelo: art.modelo || modelo || "",
      fonte_oficial: grounded.fontes?.[0] || "",
      raw_hash: hash({
        grounded: true,
        descricao: art.descricao || "",
        codigoBarras: art.codigoBarras || "",
        fontes: grounded.fontes || [],
        texto_grounding: grounded.texto || "",
      }),
      ultima_atualizacao: new Date().toISOString(),
      titulo_oficial: structured.titulo_oficial || art.titulo_oficial || "",
      descricao_oficial:
        structured.descricao_oficial || art.descricao_oficial || "",
      caracteristicas_tecnicas: structured.caracteristicas_tecnicas || {},
      resumo_vendedor: structured.resumo_vendedor || "",
      observacoes_ia:
        structured.observacoes_ia || grounded.texto || art.observacoes_ia || "",
      documentos_oficiais: grounded.fontes || [],
      texto_grounding: grounded.texto || "",
    });

    await saveDB(db);

    return {
      fromCache: false,
      artigoAtualizado: art,
      resultado: mapArtigoToResultado(art, marca, modelo),
    };
  };

  if (!eanPesquisa) {
    if (!USE_GROUNDING_FALLBACK) {
      throw new Error("Este modo requer código EAN.");
    }

    return applyGroundingFallback();
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
    const candidates = await searchProductCandidates(searchPage, {
      descricao: descricaoPesquisa,
      ean: eanPesquisa,
    });

    let selectedUrl = "";
    let raw = null;

    for (const candidate of candidates.slice(0, MAX_SCRAPE_ATTEMPTS)) {
      try {
        const scraped = await scrape(scrapePage, candidate.link);

        if (
          !pageLooksLikeCorrectProduct(scraped, {
            descricao: descricaoPesquisa,
            ean: eanPesquisa,
          })
        ) {
          continue;
        }

        selectedUrl = candidate.link;
        raw = scraped;
        break;
      } catch (error) {
        debug(
          "[SCRAPE] erro no candidato:",
          candidate.link,
          error?.message || error,
        );
      }
    }

    if (!selectedUrl || !raw) {
      if (!USE_GROUNDING_FALLBACK) {
        throw new Error(
          "Não foi encontrada uma página credível no KuantoKusta para o artigo.",
        );
      }

      return applyGroundingFallback();
    }

    const enriched = await enrich(art, raw);

    Object.assign(art, {
      marca: art.marca || marca || "",
      modelo: art.modelo || modelo || "",
      fonte_oficial: selectedUrl,
      raw_hash: hash({
        fonte_oficial: raw.fonte_oficial,
        titulo: raw.titulo,
        descricao: raw.descricao,
        caracteristicas: raw.caracteristicas,
        texto: raw.texto,
      }),
      ultima_atualizacao: new Date().toISOString(),
      titulo_oficial: enriched.titulo_oficial || "",
      descricao_oficial: enriched.descricao_oficial || "",
      caracteristicas_tecnicas: enriched.caracteristicas_tecnicas || {},
      resumo_vendedor: enriched.resumo_vendedor || "",
      observacoes_ia: enriched.observacoes_ia || "",
      documentos_oficiais: [selectedUrl],
      texto_grounding: "",
    });

    await saveDB(db);

    return {
      fromCache: false,
      artigoAtualizado: art,
      resultado: mapArtigoToResultado(art, marca, modelo),
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
    if (isRetryableGeminiError(error)) {
      return res.status(503).json({
        ok: false,
        error:
          "A Gemini está com elevada procura neste momento. Tenta novamente dentro de instantes.",
      });
    }

    console.error("Erro /api/ai-produto:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro interno no servidor.",
    });
  }
});

app.listen(3001, () => {
  logRuntimeInfo("LISTEN");
  console.log("API ativa em http://localhost:3001");
});