function normalizeText(value = "") {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeMoney(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
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

function titleCase(value = "") {
  const text = String(value || "").trim();

  if (!text) return "";

  return text
    .toLowerCase()
    .replace(/\b([\p{L}])/gu, (match) => match.toUpperCase());
}

function extractBudgetNumber(text = "") {
  const match = text.match(/\bORC\.[A-Z0-9./-]+/i);
  return match ? match[0].toUpperCase() : "";
}

function extractDate(text = "") {
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];

  const pt = text.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b|\b\d{2}[-/]\d{2}[-/]\d{2,4}\b/);
  return pt ? pt[0] : "";
}

function extractTotal(text = "") {
  const totalMatch = text.match(/Total\s*\(\s*EUR\s*\)\s*([\d\s.]+,\d{2})/i);
  if (totalMatch) return normalizeMoney(totalMatch[1]);

  const matches = [...text.matchAll(/([\d\s.]+,\d{2})/g)].map((match) => normalizeMoney(match[1]));
  return matches.length ? matches[matches.length - 1] : "";
}

function extractCustomer(text = "") {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const exmoIndex = lines.findIndex((line) => /Exmo/i.test(line));

  if (exmoIndex >= 0) {
    for (let index = exmoIndex + 1; index < Math.min(lines.length, exmoIndex + 8); index += 1) {
      const line = lines[index];

      if (
        line.length >= 5 &&
        !/^(Rua|RUA|NIB|Telef|Tel\.|Fax|Contribuinte|Capital|C\.R\.C\.|Alvará|Empresa|Produtor|Pág\.)/i.test(line) &&
        !/\d{4}-\d{3}/.test(line)
      ) {
        return titleCase(line);
      }
    }
  }

  return "";
}

function inferBrand(description = "") {
  const text = String(description || "").trim();
  const beforeDash = text.split(" - ")[0]?.trim();

  if (beforeDash && beforeDash.length <= 30 && /^[A-Za-zÀ-ÿ0-9 ]+$/.test(beforeDash)) {
    return beforeDash.toUpperCase();
  }

  return text.split(/\s+/)[0]?.toUpperCase() || "";
}

function inferReference(description = "", brand = "") {
  let text = String(description || "").trim();

  if (brand && text.toLowerCase().startsWith(brand.toLowerCase())) {
    text = text.slice(brand.length).trim();
  }

  text = text.replace(/^\s*-\s*/, "").trim();

  const tokens = text.split(/\s+/).filter(Boolean);
  const referenceTokens = tokens.filter((token) => /[A-Z0-9]/i.test(token) && /\d/.test(token));

  return referenceTokens.slice(-3).join(" ") || tokens.slice(-3).join(" ");
}

function inferCategory(description = "") {
  const text = String(description || "").toLowerCase();

  if (/micro/.test(text)) return "Micro-ondas";
  if (/forno/.test(text)) return "Forno de encastre";
  if (/placa|ind[.\s]?/.test(text)) return "Placa de indução";
  if (/loi[çc]a|lava.*loi/.test(text)) return "Máquina de lavar loiça";
  if (/side by side|frigor|combinado|americano/.test(text)) return "Frigorífico";
  if (/secar roupa|secador/.test(text)) return "Máquina de secar roupa";
  if (/lavar roupa/.test(text)) return "Máquina de lavar roupa";
  if (/tv|televis/.test(text)) return "Televisor";
  if (/exaustor/.test(text)) return "Exaustor";
  if (/esquentador|termoacumulador/.test(text)) return "Aquecimento de água";

  return "Equipamento";
}

function buildGenericDescription({ description, category, brand, reference }) {
  const label = [brand, reference].filter(Boolean).join(" ") || description;

  return `${category} ${label ? `incluído no orçamento, identificado como ${label}` : "incluído no orçamento"}. A informação técnica deve ser confirmada antes da encomenda definitiva, instalação ou integração no mobiliário existente.`;
}

