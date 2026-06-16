import {
  buildTrustedSearchQuery,
  buildVerifiedSearchQuery,
  inferBrandFromItem,
  isOfficialDomain,
  isVerifiedDomain,
  sourcePriority,
  normalizeDomain,
} from "./quoteDossierTrustedSources.js";

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 4_000_000;

const enrichmentMemoryCache = new Map();

function clean(value = "") {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEan(value = "") {
  return clean(value).replace(/\D+/g, "");
}

function normalizeUrl(value = "", baseUrl = "") {
  try {
    return new URL(value, baseUrl || undefined).href;
  } catch {
    return "";
  }
}

function userAgent() {
  return process.env.QUOTE_DOSSIER_FETCH_USER_AGENT
    || "Mozilla/5.0 PromoPilotQuoteDossierBot/1.0 (+https://promopilot.pt)";
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": userAgent(),
        "accept-language": "pt-PT,pt;q=0.9,en;q=0.6",
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLimitedText(url) {
  const response = await fetchWithTimeout(url, {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader?.();

  if (!reader) {
    const text = await response.text();
    return text.slice(0, MAX_HTML_BYTES);
  }

  let received = 0;
  const chunks = [];

  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    chunks.push(value);
  }

  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

function extractMeta(html = "", property = "") {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexes = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
  ];

  for (const regex of regexes) {
    const match = html.match(regex);
    if (match?.[1]) return clean(match[1]);
  }

  return "";
}

function extractTitle(html = "") {
  return clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function extractJsonLd(html = "") {
  const blocks = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(regex)) {
    const raw = match[1]?.trim();

    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      blocks.push(parsed);
    } catch {
      // Ignore malformed JSON-LD.
    }
  }

  return blocks.flatMap((block) => {
    if (Array.isArray(block)) return block;
    if (Array.isArray(block?.["@graph"])) return block["@graph"];
    return [block];
  });
}

function findProductJsonLd(jsonLd = []) {
  return jsonLd.find((entry) => {
    const type = entry?.["@type"];
    if (Array.isArray(type)) return type.some((item) => String(item).toLowerCase() === "product");
    return String(type || "").toLowerCase() === "product";
  }) || null;
}

function normalizeImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeImages);
  if (typeof value === "string") return [value];
  if (typeof value === "object" && value.url) return [value.url];
  return [];
}

function normalizeAdditionalProperties(product = {}) {
  const properties = product.additionalProperty || product.additionalProperties || [];

  return (Array.isArray(properties) ? properties : [properties])
    .map((property) => {
      const name = clean(property?.name || property?.propertyID || "");
      const value = clean(property?.value || property?.description || "");

      if (!name && !value) return "";
      if (!name) return value;
      if (!value) return name;
      return `${name}: ${value}`;
    })
    .filter(Boolean);
}

function extractFeatureCandidatesFromHtml(html = "") {
  const candidates = [];
  const listRegex = /<(?:li|td|p)[^>]*>([\s\S]*?)<\/(?:li|td|p)>/gi;

  for (const match of html.matchAll(listRegex)) {
    const value = clean(match[1]);

    if (
      value.length >= 12
      && value.length <= 150
      && /(\d|litro|l\b|kg|cm|mm|w\b|db|classe|capacidade|dimens|potência|wifi|no frost|airdry|hydroclean|indução|encastre|programa|função)/i.test(value)
    ) {
      candidates.push(value);
    }

    if (candidates.length >= 20) break;
  }

  return candidates;
}

function unique(values = []) {
  const seen = new Set();

  return values
    .map((value) => clean(value))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildCandidateFromHtml({ html, url, result, item }) {
  const jsonLd = extractJsonLd(html);
  const product = findProductJsonLd(jsonLd);
  const title = clean(product?.name || extractMeta(html, "og:title") || extractTitle(html) || result?.title);
  const description = clean(
    product?.description
    || extractMeta(html, "og:description")
    || extractMeta(html, "description")
    || result?.snippet
    || "",
  );

  const productImages = normalizeImages(product?.image)
    .map((imageUrl) => normalizeUrl(imageUrl, url))
    .filter(Boolean);

  const metaImage = normalizeUrl(extractMeta(html, "og:image"), url);
  const imageUrls = unique([metaImage, ...productImages]).filter(Boolean);
  const features = unique([
    ...normalizeAdditionalProperties(product || {}),
    ...extractFeatureCandidatesFromHtml(html),
  ]).slice(0, 10);

  const brand = clean(product?.brand?.name || product?.brand || inferBrandFromItem(item));
  const sku = clean(product?.sku || product?.mpn || item.reference || "");
  const gtin = normalizeEan(product?.gtin13 || product?.gtin || product?.gtin14 || item.ean || "");

  return {
    title,
    description,
    category: item.category || "",
    reference: sku,
    ean: gtin,
    brand,
    features,
    imageUrls,
    sourceUrl: url,
    sourceDomain: normalizeDomain(url),
    sourceType: isOfficialDomain(url, item) ? "official" : "verified",
    confidence: isOfficialDomain(url, item) ? 0.9 : 0.72,
  };
}

async function searchSerper(query) {
  const apiKey = process.env.SERPER_API_KEY || process.env.QUOTE_DOSSIER_SERPER_API_KEY;

  if (!apiKey) return [];

  const response = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      q: query,
      gl: process.env.QUOTE_DOSSIER_SEARCH_GL || "pt",
      hl: process.env.QUOTE_DOSSIER_SEARCH_HL || "pt-pt",
      num: 10,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper HTTP ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.organic) ? data.organic : [];
}

