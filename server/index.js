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

const DB_FILE = path.resolve("../src/data/artigos.json");
const MAX_TEXT_LENGTH = 12000;
const MAX_CANDIDATE_LINKS = 12;
const MAX_SCRAPE_ATTEMPTS = 6;
const SEARCH_DEBUG = true;

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

function buildSearchQueries(descricao, ean) {
  const desc = clean(descricao);
  const eanClean = clean(ean);

  const semMarca = desc.replace(/^[^-]+-\s*/, "").trim();
  const semPontuacao = semMarca
    .replace(/[\/.,()[\]"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return uniqueStrings([
    [desc, eanClean].filter(Boolean).join(" ").trim(),
    [semPontuacao, eanClean].filter(Boolean).join(" ").trim(),
    eanClean,
    semPontuacao,
    desc,
  ]);
}

async function loadDB() {
  const raw = await fs.readFile(DB_FILE, "utf8");
  return JSON.parse(raw);
}

async function saveDB(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function extractWrappedUrl(href) {
  try {
    const url = new URL(href);

    if (url.hostname.includes("google.") && url.pathname === "/url") {
      return url.searchParams.get("q") || "";
    }

    if (url.hostname.includes("duckduckgo.com")) {
      return url.searchParams.get("uddg") || href;
    }

    return href;
  } catch {
    return href;
  }
}

function isBlockedDomain(link) {
  try {
    const hostname = new URL(link).hostname.toLowerCase();

    const blockedDomains = [
      "google.com",
      "www.google.com",
      "google.pt",
      "www.google.pt",
      "consent.google.com",
      "accounts.google.com",
      "support.google.com",
      "webcache.googleusercontent.com",
      "youtube.com",
      "www.youtube.com",
      "facebook.com",
      "www.facebook.com",
      "instagram.com",
      "www.instagram.com",
      "tiktok.com",
      "www.tiktok.com",
      "pinterest.com",
      "www.pinterest.com",
      "bing.com",
      "www.bing.com",
      "duckduckgo.com",
      "html.duckduckgo.com",
    ];

    return blockedDomains.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
  } catch {
    return true;
  }
}

function normalizeCandidateLinks(links) {
  return [
    ...new Set(
      links
        .map((href) => String(href || "").trim())
        .filter(Boolean)
        .map((href) => {
          if (href.startsWith("/url?")) {
            return `https://www.google.com${href}`;
          }
          return href;
        })
        .map(extractWrappedUrl)
        .map((href) => String(href || "").trim())
        .filter((href) => href.startsWith("http"))
        .filter((href) => !isBlockedDomain(href)),
    ),
  ];
}

function scoreLink(link, { descricao, ean }) {
  let score = 0;

  const l = normalizeCompare(link);
  const tokens = tokenizeSearch(descricao);

  if (ean && l.includes(normalizeCompare(ean))) {
    score += 100;
  }

  const domainBoosts = [
    "samsung.",
    "lg.",
    "hisense.",
    "bose.",
    "yamaha.",
    "epson.",
    "philips.",
    "logitech.",
    "dji.",
    "ngs.",
    "metronic.",
    "skross.",
    "televes.",
    "equip.",
    "audac.",
    "bosch.",
    "siemens.",
    "electrolux.",
    "whirlpool.",
    "haier.",
    "miele.",
  ];

  for (const domain of domainBoosts) {
    if (l.includes(domain)) {
      score += 25;
    }
  }

  for (const token of tokens) {
    if (l.includes(token)) {
      score += token.length >= 5 ? 5 : 3;
    }

    if (/\d/.test(token) && l.includes(token)) {
      score += 8;
    }
  }

  if (l.includes("product")) score += 3;
  if (l.includes("produto")) score += 3;
  if (l.includes("spec")) score += 4;
  if (l.includes("manual")) score += 4;
  if (l.includes("support")) score += 2;

  return score;
}

async function getLinksFromGoogle(page, query) {
  await page.goto(
    `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );

  await page.waitForTimeout(2500);

  debug("[GOOGLE] query:", query);
  debug("[GOOGLE] final url:", page.url());
  debug("[GOOGLE] title:", await page.title());

  const links = await page.$$eval("a", (els) =>
    els.map((a) => a.getAttribute("href") || a.href || "").filter(Boolean),
  );

  const cleaned = normalizeCandidateLinks(links);
  debug("[GOOGLE] candidatos:", cleaned.slice(0, 10));

  return cleaned;
}

async function getLinksFromDuckDuckGo(page, query) {
  await page.goto(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );

  await page.waitForTimeout(2000);

  debug("[DDG] query:", query);
  debug("[DDG] final url:", page.url());
  debug("[DDG] title:", await page.title());

  const links = await page.$$eval("a", (els) =>
    els.map((a) => a.getAttribute("href") || a.href || "").filter(Boolean),
  );

  const cleaned = normalizeCandidateLinks(links);
  debug("[DDG] candidatos:", cleaned.slice(0, 10));

  return cleaned;
}

async function getLinksFromBing(page, query) {
  await page.goto(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );

  await page.waitForTimeout(2000);

  debug("[BING] query:", query);
  debug("[BING] final url:", page.url());
  debug("[BING] title:", await page.title());

  const links = await page.$$eval("a", (els) =>
    els.map((a) => a.getAttribute("href") || a.href || "").filter(Boolean),
  );

  const cleaned = normalizeCandidateLinks(links);
  debug("[BING] candidatos:", cleaned.slice(0, 10));

  return cleaned;
}

async function searchProductCandidates(page, { descricao, ean }) {
  const queries = buildSearchQueries(descricao, ean);
  const allCandidates = [];

  debug("====================================");
  debug("Descrição pesquisa:", descricao);
  debug("EAN pesquisa:", ean);
  debug("Queries:", queries);
  debug("====================================");

  for (const query of queries) {
    try {
      const googleLinks = await getLinksFromGoogle(page, query);
      allCandidates.push(
        ...googleLinks.map((link) => ({
          link,
          source: "google",
          query,
        })),
      );
    } catch (err) {
      debug("[GOOGLE] erro:", err?.message || err);
    }

    try {
      const ddgLinks = await getLinksFromDuckDuckGo(page, query);
      allCandidates.push(
        ...ddgLinks.map((link) => ({
          link,
          source: "duckduckgo",
          query,
        })),
      );
    } catch (err) {
      debug("[DDG] erro:", err?.message || err);
    }

    try {
      const bingLinks = await getLinksFromBing(page, query);
      allCandidates.push(
        ...bingLinks.map((link) => ({
          link,
          source: "bing",
          query,
        })),
      );
    } catch (err) {
      debug("[BING] erro:", err?.message || err);
    }
  }

  const unique = [];
  const seen = new Set();

  for (const item of allCandidates) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);

    unique.push({
      ...item,
      score: scoreLink(item.link, { descricao, ean }),
    });
  }

  const ranked = unique.sort((a, b) => b.score - a.score);

  debug(
    "Candidatos finais:",
    ranked.slice(0, 15).map((x) => ({
      score: x.score,
      source: x.source,
      query: x.query,
      link: x.link,
    })),
  );

  return ranked.slice(0, MAX_CANDIDATE_LINKS);
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
  const tokens = tokenizeSearch(descricao);

  const eanOk = eanClean ? haystack.includes(eanClean) : false;

  const tokenHits = tokens.filter((t) => haystack.includes(t));
  const numericTokens = tokens.filter((t) => /\d/.test(t));
  const numericHit = numericTokens.some((t) => haystack.includes(t));

  const descOk =
    tokenHits.length >= Math.min(3, tokens.length) ||
    (tokenHits.length >= 2 && numericHit) ||
    (tokens.length <= 2 && tokenHits.length >= 1);

  debug("Validação página:", {
    titulo: raw?.titulo || "",
    eanOk,
    tokenHits,
    tokens,
    numericTokens,
  });

  return eanOk || descOk;
}

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

function safeParseJson(text) {
  const raw = String(text || "").trim();

  if (!raw) {
    throw new Error("Resposta vazia da Gemini.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    // continua
  }

  const semFences = raw
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(semFences);
  } catch {
    // continua
  }

  const first = semFences.indexOf("{");
  const last = semFences.lastIndexOf("}");

  if (first !== -1 && last !== -1 && last > first) {
    const candidate = semFences.slice(first, last + 1);
    return JSON.parse(candidate);
  }

  throw new Error("A Gemini não devolveu JSON válido.");
}

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
  "caracteristicas_tecnicas": {},
  "resumo_vendedor": "string",
  "observacoes_ia": "string"
}

Dados:
${JSON.stringify(payload, null, 2)}
`;

  const r = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = String(r.text || "").trim();
  return safeParseJson(text);
}

function mapArtigoToResultado(art, marca = "", modelo = "") {
  return {
    titulo: art.titulo_oficial || art.descricao || art.artigo || "",
    categoria: art.categoria || "",
    marca: art.marca || marca || "",
    modelo: art.modelo || modelo || "",
    caracteristicas_tecnicas: art.caracteristicas_tecnicas || {},
    resumo_vendedor: art.resumo_vendedor || "",
    observacoes: art.observacoes_ia || "",
    fontes: art.fonte_oficial ? [art.fonte_oficial] : [],
  };
}

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

    if (!descricaoPesquisa && !eanPesquisa) {
      throw new Error("Sem descrição ou EAN para pesquisar o artigo.");
    }

    const { marca, modelo } = extractBrandAndModel(descricaoPesquisa);

    const candidates = await searchProductCandidates(searchPage, {
      descricao: descricaoPesquisa,
      ean: eanPesquisa,
    });

    if (!candidates.length) {
      throw new Error("Não foi encontrada uma página credível para o artigo.");
    }

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

    if (!selectedUrl || !raw) {
      debug("Falhas candidatos:", candidateErrors);
      throw new Error("Não foi encontrada uma página credível para o artigo.");
    }

    const h = hash({
      fonte_oficial: raw.fonte_oficial,
      titulo: raw.titulo,
      descricao: raw.descricao,
      caracteristicas: raw.caracteristicas,
      texto: raw.texto,
    });

    const enriched = await enrich(art, raw);

    Object.assign(art, {
      fonte_oficial: selectedUrl,
      raw_hash: h,
      ultima_atualizacao: new Date().toISOString(),
      titulo_oficial: enriched.titulo_oficial || "",
      descricao_oficial: enriched.descricao_oficial || "",
      caracteristicas_tecnicas: enriched.caracteristicas_tecnicas || {},
      resumo_vendedor: enriched.resumo_vendedor || "",
      observacoes_ia: enriched.observacoes_ia || "",
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