function buildGenericFeatures({ category, ean }) {
  const common = [
    "Equipamento incluído no orçamento carregado.",
    ean ? `EAN identificado: ${ean}.` : "EAN não identificado no orçamento.",
    "Quantidade, preço e referência importados automaticamente do documento.",
    "Confirmar medidas, instalação, ligações e compatibilidade antes da entrega.",
  ];

  if (/Micro/i.test(category)) {
    return ["Instalação e utilização conforme ficha técnica do fabricante.", "Confirmar medidas de encastre e ventilação.", ...common];
  }

  if (/Forno/i.test(category)) {
    return ["Equipamento de encastre para cozinha.", "Confirmar medidas do nicho e requisitos elétricos.", ...common];
  }

  if (/Placa/i.test(category)) {
    return ["Equipamento para instalação em bancada.", "Confirmar potência elétrica, corte de bancada e ventilação.", ...common];
  }

  if (/Frigor/i.test(category)) {
    return ["Equipamento de frio doméstico.", "Confirmar dimensões, abertura de portas, ventilação e acesso ao local.", ...common];
  }

  return common;
}

function parseItemBuffer(buffer = "") {
  const clean = buffer.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const eanMatch = clean.match(/\bEAN\s*:?\s*(\d{8,14})/i);
  const ean = eanMatch ? eanMatch[1] : "";

  const withoutEan = clean.replace(/\bEAN\s*:?\s*\d{8,14}\b/i, "").trim();
  const codeMatch = withoutEan.match(/^(\d{2}\.\d{3}\.\d{3}\.\d{5})\s+(.+)$/);

  if (!codeMatch) return null;

  const articleCode = codeMatch[1];
  const rest = codeMatch[2];

  const match = rest.match(/(.+?)\s+(\d+(?:,\d+)?)\s+UN\s+([\d\s.]+,\d{4})(?:\s+[\d\s.]+,\d{2}){0,5}\s+([\d\s.]+,\d{2})\s*$/i);

  if (!match) return null;

  const rawDescription = match[1].trim();
  const quantity = match[2].trim();
  const unitPrice = normalizeMoney(match[3]);
  const total = normalizeMoney(match[4]);
  const brand = inferBrand(rawDescription);
  const reference = inferReference(rawDescription, brand);
  const category = inferCategory(rawDescription);
  const description = buildGenericDescription({
    description: rawDescription,
    category,
    brand,
    reference,
  });
  const features = buildGenericFeatures({ category, ean });

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
    technicalDescription: description,
    features,
    imageDataUrl: "",
  };
}

export function parseQuoteDossierFromText(text = "", { filename = "" } = {}) {
  const normalized = normalizeText(text);

  if (!normalized) {
    throw new Error("Não foi possível extrair texto do PDF. Confirma se o ficheiro é um PDF de orçamento pesquisável.");
  }

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const items = [];
  let current = "";

  for (const line of lines) {
    if (/^\d{2}\.\d{3}\.\d{3}\.\d{5}\b/.test(line)) {
      if (current) {
        const parsed = parseItemBuffer(current);
        if (parsed) items.push(parsed);
      }

      current = line;
      continue;
    }

    if (current) {
      current += `\n${line}`;

      if (/\bEAN\s*:?\s*\d{8,14}\b/i.test(line)) {
        const parsed = parseItemBuffer(current);
        if (parsed) items.push(parsed);
        current = "";
      }
    }
  }

  if (current) {
    const parsed = parseItemBuffer(current);
    if (parsed) items.push(parsed);
  }

  return {
    filename,
    budgetNumber: extractBudgetNumber(normalized),
    customerName: extractCustomer(normalized),
    date: extractDate(normalized),
    total: extractTotal(normalized),
    notes: "Documento gerado automaticamente a partir do orçamento carregado. Rever fotografias, características e medidas antes de entregar ao cliente.",
    items,
    extractedTextPreview: normalized.slice(0, 3000),
  };
}
