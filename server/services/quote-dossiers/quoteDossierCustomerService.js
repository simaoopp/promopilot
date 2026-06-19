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

const INVALID_CUSTOMER_PATTERNS = [
  /V\/N\.?º?\s*Contrib/i,
  /Requisi[çc][aã]o/i,
  /Desc\.\s*Cli/i,
  /Desc\.\s*Fin/i,
  /Condi[çc][aã]o\s+Pagamento/i,
  /Vencimento/i,
  /Enti?dade/i,
  /PRONTO\s+PAGAMENTO/i,
  /^Rua\b/i,
  /^RUA\b/i,
  /^Avenida\b/i,
  /^AVENIDA\b/i,
  /\bN[ºo]\s*\d/i,
  /^Canada\b/i,
  /^CANADA\b/i,
  /^Fonte\b/i,
  /^FONTE\b/i,
  /^Posto\s+Santo$/i,
  /^POSTO\s+SANTO$/i,
  /^SANTA\s+CRUZ$/i,
  /^Porto\b/i,
  /^PORTO\b/i,
  /^Praia\b/i,
  /^PRAIA\b/i,
  /^Santa\b/i,
  /^SANTA\b/i,
  /^Portugal\b/i,
  /^NIB\b/i,
  /^Telef\b/i,
  /^Tel\.?/i,
  /^Fax\b/i,
  /^Contribuinte\b/i,
  /^Capital\b/i,
  /^C\.R\.C\./i,
  /^Alvar[aá]/i,
  /^Empresa\b/i,
  /^Produtor\b/i,
  /^P[aá]g\.?/i,
  /^Expert\b/i,
  /Jos[eé]\s+Tom[aá]s\s+da\s+Cunha/i,
  /Filhos,\s*Lda/i,
  /\bLda\b/i,
  /^Descarga\b/i,
  /^Carga\b/i,
  /^N\/ Morada/i,
  /^V\/ Morada/i,
  /^Exmo\b/i,
  /^Original\b/i,
  /^Or[çc]amentos\b/i,
  /^Data\b/i,
  /^Artigo\b/i,
  /^Este documento/i,
  /^Total\b/i,
  /^Quadro\b/i,
  /^Aquando\b/i,
  /^ATCUD\b/i,
  /^Respons[aá]vel/i,
  /^Mercadoria/i,
  /^IVA\b/i,
  /^IEC\b/i,
  /^Acerto\b/i,
  /^Portes\b/i,
  /^Desconto/i,
  /^Adiantamentos/i,
];

function isMostlyUppercaseName(value = "") {
  const letters = String(value || "").replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letters) return false;

  const upper = letters.replace(/[^A-ZÀ-Ý]/g, "");
  return upper.length / letters.length >= 0.72;
}

export function normalizeCustomerName(value = "") {
  const candidate = collapseSpaces(value)
    .replace(/^Cliente\s*[:.-]?\s*/i, "")
    .replace(/^Nome\s*[:.-]?\s*/i, "")
    .trim();

  if (!candidate || candidate === "—" || candidate === "-") return "";
  if (candidate.length < 4 || candidate.length > 90) return "";
  if (/[@]|https?:|www\./i.test(candidate)) return "";
  if (/\d/.test(candidate)) return "";
  if (INVALID_CUSTOMER_PATTERNS.some((pattern) => pattern.test(candidate))) return "";

  const words = candidate.match(/[A-Za-zÀ-ÿ]{2,}/g) || [];
  if (words.length < 2) return "";
  if (words.length > 7 && !isMostlyUppercaseName(candidate)) return "";

  return candidate;
}

function extractByExmoNeighborhood(lines = []) {
  const exmoIndexes = [];

  lines.forEach((line, index) => {
    if (/Exmo\.\(s\)\s*Sr/i.test(line) || /^Exmo/i.test(line)) {
      exmoIndexes.push(index);
    }
  });

  for (const exmoIndex of exmoIndexes) {
    const sameLineAfterExmo = collapseSpaces(lines[exmoIndex] || "")
      .split(/Exmo\.\(s\)\s*Sr\.\(s\)|Exmo\.\(s\)\s*Sr|Exmo/i)
      .slice(1)
      .join(" ");

    const sameLineCustomer = normalizeCustomerName(sameLineAfterExmo);
    if (sameLineCustomer) return sameLineCustomer;

    // Prioridade determinística: linhas mais próximas do bloco Exmo.
    // Isto cobre os dois motores: pdf-parse costuma colocar o cliente antes;
    // extração por coordenadas pode colocar depois.
    const preferredIndexes = [
      exmoIndex - 1,
      exmoIndex + 1,
      exmoIndex - 2,
      exmoIndex + 2,
      exmoIndex - 3,
      exmoIndex + 3,
      exmoIndex - 4,
      exmoIndex + 4,
    ];

    for (const index of preferredIndexes) {
      const customer = normalizeCustomerName(lines[index] || "");
      if (customer) return customer;
    }
  }

  return "";
}

function customerScore({ line, index, exmoIndex, budgetIndex }) {
  const words = line.match(/[A-Za-zÀ-ÿ]{2,}/g) || [];
  let score = 0;

  if (isMostlyUppercaseName(line)) score += 10;
  if (words.length === 3) score += 8;
  if (words.length === 2 || words.length === 4) score += 4;
  if (exmoIndex >= 0) score += Math.max(0, 24 - Math.abs(index - exmoIndex));
  if (budgetIndex >= 0 && index < budgetIndex) score += 4;
  if (/&|,|\./.test(line)) score -= 6;
  if (words.length > 5) score -= 6;

  return score;
}

function extractScored(lines = []) {
  const exmoIndex = lines.findIndex((line) => /Exmo\.\(s\)\s*Sr/i.test(line) || /^Exmo/i.test(line));
  const budgetIndex = lines.findIndex((line) => /Or[çc]amentos\s+OR\s+ORC\./i.test(line));

  const from = exmoIndex >= 0 ? Math.max(0, exmoIndex - 22) : 0;
  const to = exmoIndex >= 0
    ? Math.min(lines.length - 1, exmoIndex + 22)
    : budgetIndex > 0
      ? budgetIndex
      : Math.min(lines.length - 1, 80);

  const candidates = [];

  for (let index = from; index <= to; index += 1) {
    const customer = normalizeCustomerName(lines[index]);
    if (!customer) continue;

    candidates.push({
      customer,
      score: customerScore({ line: customer, index, exmoIndex, budgetIndex }),
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0]?.customer || "";
}

export function extractCustomerFromQuoteText(text = "") {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => collapseSpaces(line))
    .filter(Boolean);

  if (!lines.length) return "";

  const byExmo = extractByExmoNeighborhood(lines);
  if (byExmo) return byExmo;

  const byScore = extractScored(lines);
  if (byScore) return byScore;

  return "";
}