async function searchBrave(query) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY || process.env.QUOTE_DOSSIER_BRAVE_SEARCH_API_KEY;

  if (!apiKey) return [];

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("country", process.env.QUOTE_DOSSIER_SEARCH_COUNTRY || "PT");
  url.searchParams.set("search_lang", process.env.QUOTE_DOSSIER_SEARCH_LANG || "pt");

  const response = await fetchWithTimeout(url.href, {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    headers: {
      accept: "application/json",
      "x-subscription-token": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave HTTP ${response.status}`);
  }

  const data = await response.json();
  return (data?.web?.results || []).map((result) => ({
    title: result.title,
    link: result.url,
    snippet: result.description,
  }));
}

async function searchVerifiedResults(item = {}) {
  const queries = [
    buildTrustedSearchQuery(item),
    buildVerifiedSearchQuery(item),
  ].filter(Boolean);

  const allResults = [];

  for (const query of queries) {
    let results = [];

    try {
      results = await searchSerper(query);
    } catch (error) {
      console.warn("[quote-dossiers] Serper search failed:", error?.message || error);
    }

    if (!results.length) {
      try {
        results = await searchBrave(query);
      } catch (error) {
        console.warn("[quote-dossiers] Brave search failed:", error?.message || error);
      }
    }

    allResults.push(...results);
  }

  return unique(
    allResults
      .filter((result) => result?.link && isVerifiedDomain(result.link, item))
      .sort((a, b) => sourcePriority(a.link, item) - sourcePriority(b.link, item))
      .map((result) => JSON.stringify({
        title: clean(result.title),
        link: result.link,
        snippet: clean(result.snippet),
      })),
  )
    .map((value) => JSON.parse(value))
    .slice(0, Number(process.env.QUOTE_DOSSIER_MAX_SOURCE_PAGES || 4));
}

async function imageToDataUrl(imageUrl = "", sourceUrl = "") {
  const finalUrl = normalizeUrl(imageUrl, sourceUrl);

  if (!finalUrl) return "";

  const response = await fetchWithTimeout(finalUrl, {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    headers: {
      accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
    },
  });

  if (!response.ok) return "";

  const contentType = response.headers.get("content-type") || "";
  if (!/^image\/(png|jpe?g|webp|avif)/i.test(contentType)) return "";

  const arrayBuffer = await response.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) return "";

  const mime = contentType.split(";")[0] || "image/jpeg";
  return `data:${mime};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
}

async function resolveBestImage(candidate = {}) {
  for (const imageUrl of candidate.imageUrls || []) {
    try {
      const dataUrl = await imageToDataUrl(imageUrl, candidate.sourceUrl);
      if (dataUrl) return dataUrl;
    } catch {
      // Try next image.
    }
  }

  return "";
}

function mergeCandidateIntoItem(item = {}, candidate = {}, imageDataUrl = "") {
  const features = unique([
    ...(candidate.features || []),
    ...(item.features || []),
  ]).slice(0, 8);

  return {
    ...item,
    title: clean(candidate.title || item.title || item.description || item.rawDescription),
    description: clean(candidate.title || item.description || item.rawDescription),
    category: clean(item.category || candidate.category || "Equipamento"),
    reference: clean(item.reference || candidate.reference || ""),
    ean: normalizeEan(item.ean || candidate.ean),
    brand: clean(item.brand || candidate.brand || inferBrandFromItem(item)),
    technicalDescription: clean(candidate.description || item.technicalDescription || item.description),
    features,
    imageDataUrl: item.imageDataUrl || imageDataUrl,
    enrichment: {
      status: candidate.sourceType === "official" ? "official_match" : "verified_match",
      source: candidate.sourceType,
      confidence: candidate.confidence || 0.7,
      sourceUrl: candidate.sourceUrl,
      sourceDomain: candidate.sourceDomain,
      sourceLabel: candidate.sourceType === "official"
        ? `Fonte oficial: ${candidate.sourceDomain}`
        : `Fonte verificada: ${candidate.sourceDomain}`,
    },
  };
}

export async function enrichItemFromVerifiedWeb(item = {}) {
  const enabled = String(process.env.QUOTE_DOSSIER_WEB_ENRICHMENT || "").toLowerCase();

  if (!["1", "true", "yes", "on"].includes(enabled)) {
    return null;
  }

  const cacheKey = normalizeEan(item.ean) || clean(item.reference || item.description).toLowerCase();

  if (cacheKey && enrichmentMemoryCache.has(cacheKey)) {
    return enrichmentMemoryCache.get(cacheKey);
  }

  const results = await searchVerifiedResults(item);

  for (const result of results) {
    try {
      const html = await fetchLimitedText(result.link);
      const candidate = buildCandidateFromHtml({
        html,
        url: result.link,
        result,
        item,
      });

      if (!candidate.title && !candidate.description) continue;

      const imageDataUrl = await resolveBestImage(candidate);
      const enriched = mergeCandidateIntoItem(item, candidate, imageDataUrl);

      if (cacheKey) enrichmentMemoryCache.set(cacheKey, enriched);

      return enriched;
    } catch (error) {
      console.warn("[quote-dossiers] source enrichment failed:", result.link, error?.message || error);
    }
  }

  return null;
}

export function webEnrichmentStatus() {
  return {
    enabled: ["1", "true", "yes", "on"].includes(String(process.env.QUOTE_DOSSIER_WEB_ENRICHMENT || "").toLowerCase()),
    serper: Boolean(process.env.SERPER_API_KEY || process.env.QUOTE_DOSSIER_SERPER_API_KEY),
    brave: Boolean(process.env.BRAVE_SEARCH_API_KEY || process.env.QUOTE_DOSSIER_BRAVE_SEARCH_API_KEY),
    cacheSize: enrichmentMemoryCache.size,
  };
}
