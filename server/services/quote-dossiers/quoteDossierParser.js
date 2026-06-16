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

function normalizeMoney(value = "") {
  return collapseSpaces(value);
}

function parseNumberPt(value = "") {
  const number = Number.parseFloat(
    String(value || "")
      .replace(/\s+/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );

  return Number.isFinite(number) ? number : 0;
}

function formatMoneyPt(value = 0) {
  if (!Number.isFinite(value)) return "";

  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function extractBudgetNumber(text = "") {
  const match = text.match(/\bORC\.[A-Z0-9./-]+/i);
  return match ? match[0].toUpperCase() : "";
}

function extractDate(text = "") {
  const isoDates = [...text.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  if (isoDates.length) return isoDates[0];

  const pt = text.match(/\b\d{2}[-/]\d{2}[-/]\d{2,4}\b/);
  return pt ? pt[0] : "";
}

function findMoneyValues(text = "") {
  return [...String(text || "").matchAll(/(\d{1,3}(?:[\s.]\d{3})*|\d+),\d{2}/g)]
    .map((match) => normalizeMoney(match[0]))
    .filter(Boolean);
}

function extractTotal(text = "", items = []) {
  const normalized = normalizeText(text);

  const totalBlocks = [...normalized.matchAll(/Total\s*\(\s*EUR\s*\)([\s\S]{0,180})/gi)];

  for (const block of totalBlocks) {
    const values = findMoneyValues(block[1])
      .map((value) => ({ value, number: parseNumberPt(value) }))
      .filter((entry) => entry.number > 0);

    if (values.length) {
      const highest = values.reduce((best, entry) => (entry.number > best.number ? entry : best), values[0]);
      return highest.value;
    }
  }

  const direct = normalized.match(/Total\s*\(\s*EUR\s*\)\s*([0-9\s.]+,\d{2})/i);
  if (direct) return normalizeMoney(direct[1]);

  const itemSum = Array.isArray(items)
    ? items.reduce((sum, item) => sum + (Number(item.totalNumber) || parseNumberPt(item.total)), 0)
    : 0;

  if (itemSum > 0) return formatMoneyPt(itemSum);

  const allValues = findMoneyValues(normalized)
    .map((value) => ({ value, number: parseNumberPt(value) }))
    .filter((entry) => entry.number > 0);

  if (!allValues.length) return "";

  return allValues.reduce((best, entry) => (entry.number > best.number ? entry : best), allValues[0]).value;
}

function isLikelyCustomerName(line = "") {
  const clean = collapseSpaces(line);

  if (clean.length < 4) return false;
  if (/\d/.test(clean)) return false;

  return !/^(Rua|RUA|Avenida|AVENIDA|Canada|CANADA|Fonte|FONTE|Porto|PORTO|Praia|PRAIA|Santa|SANTA|Portugal|NIB|Telef|Tel\.|Fax|Contribuinte|Capital|C\.R\.C\.|Alvar[aá]|Empresa|Produtor|P[aá]g\.|Expert|Jos[eé]\s+Tom[aá]s|Descarga|Carga|N\/ Morada|V\/ Morada)/i.test(clean);
}

function extractCustomer(text = "") {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => collapseSpaces(line))
    .filter(Boolean);

  const exmoIndex = lines.findIndex((line) => /Exmo\.\(s\)\s*Sr/i.test(line) || /^Exmo/i.test(line));

  if (exmoIndex > 0) {
    for (let index = exmoIndex - 1; index >= Math.max(0, exmoIndex - 8); index -= 1) {
      const line = lines[index];

      if (isLikelyCustomerName(line)) {
        return line;
      }
    }
  }

  const budgetIndex = lines.findIndex((line) => /Or[çc]amentos\s+OR\s+ORC\./i.test(line));

  if (budgetIndex > 0) {
    for (let index = Math.max(0, budgetIndex - 20); index < budgetIndex; index += 1) {
      const line = lines[index];

      if (isLikelyCustomerName(line) && /^[A-ZÀ-Ý\s.'-]+$/.test(line)) {
        return line;
      }
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
  if (/chamin[eé]|exaustor|camp[âa]nula|hotte/.test(text)) return "Chaminé/exaustor de parede";
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
  if (/esquentador|termoacumulador/.test(text)) return "Aquecimento de água";

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

function parseItemSegment(segment = "") {
  const clean = collapseSpaces(segment.replace(/\n+/g, " "));
  const codeMatch = clean.match(/^(\d{2}\.\d{3}\.\d{3}\.\d{5})\s+(.+)$/);

  if (!codeMatch) return null;

  const articleCode = codeMatch[1];
  const body = codeMatch[2];
  const eanMatch = body.match(/\bEAN\s*:?\s*(\d{8,14})\b/i);
  const ean = eanMatch ? eanMatch[1] : "";

  const withoutEan = body.replace(/\bEAN\s*:?\s*\d{8,14}\b/gi, " ").trim();

  const match = withoutEan.match(/(.+?)\s+(\d+(?:,\d+)?)\s+UN\s+([0-9\s.]+,\d{4})([\s\S]*)$/i);

  if (!match) return null;

  const rawDescription = collapseSpaces(match[1]);
  const quantity = normalizeMoney(match[2]);
  const unitPrice = normalizeMoney(match[3]);
  const trailing = match[4] || "";
  const moneyValues = findMoneyValues(trailing);

  const total = moneyValues.length ? moneyValues[moneyValues.length - 1] : "";
  const brand = inferBrand(rawDescription);
  const reference = inferReference(rawDescription, brand);
  const category = inferCategory(rawDescription);
  const technicalDescription = buildGenericDescription({
    description: rawDescription,
    category,
    brand,
    reference,
  });
  const features = buildGenericFeatures({ category, ean, reference });

  return {
    articleCode,
    rawDescription,
    description: rawDescription,
    brand,
    category,
    reference,
    ean,
    quantity,
    unitPrice,
    total,
    totalNumber: parseNumberPt(total),
    technicalDescription,
    features,
    imageDataUrl: "",
  };
}

function parseItemsFromText(text = "") {
  const normalized = normalizeText(text);
  const startRegex = /\b\d{2}\.\d{3}\.\d{3}\.\d{5}\b/g;
  const starts = [...normalized.matchAll(startRegex)].map((match) => match.index);
  const items = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1] ?? normalized.search(/\n(?:Instala[çc][ãa]o|ENTREGA|Este documento n[ãa]o serve|Quadro Resumo)/i);
    const safeEnd = end > start ? end : normalized.length;
    const segment = normalized.slice(start, safeEnd);
    const item = parseItemSegment(segment);

    if (item && item.rawDescription && item.quantity && item.unitPrice) {
      items.push(item);
    }
  }

  return items;
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
    customerName: extractCustomer(normalized),
    date: extractDate(normalized),
    total: extractTotal(normalized, items),
    notes: "Documento gerado automaticamente a partir do orçamento carregado. Rever fotografias, características e medidas antes de entregar ao cliente.",
    items,
    extractedTextPreview: normalized.slice(0, 3000),
  };
}
