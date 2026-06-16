#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  route: path.join(root, "server/routes/quoteDossiers.js"),
  trusted: path.join(root, "server/services/quote-dossiers/quoteDossierTrustedSources.js"),
  web: path.join(root, "server/services/quote-dossiers/quoteDossierWebEnrichmentService.js"),
  enrichment: path.join(root, "server/services/quote-dossiers/quoteDossierEnrichmentService.js"),
};

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Ficheiro não encontrado: ${path.relative(root, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function patchRoute() {
  let source = read(files.route);

  source = source.replaceAll(
    "const dossier = enrichQuoteDossier(parsedDossier);",
    "const dossier = await enrichQuoteDossier(parsedDossier);",
  );

  source = source.replaceAll(
    "const enrichedDossier = enrichQuoteDossier({ ...dossier, items });",
    "const enrichedDossier = await enrichQuoteDossier({ ...dossier, items });",
  );

  write(files.route, source);
}

function patchEnrichmentService() {
  let source = read(files.enrichment);

  if (!source.includes("quoteDossierWebEnrichmentService.js")) {
    source = `import { enrichItemFromVerifiedWeb } from "./quoteDossierWebEnrichmentService.js";\n${source}`;
  }

  source = source.replace(
    "export function enrichQuoteDossier(dossier = {}) {",
    "export async function enrichQuoteDossier(dossier = {}) {",
  );

  source = source.replace(
    "const enrichedItems = items.map((item) => {\n    const curated = findCuratedProduct(item);\n    return mergeItemWithCurated(item, curated);\n  });",
    `const enrichedItems = [];

  for (const item of items) {
    const curated = findCuratedProduct(item);

    if (curated) {
      enrichedItems.push(mergeItemWithCurated(item, curated));
      continue;
    }

    const webItem = await enrichItemFromVerifiedWeb(item);

    if (webItem) {
      enrichedItems.push(webItem);
      continue;
    }

    enrichedItems.push(mergeItemWithCurated(item, null));
  }`,
  );

  source = source.replace(
    'mode: "curated_catalog_v1",',
    'mode: String(process.env.QUOTE_DOSSIER_WEB_ENRICHMENT || "").toLowerCase() === "1" ? "curated_catalog_plus_verified_web_v2" : "curated_catalog_v1",',
  );

  write(files.enrichment, source);
}

write(files.trusted, 'const OFFICIAL_DOMAINS_BY_BRAND = {\n  AEG: ["aeg.pt", "aeg.com.pt"],\n  BOSCH: ["bosch-home.pt", "bosch-home.com"],\n  CANDY: ["candy-home.com", "candy.pt"],\n  CASO: ["caso-design.de", "caso-design.pt"],\n  ELECTROLUX: ["electrolux.pt"],\n  LG: ["lg.com"],\n  SAMSUNG: ["samsung.com"],\n  SIEMENS: ["siemens-home.bsh-group.com", "siemens-home.com", "siemens-home.pt"],\n  TEKA: ["teka.com", "teka.pt"],\n  WHIRLPOOL: ["whirlpool.pt", "whirlpool.eu"],\n  ZANUSSI: ["zanussi.pt"],\n};\n\nconst VERIFIED_RETAILER_DOMAINS = [\n  "worten.pt",\n  "radiopopular.pt",\n  "kuantokusta.pt",\n  "fnac.pt",\n  "elcorteingles.pt",\n  "mediamarkt.pt",\n  "amazon.es",\n];\n\nfunction clean(value = "") {\n  return String(value || "").replace(/\\s+/g, " ").trim();\n}\n\nexport function normalizeDomain(url = "") {\n  try {\n    return new URL(url).hostname.replace(/^www\\./i, "").toLowerCase();\n  } catch {\n    return "";\n  }\n}\n\nexport function inferBrandFromItem(item = {}) {\n  const value = clean(item.brand || item.title || item.description || item.rawDescription || item.reference);\n  const first = value.split(/\\s+/)[0]?.replace(/[^A-Za-zÀ-ÿ0-9-]/g, "").toUpperCase();\n\n  if (first && OFFICIAL_DOMAINS_BY_BRAND[first]) return first;\n\n  for (const brand of Object.keys(OFFICIAL_DOMAINS_BY_BRAND)) {\n    if (value.toUpperCase().includes(brand)) return brand;\n  }\n\n  return first || "";\n}\n\nexport function officialDomainsForBrand(brand = "") {\n  const normalized = clean(brand).toUpperCase();\n  return OFFICIAL_DOMAINS_BY_BRAND[normalized] || [];\n}\n\nexport function trustedDomainsForItem(item = {}) {\n  const brand = inferBrandFromItem(item);\n  const official = officialDomainsForBrand(brand);\n\n  return [...official, ...VERIFIED_RETAILER_DOMAINS];\n}\n\nexport function isOfficialDomain(url = "", item = {}) {\n  const domain = normalizeDomain(url);\n  const brand = inferBrandFromItem(item);\n\n  return officialDomainsForBrand(brand).some((officialDomain) => (\n    domain === officialDomain || domain.endsWith(`.${officialDomain}`)\n  ));\n}\n\nexport function isVerifiedDomain(url = "", item = {}) {\n  const domain = normalizeDomain(url);\n\n  return trustedDomainsForItem(item).some((trustedDomain) => (\n    domain === trustedDomain || domain.endsWith(`.${trustedDomain}`)\n  ));\n}\n\nexport function sourcePriority(url = "", item = {}) {\n  if (isOfficialDomain(url, item)) return 1;\n  if (isVerifiedDomain(url, item)) return 2;\n  return 9;\n}\n\nexport function buildTrustedSearchQuery(item = {}) {\n  const brand = inferBrandFromItem(item);\n  const ean = clean(item.ean);\n  const reference = clean(item.reference || item.title || item.description || item.rawDescription);\n  const officialDomains = officialDomainsForBrand(brand);\n  const domainFilter = officialDomains.length ? `(${officialDomains.map((domain) => `site:${domain}`).join(" OR ")})` : "";\n\n  return [\n    ean || reference,\n    brand && !reference.toUpperCase().includes(brand) ? brand : "",\n    "características ficha técnica imagem",\n    domainFilter,\n  ]\n    .filter(Boolean)\n    .join(" ");\n}\n\nexport function buildVerifiedSearchQuery(item = {}) {\n  const ean = clean(item.ean);\n  const reference = clean(item.reference || item.title || item.description || item.rawDescription);\n  const domains = trustedDomainsForItem(item).slice(0, 10);\n  const domainFilter = domains.length ? `(${domains.map((domain) => `site:${domain}`).join(" OR ")})` : "";\n\n  return [\n    ean || reference,\n    "características imagem ficha técnica",\n    domainFilter,\n  ]\n    .filter(Boolean)\n    .join(" ");\n}\n\nexport function trustedSourcesConfig() {\n  return {\n    officialDomainsByBrand: OFFICIAL_DOMAINS_BY_BRAND,\n    verifiedRetailerDomains: VERIFIED_RETAILER_DOMAINS,\n  };\n}\n');
write(files.web, 'import {\n  buildTrustedSearchQuery,\n  buildVerifiedSearchQuery,\n  inferBrandFromItem,\n  isOfficialDomain,\n  isVerifiedDomain,\n  sourcePriority,\n  normalizeDomain,\n} from "./quoteDossierTrustedSources.js";\n\nconst DEFAULT_TIMEOUT_MS = 12_000;\nconst MAX_HTML_BYTES = 1_500_000;\nconst MAX_IMAGE_BYTES = 4_000_000;\n\nconst enrichmentMemoryCache = new Map();\n\nfunction clean(value = "") {\n  return String(value || "")\n    .replace(/<[^>]+>/g, " ")\n    .replace(/&nbsp;/gi, " ")\n    .replace(/&amp;/gi, "&")\n    .replace(/&quot;/gi, \'"\')\n    .replace(/&#39;/gi, "\'")\n    .replace(/\\s+/g, " ")\n    .trim();\n}\n\nfunction normalizeEan(value = "") {\n  return clean(value).replace(/\\D+/g, "");\n}\n\nfunction normalizeUrl(value = "", baseUrl = "") {\n  try {\n    return new URL(value, baseUrl || undefined).href;\n  } catch {\n    return "";\n  }\n}\n\nfunction userAgent() {\n  return process.env.QUOTE_DOSSIER_FETCH_USER_AGENT\n    || "Mozilla/5.0 PromoPilotQuoteDossierBot/1.0 (+https://promopilot.pt)";\n}\n\nasync function fetchWithTimeout(url, options = {}) {\n  const controller = new AbortController();\n  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);\n\n  try {\n    return await fetch(url, {\n      ...options,\n      signal: controller.signal,\n      headers: {\n        "user-agent": userAgent(),\n        "accept-language": "pt-PT,pt;q=0.9,en;q=0.6",\n        ...(options.headers || {}),\n      },\n    });\n  } finally {\n    clearTimeout(timeout);\n  }\n}\n\nasync function fetchLimitedText(url) {\n  const response = await fetchWithTimeout(url, {\n    timeoutMs: DEFAULT_TIMEOUT_MS,\n    headers: {\n      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",\n    },\n  });\n\n  if (!response.ok) {\n    throw new Error(`HTTP ${response.status}`);\n  }\n\n  const reader = response.body?.getReader?.();\n\n  if (!reader) {\n    const text = await response.text();\n    return text.slice(0, MAX_HTML_BYTES);\n  }\n\n  let received = 0;\n  const chunks = [];\n\n  while (received < MAX_HTML_BYTES) {\n    const { done, value } = await reader.read();\n    if (done) break;\n\n    received += value.byteLength;\n    chunks.push(value);\n  }\n\n  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));\n}\n\nfunction extractMeta(html = "", property = "") {\n  const escaped = property.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");\n  const regexes = [\n    new RegExp(`<meta[^>]+property=["\']${escaped}["\'][^>]+content=["\']([^"\']+)["\'][^>]*>`, "i"),\n    new RegExp(`<meta[^>]+name=["\']${escaped}["\'][^>]+content=["\']([^"\']+)["\'][^>]*>`, "i"),\n    new RegExp(`<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']${escaped}["\'][^>]*>`, "i"),\n    new RegExp(`<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']${escaped}["\'][^>]*>`, "i"),\n  ];\n\n  for (const regex of regexes) {\n    const match = html.match(regex);\n    if (match?.[1]) return clean(match[1]);\n  }\n\n  return "";\n}\n\nfunction extractTitle(html = "") {\n  return clean(html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)?.[1] || "");\n}\n\nfunction extractJsonLd(html = "") {\n  const blocks = [];\n  const regex = /<script[^>]+type=["\']application\\/ld\\+json["\'][^>]*>([\\s\\S]*?)<\\/script>/gi;\n\n  for (const match of html.matchAll(regex)) {\n    const raw = match[1]?.trim();\n\n    if (!raw) continue;\n\n    try {\n      const parsed = JSON.parse(raw);\n      blocks.push(parsed);\n    } catch {\n      // Ignore malformed JSON-LD.\n    }\n  }\n\n  return blocks.flatMap((block) => {\n    if (Array.isArray(block)) return block;\n    if (Array.isArray(block?.["@graph"])) return block["@graph"];\n    return [block];\n  });\n}\n\nfunction findProductJsonLd(jsonLd = []) {\n  return jsonLd.find((entry) => {\n    const type = entry?.["@type"];\n    if (Array.isArray(type)) return type.some((item) => String(item).toLowerCase() === "product");\n    return String(type || "").toLowerCase() === "product";\n  }) || null;\n}\n\nfunction normalizeImages(value) {\n  if (!value) return [];\n  if (Array.isArray(value)) return value.flatMap(normalizeImages);\n  if (typeof value === "string") return [value];\n  if (typeof value === "object" && value.url) return [value.url];\n  return [];\n}\n\nfunction normalizeAdditionalProperties(product = {}) {\n  const properties = product.additionalProperty || product.additionalProperties || [];\n\n  return (Array.isArray(properties) ? properties : [properties])\n    .map((property) => {\n      const name = clean(property?.name || property?.propertyID || "");\n      const value = clean(property?.value || property?.description || "");\n\n      if (!name && !value) return "";\n      if (!name) return value;\n      if (!value) return name;\n      return `${name}: ${value}`;\n    })\n    .filter(Boolean);\n}\n\nfunction extractFeatureCandidatesFromHtml(html = "") {\n  const candidates = [];\n  const listRegex = /<(?:li|td|p)[^>]*>([\\s\\S]*?)<\\/(?:li|td|p)>/gi;\n\n  for (const match of html.matchAll(listRegex)) {\n    const value = clean(match[1]);\n\n    if (\n      value.length >= 12\n      && value.length <= 150\n      && /(\\d|litro|l\\b|kg|cm|mm|w\\b|db|classe|capacidade|dimens|potência|wifi|no frost|airdry|hydroclean|indução|encastre|programa|função)/i.test(value)\n    ) {\n      candidates.push(value);\n    }\n\n    if (candidates.length >= 20) break;\n  }\n\n  return candidates;\n}\n\nfunction unique(values = []) {\n  const seen = new Set();\n\n  return values\n    .map((value) => clean(value))\n    .filter(Boolean)\n    .filter((value) => {\n      const key = value.toLowerCase();\n      if (seen.has(key)) return false;\n      seen.add(key);\n      return true;\n    });\n}\n\nfunction buildCandidateFromHtml({ html, url, result, item }) {\n  const jsonLd = extractJsonLd(html);\n  const product = findProductJsonLd(jsonLd);\n  const title = clean(product?.name || extractMeta(html, "og:title") || extractTitle(html) || result?.title);\n  const description = clean(\n    product?.description\n    || extractMeta(html, "og:description")\n    || extractMeta(html, "description")\n    || result?.snippet\n    || "",\n  );\n\n  const productImages = normalizeImages(product?.image)\n    .map((imageUrl) => normalizeUrl(imageUrl, url))\n    .filter(Boolean);\n\n  const metaImage = normalizeUrl(extractMeta(html, "og:image"), url);\n  const imageUrls = unique([metaImage, ...productImages]).filter(Boolean);\n  const features = unique([\n    ...normalizeAdditionalProperties(product || {}),\n    ...extractFeatureCandidatesFromHtml(html),\n  ]).slice(0, 10);\n\n  const brand = clean(product?.brand?.name || product?.brand || inferBrandFromItem(item));\n  const sku = clean(product?.sku || product?.mpn || item.reference || "");\n  const gtin = normalizeEan(product?.gtin13 || product?.gtin || product?.gtin14 || item.ean || "");\n\n  return {\n    title,\n    description,\n    category: item.category || "",\n    reference: sku,\n    ean: gtin,\n    brand,\n    features,\n    imageUrls,\n    sourceUrl: url,\n    sourceDomain: normalizeDomain(url),\n    sourceType: isOfficialDomain(url, item) ? "official" : "verified",\n    confidence: isOfficialDomain(url, item) ? 0.9 : 0.72,\n  };\n}\n\nasync function searchSerper(query) {\n  const apiKey = process.env.SERPER_API_KEY || process.env.QUOTE_DOSSIER_SERPER_API_KEY;\n\n  if (!apiKey) return [];\n\n  const response = await fetchWithTimeout("https://google.serper.dev/search", {\n    method: "POST",\n    timeoutMs: DEFAULT_TIMEOUT_MS,\n    headers: {\n      "content-type": "application/json",\n      "x-api-key": apiKey,\n    },\n    body: JSON.stringify({\n      q: query,\n      gl: process.env.QUOTE_DOSSIER_SEARCH_GL || "pt",\n      hl: process.env.QUOTE_DOSSIER_SEARCH_HL || "pt-pt",\n      num: 10,\n    }),\n  });\n\n  if (!response.ok) {\n    throw new Error(`Serper HTTP ${response.status}`);\n  }\n\n  const data = await response.json();\n  return Array.isArray(data?.organic) ? data.organic : [];\n}\n\nasync function searchBrave(query) {\n  const apiKey = process.env.BRAVE_SEARCH_API_KEY || process.env.QUOTE_DOSSIER_BRAVE_SEARCH_API_KEY;\n\n  if (!apiKey) return [];\n\n  const url = new URL("https://api.search.brave.com/res/v1/web/search");\n  url.searchParams.set("q", query);\n  url.searchParams.set("count", "10");\n  url.searchParams.set("country", process.env.QUOTE_DOSSIER_SEARCH_COUNTRY || "PT");\n  url.searchParams.set("search_lang", process.env.QUOTE_DOSSIER_SEARCH_LANG || "pt");\n\n  const response = await fetchWithTimeout(url.href, {\n    timeoutMs: DEFAULT_TIMEOUT_MS,\n    headers: {\n      accept: "application/json",\n      "x-subscription-token": apiKey,\n    },\n  });\n\n  if (!response.ok) {\n    throw new Error(`Brave HTTP ${response.status}`);\n  }\n\n  const data = await response.json();\n  return (data?.web?.results || []).map((result) => ({\n    title: result.title,\n    link: result.url,\n    snippet: result.description,\n  }));\n}\n\nasync function searchVerifiedResults(item = {}) {\n  const queries = [\n    buildTrustedSearchQuery(item),\n    buildVerifiedSearchQuery(item),\n  ].filter(Boolean);\n\n  const allResults = [];\n\n  for (const query of queries) {\n    let results = [];\n\n    try {\n      results = await searchSerper(query);\n    } catch (error) {\n      console.warn("[quote-dossiers] Serper search failed:", error?.message || error);\n    }\n\n    if (!results.length) {\n      try {\n        results = await searchBrave(query);\n      } catch (error) {\n        console.warn("[quote-dossiers] Brave search failed:", error?.message || error);\n      }\n    }\n\n    allResults.push(...results);\n  }\n\n  return unique(\n    allResults\n      .filter((result) => result?.link && isVerifiedDomain(result.link, item))\n      .sort((a, b) => sourcePriority(a.link, item) - sourcePriority(b.link, item))\n      .map((result) => JSON.stringify({\n        title: clean(result.title),\n        link: result.link,\n        snippet: clean(result.snippet),\n      })),\n  )\n    .map((value) => JSON.parse(value))\n    .slice(0, Number(process.env.QUOTE_DOSSIER_MAX_SOURCE_PAGES || 4));\n}\n\nasync function imageToDataUrl(imageUrl = "", sourceUrl = "") {\n  const finalUrl = normalizeUrl(imageUrl, sourceUrl);\n\n  if (!finalUrl) return "";\n\n  const response = await fetchWithTimeout(finalUrl, {\n    timeoutMs: DEFAULT_TIMEOUT_MS,\n    headers: {\n      accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",\n    },\n  });\n\n  if (!response.ok) return "";\n\n  const contentType = response.headers.get("content-type") || "";\n  if (!/^image\\/(png|jpe?g|webp|avif)/i.test(contentType)) return "";\n\n  const arrayBuffer = await response.arrayBuffer();\n\n  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) return "";\n\n  const mime = contentType.split(";")[0] || "image/jpeg";\n  return `data:${mime};base64,${Buffer.from(arrayBuffer).toString("base64")}`;\n}\n\nasync function resolveBestImage(candidate = {}) {\n  for (const imageUrl of candidate.imageUrls || []) {\n    try {\n      const dataUrl = await imageToDataUrl(imageUrl, candidate.sourceUrl);\n      if (dataUrl) return dataUrl;\n    } catch {\n      // Try next image.\n    }\n  }\n\n  return "";\n}\n\nfunction mergeCandidateIntoItem(item = {}, candidate = {}, imageDataUrl = "") {\n  const features = unique([\n    ...(candidate.features || []),\n    ...(item.features || []),\n  ]).slice(0, 8);\n\n  return {\n    ...item,\n    title: clean(candidate.title || item.title || item.description || item.rawDescription),\n    description: clean(candidate.title || item.description || item.rawDescription),\n    category: clean(item.category || candidate.category || "Equipamento"),\n    reference: clean(item.reference || candidate.reference || ""),\n    ean: normalizeEan(item.ean || candidate.ean),\n    brand: clean(item.brand || candidate.brand || inferBrandFromItem(item)),\n    technicalDescription: clean(candidate.description || item.technicalDescription || item.description),\n    features,\n    imageDataUrl: item.imageDataUrl || imageDataUrl,\n    enrichment: {\n      status: candidate.sourceType === "official" ? "official_match" : "verified_match",\n      source: candidate.sourceType,\n      confidence: candidate.confidence || 0.7,\n      sourceUrl: candidate.sourceUrl,\n      sourceDomain: candidate.sourceDomain,\n      sourceLabel: candidate.sourceType === "official"\n        ? `Fonte oficial: ${candidate.sourceDomain}`\n        : `Fonte verificada: ${candidate.sourceDomain}`,\n    },\n  };\n}\n\nexport async function enrichItemFromVerifiedWeb(item = {}) {\n  const enabled = String(process.env.QUOTE_DOSSIER_WEB_ENRICHMENT || "").toLowerCase();\n\n  if (!["1", "true", "yes", "on"].includes(enabled)) {\n    return null;\n  }\n\n  const cacheKey = normalizeEan(item.ean) || clean(item.reference || item.description).toLowerCase();\n\n  if (cacheKey && enrichmentMemoryCache.has(cacheKey)) {\n    return enrichmentMemoryCache.get(cacheKey);\n  }\n\n  const results = await searchVerifiedResults(item);\n\n  for (const result of results) {\n    try {\n      const html = await fetchLimitedText(result.link);\n      const candidate = buildCandidateFromHtml({\n        html,\n        url: result.link,\n        result,\n        item,\n      });\n\n      if (!candidate.title && !candidate.description) continue;\n\n      const imageDataUrl = await resolveBestImage(candidate);\n      const enriched = mergeCandidateIntoItem(item, candidate, imageDataUrl);\n\n      if (cacheKey) enrichmentMemoryCache.set(cacheKey, enriched);\n\n      return enriched;\n    } catch (error) {\n      console.warn("[quote-dossiers] source enrichment failed:", result.link, error?.message || error);\n    }\n  }\n\n  return null;\n}\n\nexport function webEnrichmentStatus() {\n  return {\n    enabled: ["1", "true", "yes", "on"].includes(String(process.env.QUOTE_DOSSIER_WEB_ENRICHMENT || "").toLowerCase()),\n    serper: Boolean(process.env.SERPER_API_KEY || process.env.QUOTE_DOSSIER_SERPER_API_KEY),\n    brave: Boolean(process.env.BRAVE_SEARCH_API_KEY || process.env.QUOTE_DOSSIER_BRAVE_SEARCH_API_KEY),\n    cacheSize: enrichmentMemoryCache.size,\n  };\n}\n');
patchEnrichmentService();
patchRoute();

console.log("✅ Enriquecimento automático por fontes oficiais/verificadas v2 aplicado.");
console.log("Alterado:");
console.log(" - server/services/quote-dossiers/quoteDossierTrustedSources.js");
console.log(" - server/services/quote-dossiers/quoteDossierWebEnrichmentService.js");
console.log(" - server/services/quote-dossiers/quoteDossierEnrichmentService.js");
console.log(" - server/routes/quoteDossiers.js");
console.log("");
console.log("Ativar no Render/backend com:");
console.log(" - QUOTE_DOSSIER_WEB_ENRICHMENT=1");
console.log(" - QUOTE_DOSSIER_SERPER_API_KEY=<key>  ou  QUOTE_DOSSIER_BRAVE_SEARCH_API_KEY=<key>");
console.log("");
console.log("Next:");
console.log(" - cd server");
console.log(" - node --check routes/quoteDossiers.js");
console.log(" - node --check services/quote-dossiers/quoteDossierTrustedSources.js");
console.log(" - node --check services/quote-dossiers/quoteDossierWebEnrichmentService.js");
console.log(" - node --check services/quote-dossiers/quoteDossierEnrichmentService.js");
console.log(" - npm start");
