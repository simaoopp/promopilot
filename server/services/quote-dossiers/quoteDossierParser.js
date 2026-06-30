import { extractCustomerFromQuoteText } from "./quoteDossierCustomerService.js";
function normalizeText(value = "") {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseSpaces(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseNumberPt(value = "") {
  const cleaned = String(value || "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function formatMoneyPt(value = 0) {
  if (!Number.isFinite(value)) return "";

  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function findMoneyValues(text = "") {
  return [...String(text || "").matchAll(/\d{1,3}(?:[\s.]\d{3})*,\d{2,4}|\d+,\d{2,4}/g)]
    .map((match) => collapseSpaces(match[0]))
    .filter(Boolean);
}

function extractBudgetNumber(text = "") {
  const match = text.match(/\bORC\.[A-Z0-9./-]+/i);
  return match ? match[0].toUpperCase() : "";
}

function extractDate(text = "") {
  const afterPagamento = text.match(/PRONTO\s+PAGAMENTO\s+.*?\b(20\d{2}-\d{2}-\d{2})\b/i);
  if (afterPagamento) return afterPagamento[1];

  const isoDates = [...text.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  if (isoDates.length) return isoDates[0];

  const pt = text.match(/\b\d{2}[-/]\d{2}[-/]\d{2,4}\b/);
  return pt ? pt[0] : "";
}

function isLikelyCustomerName(line = "") {
  const clean = collapseSpaces(line);

  if (clean.length < 4) return false;
  if (/\d/.test(clean)) return false;

  return !/^(Rua|RUA|Avenida|AVENIDA|Canada|CANADA|Fonte|FONTE|Porto|PORTO|Praia|PRAIA|Santa|SANTA|Portugal|NIB|Telef|Tel\.|Fax|Contribuinte|Capital|C\.R\.C\.|Alvar[aá]|Empresa|Produtor|P[aá]g\.|Expert|Jos[eé]\s+Tom[aá]s|Descarga|Carga|N\/ Morada|V\/ Morada|Exmo|Original|Or[çc]amentos|Data|Artigo|Este documento|Total|Quadro)/i.test(clean);
}

function extractCustomer(text = "") {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => collapseSpaces(line))
    .filter(Boolean);

  function invalidCustomerLine(line = "") {
    return /^(Rua|RUA|Avenida|AVENIDA|Canada|CANADA|Fonte|FONTE|Porto|PORTO|Praia|PRAIA|Santa|SANTA|Portugal|NIB|Telef|Tel\.?|Fax|Contribuinte|Capital|C\.R\.C\.|Alvar[aá]|Empresa|Produtor|P[aá]g\.?|Expert|Jos[eé]\s+Tom[aá]s|Descarga|Carga|N\/ Morada|V\/ Morada|Exmo|Original|Or[çc]amentos|Data|Artigo|Este documento|Total|Quadro|Aquando|ATCUD|Respons[aá]vel)/i.test(line)
      || /V\/N\.?º?\s*Contrib|Requisi[çc][aã]o|Desc\.\s*Cli|Desc\.\s*Fin|Condi[çc][aã]o\s+Pagamento|Vencimento|Enti?dade|PRONTO\s+PAGAMENTO/i.test(line);
  }

  function validCustomerLine(line = "") {
    const clean = collapseSpaces(line);
    const words = clean.match(/[A-ZÀ-Ý]{2,}/g) || [];

    if (clean.length < 4 || clean.length > 90) return false;
    if (words.length < 2) return false;
    if (/[@]|https?:|www\./i.test(clean)) return false;
    if (/\d/.test(clean)) return false;
    if (invalidCustomerLine(clean)) return false;

    return true;
  }

  const exmoIndex = lines.findIndex((line) => /Exmo\.\(s\)\s*Sr/i.test(line) || /^Exmo/i.test(line));

  if (exmoIndex >= 0) {
    for (let index = exmoIndex - 1; index >= Math.max(0, exmoIndex - 12); index -= 1) {
      const line = lines[index];
      if (validCustomerLine(line)) return line;
    }

    for (let index = exmoIndex + 1; index <= Math.min(lines.length - 1, exmoIndex + 14); index += 1) {
      const line = lines[index];
      if (validCustomerLine(line)) return line;
    }
  }

  const budgetIndex = lines.findIndex((line) => /Or[çc]amentos\s+OR\s+ORC\./i.test(line));

  if (budgetIndex > 0) {
    for (let index = Math.max(0, budgetIndex - 35); index < budgetIndex; index += 1) {
      const line = lines[index];

      if (validCustomerLine(line) && /^[A-ZÀ-Ý&.,'\s-]+$/.test(line)) {
        return line;
      }
    }
  }

  return "";
}

function extractTotal(text = "", items = []) {
  const normalized = normalizeText(text);

  const sameLine = normalized.match(/Total\s*\(\s*EUR\s*\)\s*([0-9\s.]+,\d{2})/i);
  if (sameLine) return collapseSpaces(sameLine[1]);

  const totalLine = normalized
    .split("\n")
    .map((line) => collapseSpaces(line))
    .find((line) => /Total\s*\(\s*EUR\s*\)/i.test(line));

  if (totalLine) {
    const values = findMoneyValues(totalLine).filter((value) => parseNumberPt(value) > 0);
    if (values.length) return values[values.length - 1];
  }

  const itemSum = Array.isArray(items)
    ? items.reduce((sum, item) => sum + (Number(item.totalNumber) || parseNumberPt(item.total)), 0)
    : 0;

  if (itemSum > 0) return formatMoneyPt(itemSum);

  const totalBlocks = [...normalized.matchAll(/Total\s*\(\s*EUR\s*\)([\s\S]{0,160})/gi)];

  for (const block of totalBlocks) {
    const values = findMoneyValues(block[1])
      .map((value) => ({ value, number: parseNumberPt(value) }))
      .filter((entry) => entry.number > 0);

    if (values.length) {
      const highest = values.reduce((best, entry) => (entry.number > best.number ? entry : best), values[0]);
      return highest.value;
    }
  }

  return "";
}

function inferBrand(description = "") {
  const text = collapseSpaces(description);
  const beforeDash = text.split(" - ")[0]?.trim();

  if (beforeDash && beforeDash.length <= 30 && /^[A-Za-zÀ-ÿ0-9 ]+$/.test(beforeDash)) {
    return beforeDash.toUpperCase();
  }

  return text.split(/\s+/)[0]?.toUpperCase() || "";
}

function inferReference(description = "", brand = "") {
  let text = collapseSpaces(description);

  if (brand && text.toLowerCase().startsWith(brand.toLowerCase())) {
    text = text.slice(brand.length).trim();
  }

  text = text.replace(/^\s*-\s*/, "").trim();

  const tokens = text
    .split(/\s+/)
    .map((token) => token.replace(/[;,.:]+$/g, ""))
    .filter(Boolean);

  const referenceTokens = tokens.filter((token) => /[A-Z0-9]/i.test(token) && /\d/.test(token) && !/^\d+(?:,\d+)?$/.test(token));

  return referenceTokens.slice(-2).join(" ") || tokens.slice(-3).join(" ");
}

function inferCategory(description = "") {
  const text = String(description || "").toLowerCase();

  if (/micro|microondas|micro-ondas/.test(text)) return "Micro-ondas de encastre";
  if (/chamin[eé]|exaustor|camp[âa]nula|iq700\s+lc/.test(text)) return "Chaminé/exaustor de parede";
  if (/forno/.test(text)) return "Forno multifunções";
  if (/placa|ind[.\s]?/.test(text)) return "Placa de indução";
  if (/m[áa]q.*lavar.*loi[çc]a|lava.*loi[çc]a.*encastre|dishwasher/.test(text)) return "Máquina de lavar loiça de encastre";
  if (/lava[-\s]?loi[çc]a|lava[-\s]?loica/.test(text)) return "Lava-loiça";
  if (/torneira|misturadora/.test(text)) return "Torneira misturadora";
  if (/garrafeira|winechef|wine/.test(text)) return "Garrafeira";
  if (/side by side|french door|frigor|combinado|americano/.test(text)) return "Frigorífico americano/French Door";
  if (/secar roupa|secador/.test(text)) return "Máquina de secar roupa";
  if (/lavar roupa/.test(text)) return "Máquina de lavar roupa";
  if (/tv|televis/.test(text)) return "Televisor";

  return "Equipamento";
}

function buildGenericDescription({ description, category, brand, reference }) {
  const label = [brand, reference].filter(Boolean).join(" ") || description;

  return `${category} ${label ? `incluído no orçamento, identificado como ${label}` : "incluído no orçamento"}. A informação técnica, fotografias, medidas, requisitos de instalação e compatibilidade com o mobiliário devem ser confirmados antes da encomenda definitiva.`;
}

function buildGenericFeatures({ category, ean, reference }) {
  const common = [
    reference ? `Referência/modelo identificado: ${reference}.` : "Referência/modelo a confirmar.",
    ean ? `EAN identificado: ${ean}.` : "EAN não identificado no orçamento.",
    "Quantidade, preço e referência importados automaticamente do documento Primavera/ORC.",
    "Confirmar medidas, instalação, ligações e compatibilidade antes da entrega ao cliente.",
  ];

  if (/Micro/i.test(category)) {
    return ["Equipamento de encastre para cozinha.", "Confirmar nicho de encastre, ventilação e potência elétrica.", ...common];
  }

  if (/Chaminé|exaustor/i.test(category)) {
    return ["Equipamento de extração para instalação em parede.", "Confirmar largura, caudal, saída/recirculação e altura de instalação.", ...common];
  }

  if (/Forno/i.test(category)) {
    return ["Equipamento de encastre para cozinha.", "Confirmar medidas do nicho, potência elétrica e ventilação.", ...common];
  }

  if (/Placa/i.test(category)) {
    return ["Equipamento para instalação em bancada.", "Confirmar potência elétrica, corte de bancada e ventilação.", ...common];
  }

  if (/Frigor/i.test(category)) {
    return ["Equipamento de frio doméstico.", "Confirmar dimensões, abertura de portas, ventilação e acesso ao local.", ...common];
  }

  if (/Garrafeira/i.test(category)) {
    return ["Equipamento para conservação de vinhos.", "Confirmar capacidade, zonas de temperatura, ventilação e local de instalação.", ...common];
  }

  if (/Lava-loiça/i.test(category)) {
    return ["Elemento de cozinha para instalação em bancada.", "Confirmar medidas de corte, cuba, torneira, sifão e acessórios necessários.", ...common];
  }

  if (/Torneira/i.test(category)) {
    return ["Torneira/misturadora para cozinha.", "Confirmar compatibilidade com lava-loiça, bancada e ligações existentes.", ...common];
  }

  return common;
}

function buildItem({ articleCode = "", rawDescription = "", ean = "", quantity = "1,00", unitPrice = "", total = "" } = {}) {
  const description = collapseSpaces(rawDescription)
    .replace(/\bArtigo\b|\bDescri[çc][ãa]o\b|\bQtd\.?\b|\bUn\.?\b|\bPr\.\s*Unit[aá]rio\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!description || description.length < 3) return null;

  const unitNumber = parseNumberPt(unitPrice);
  const quantityNumber = parseNumberPt(quantity) || 1;
  const computedTotal = total || (unitNumber > 0 ? formatMoneyPt(unitNumber * quantityNumber) : "");

  const brand = inferBrand(description);
  const reference = inferReference(description, brand);
  const category = inferCategory(description);
  const technicalDescription = buildGenericDescription({
    description,
    category,
    brand,
    reference,
  });
  const features = buildGenericFeatures({ category, ean, reference });

  return {
    articleCode,
    rawDescription: description,
    description,
    brand,
    category,
    reference,
    ean,
    quantity,
    unitPrice,
    total: computedTotal,
    totalNumber: parseNumberPt(computedTotal),
    technicalDescription,
    features,
    imageDataUrl: "",
  };
}

function parseItemSegment(segment = "") {
  const articleCode = segment.match(/\b\d{2}\.\d{3}\.\d{3}\.\d{5}\b/)?.[0] || "";
  if (!articleCode) return null;

  const ean = segment.match(/\bEAN\s*:?\s*(\d{8,14})\b/i)?.[1] || "";

  const clean = normalizeText(segment)
    .replace(articleCode, " ")
    .replace(/\bEAN\s*:?\s*\d{8,14}\b/gi, " ")
    .replace(/\b(?:0,00\s+){2,}0,00\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const quantityMatch = clean.match(/\b(\d+(?:,\d+)?)\s+UN\b/i);
  if (!quantityMatch?.index && quantityMatch?.index !== 0) return null;

  const quantity = quantityMatch[1] || "1,00";
  const rawDescription = clean.slice(0, quantityMatch.index).trim();
  const afterQuantity = clean.slice(quantityMatch.index + quantityMatch[0].length);
  const moneyAfterQuantity = findMoneyValues(afterQuantity);
  const unitPrice = moneyAfterQuantity[0] || "";
  const total = unitPrice ? formatMoneyPt(parseNumberPt(unitPrice) * (parseNumberPt(quantity) || 1)) : "";

  return buildItem({ articleCode, rawDescription, ean, quantity, unitPrice, total });
}

function parseItemsByArticleCode(text = "") {
  const normalized = normalizeText(text);
  const articleRegex = /\b\d{2}\.\d{3}\.\d{3}\.\d{5}\b/g;
  const starts = [...normalized.matchAll(articleRegex)].map((match) => match.index);

  if (!starts.length) return [];

  const hardEndMatch = normalized.match(/\n(?:Instala[çc][ãa]o|ENTREGA|Este documento n[ãa]o serve|Quadro Resumo|Total\s*\(\s*EUR\s*\))/i);
  const hardEndIndex = hardEndMatch?.index ?? normalized.length;
  const items = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const nextStart = starts[index + 1] ?? hardEndIndex;
    const end = nextStart > start ? nextStart : normalized.length;
    const segment = normalized.slice(start, end);
    const parsed = parseItemSegment(segment);

    if (parsed) items.push(parsed);
  }

  return items;
}

function normalizePotentialItemLine(line = "") {
  return collapseSpaces(line)
    .replace(/E\s*A\s*N\s*:/gi, "EAN:")
    .replace(/U\s*N\b/gi, "UN")
    .replace(/\s+/g, " ")
    .trim();
}

function parseItemLineByEanContext(line = "", ean = "") {
  const clean = normalizePotentialItemLine(line);
  const articleCode = clean.match(/\b\d{2}\.\d{3}\.\d{3}\.\d{5}\b/)?.[0] || "";

  const quantityMatch = clean.match(/\b(\d+(?:,\d+)?)\s+UN\b/i);
  if (!quantityMatch?.index && quantityMatch?.index !== 0) return null;

  let rawDescription = clean.slice(0, quantityMatch.index).trim();

  if (articleCode) {
    rawDescription = rawDescription.replace(articleCode, " ").trim();
  }

  const quantity = quantityMatch[1] || "1,00";
  const afterQuantity = clean.slice(quantityMatch.index + quantityMatch[0].length);
  const moneyValues = findMoneyValues(afterQuantity);

  const unitPrice = moneyValues.find((value) => /\d,\d{4}$/.test(value)) || moneyValues[0] || "";
  const total = unitPrice ? formatMoneyPt(parseNumberPt(unitPrice) * (parseNumberPt(quantity) || 1)) : "";

  return buildItem({ articleCode, rawDescription, ean, quantity, unitPrice, total });
}

function parseItemsByEanFallback(text = "") {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => normalizePotentialItemLine(line))
    .filter(Boolean);

  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const ean = lines[index].match(/\bEAN\s*:?\s*(\d{8,14})\b/i)?.[1] || "";

    if (!ean) continue;

    const candidates = [
      lines[index - 1] || "",
      `${lines[index - 2] || ""} ${lines[index - 1] || ""}`,
      `${lines[index - 3] || ""} ${lines[index - 2] || ""} ${lines[index - 1] || ""}`,
    ]
      .map((line) => normalizePotentialItemLine(line))
      .filter(Boolean);

    let parsed = null;

    for (const candidate of candidates) {
      parsed = parseItemLineByEanContext(candidate, ean);
      if (parsed) break;
    }

    if (parsed) items.push(parsed);
  }

  return items;
}

function parseItemsTableRegexFallback(text = "") {
  const flattened = normalizeText(text).replace(/\n+/g, " ");
  const articlePattern = /(\d{2}\.\d{3}\.\d{3}\.\d{5})\s+(.+?)\s+(\d+(?:,\d+)?)\s+UN\s+([0-9\s.]+,\d{4})[\s\S]{0,120}?EAN\s*:?\s*(\d{8,14})/gi;
  const items = [];

  for (const match of flattened.matchAll(articlePattern)) {
    const [, articleCode, rawDescription, quantity, unitPrice, ean] = match;
    const item = buildItem({
      articleCode,
      rawDescription,
      ean,
      quantity,
      unitPrice,
      total: formatMoneyPt(parseNumberPt(unitPrice) * (parseNumberPt(quantity) || 1)),
    });

    if (item) items.push(item);
  }

  return items;
}

function uniqueItems(items = []) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = item.ean || `${item.articleCode}|${item.description}`;

    if (!key || seen.has(key)) continue;

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function parseItemsFromText(text = "") {
  const byArticle = parseItemsByArticleCode(text);
  if (byArticle.length) return uniqueItems(byArticle);

  const byEan = parseItemsByEanFallback(text);
  if (byEan.length) return uniqueItems(byEan);

  return uniqueItems(parseItemsTableRegexFallback(text));
}

export function parseQuoteDossierFromText(text = "", { filename = "" } = {}) {
  const normalized = normalizeText(text);

  if (!normalized) {
    throw new Error("Não foi possível extrair texto do PDF. Confirma se o ficheiro é um PDF de orçamento pesquisável.");
  }

  const items = parseItemsFromText(normalized);

  return {
    filename,
    budgetNumber: extractBudgetNumber(normalized),
    customerName: extractCustomerFromQuoteText(normalized) || extractCustomer(normalized),
    date: extractDate(normalized),
    total: extractTotal(normalized, items),
    notes: "Documento gerado automaticamente a partir do orçamento carregado. Rever fotografias, características e medidas antes de entregar ao cliente.",
    items,
    extractedTextPreview: normalized.slice(0, 3000),
  };
}
