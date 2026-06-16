const OFFICIAL_DOMAINS_BY_BRAND = {
  AEG: ["aeg.pt", "aeg.com.pt"],
  BOSCH: ["bosch-home.pt", "bosch-home.com"],
  CANDY: ["candy-home.com", "candy.pt"],
  CASO: ["caso-design.de", "caso-design.pt"],
  ELECTROLUX: ["electrolux.pt"],
  LG: ["lg.com"],
  SAMSUNG: ["samsung.com"],
  SIEMENS: ["siemens-home.bsh-group.com", "siemens-home.com", "siemens-home.pt"],
  TEKA: ["teka.com", "teka.pt"],
  WHIRLPOOL: ["whirlpool.pt", "whirlpool.eu"],
  ZANUSSI: ["zanussi.pt"],
};

const VERIFIED_RETAILER_DOMAINS = [
  "worten.pt",
  "radiopopular.pt",
  "kuantokusta.pt",
  "fnac.pt",
  "elcorteingles.pt",
  "mediamarkt.pt",
  "amazon.es",
];

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeDomain(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function inferBrandFromItem(item = {}) {
  const value = clean(item.brand || item.title || item.description || item.rawDescription || item.reference);
  const first = value.split(/\s+/)[0]?.replace(/[^A-Za-zÀ-ÿ0-9-]/g, "").toUpperCase();

  if (first && OFFICIAL_DOMAINS_BY_BRAND[first]) return first;

  for (const brand of Object.keys(OFFICIAL_DOMAINS_BY_BRAND)) {
    if (value.toUpperCase().includes(brand)) return brand;
  }

  return first || "";
}

export function officialDomainsForBrand(brand = "") {
  const normalized = clean(brand).toUpperCase();
  return OFFICIAL_DOMAINS_BY_BRAND[normalized] || [];
}

export function trustedDomainsForItem(item = {}) {
  const brand = inferBrandFromItem(item);
  const official = officialDomainsForBrand(brand);

  return [...official, ...VERIFIED_RETAILER_DOMAINS];
}

export function isOfficialDomain(url = "", item = {}) {
  const domain = normalizeDomain(url);
  const brand = inferBrandFromItem(item);

  return officialDomainsForBrand(brand).some((officialDomain) => (
    domain === officialDomain || domain.endsWith(`.${officialDomain}`)
  ));
}

export function isVerifiedDomain(url = "", item = {}) {
  const domain = normalizeDomain(url);

  return trustedDomainsForItem(item).some((trustedDomain) => (
    domain === trustedDomain || domain.endsWith(`.${trustedDomain}`)
  ));
}

export function sourcePriority(url = "", item = {}) {
  if (isOfficialDomain(url, item)) return 1;
  if (isVerifiedDomain(url, item)) return 2;
  return 9;
}

export function buildTrustedSearchQuery(item = {}) {
  const brand = inferBrandFromItem(item);
  const ean = clean(item.ean);
  const reference = clean(item.reference || item.title || item.description || item.rawDescription);
  const officialDomains = officialDomainsForBrand(brand);
  const domainFilter = officialDomains.length ? `(${officialDomains.map((domain) => `site:${domain}`).join(" OR ")})` : "";

  return [
    ean || reference,
    brand && !reference.toUpperCase().includes(brand) ? brand : "",
    "características ficha técnica imagem",
    domainFilter,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildVerifiedSearchQuery(item = {}) {
  const ean = clean(item.ean);
  const reference = clean(item.reference || item.title || item.description || item.rawDescription);
  const domains = trustedDomainsForItem(item).slice(0, 10);
  const domainFilter = domains.length ? `(${domains.map((domain) => `site:${domain}`).join(" OR ")})` : "";

  return [
    ean || reference,
    "características imagem ficha técnica",
    domainFilter,
  ]
    .filter(Boolean)
    .join(" ");
}

export function trustedSourcesConfig() {
  return {
    officialDomainsByBrand: OFFICIAL_DOMAINS_BY_BRAND,
    verifiedRetailerDomains: VERIFIED_RETAILER_DOMAINS,
  };
}
