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
  /^Canada\b/i,
  /^CANADA\b/i,
  /^Fonte\b/i,
  /^FONTE\b/i,
  /^Posto\s+Santo$/i,
  /^POSTO\s+SANTO$/i,
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
];

export function normalizeCustomerName(value = "") {
  const candidate = collapseSpaces(value);

  if (!candidate || candidate === "—" || candidate === "-") return "";

  if (candidate.length < 4 || candidate.length > 90) return "";
  if (/[@]|https?:|www\./i.test(candidate)) return "";
  if (/\d/.test(candidate)) return "";
  if (INVALID_CUSTOMER_PATTERNS.some((pattern) => pattern.test(candidate))) return "";

  const words = candidate.match(/[A-Za-zÀ-ÿ]{2,}/g) || [];
  if (words.length < 2) return "";

  return candidate;
}

function firstValidCustomer(lines = [], indexes = []) {
  for (const index of indexes) {
    if (index < 0 || index >= lines.length) continue;

    const valid = normalizeCustomerName(lines[index]);

    if (valid) return valid;
  }

  return "";
}

export function extractCustomerFromQuoteText(text = "") {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => collapseSpaces(line))
    .filter(Boolean);

  if (!lines.length) return "";

  const exmoIndex = lines.findIndex((line) => /Exmo\.\(s\)\s*Sr/i.test(line) || /^Exmo/i.test(line));

  if (exmoIndex >= 0) {
    // Primeiro o caso visual mais comum nos PDFs Primavera extraídos como texto:
    // nome imediatamente antes do marcador Exmo.(s) Sr.(s).
    const before = [];
    for (let index = exmoIndex - 1; index >= Math.max(0, exmoIndex - 12); index -= 1) {
      before.push(index);
    }

    const beforeCustomer = firstValidCustomer(lines, before);
    if (beforeCustomer) return beforeCustomer;

    // Fallback: em alguns motores PDF a coluna do cliente aparece abaixo do Exmo.
    const after = [];
    for (let index = exmoIndex + 1; index <= Math.min(lines.length - 1, exmoIndex + 14); index += 1) {
      after.push(index);
    }

    const afterCustomer = firstValidCustomer(lines, after);
    if (afterCustomer) return afterCustomer;
  }

  // Fallback para blocos antes do título do orçamento.
  const budgetIndex = lines.findIndex((line) => /Or[çc]amentos\s+OR\s+ORC\./i.test(line));

  if (budgetIndex > 0) {
    const indexes = [];

    for (let index = Math.max(0, budgetIndex - 35); index < budgetIndex; index += 1) {
      indexes.push(index);
    }

    const customer = firstValidCustomer(lines, indexes);
    if (customer) return customer;
  }

  return "";
}
