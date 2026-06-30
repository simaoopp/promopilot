#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  route: path.join(root, "server/routes/quoteDossiers.js"),
  customer: path.join(root, "server/services/quote-dossiers/quoteDossierCustomerService.js"),
  parser: path.join(root, "server/services/quote-dossiers/quoteDossierParser.js"),
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

  if (!source.includes("quoteDossierCustomerService.js")) {
    source = source.replace(
      'import { generateQuoteDossierPdf } from "../services/quote-dossiers/quoteDossierPdfService.js";',
      `import { generateQuoteDossierPdf } from "../services/quote-dossiers/quoteDossierPdfService.js";\nimport {
  extractCustomerFromQuoteText,
  normalizeCustomerName,
} from "../services/quote-dossiers/quoteDossierCustomerService.js";`,
    );
  }

  // Garante que o parsed customer inválido não ganha ao customer extraído do texto.
  source = source.replace(
    /const customerName = normalizeCustomerName\(parsedDossier\.customerName\) \|\| extractedCustomer;/g,
    `const parsedCustomer = normalizeCustomerName(parsedDossier.customerName);
      const customerName = extractedCustomer || parsedCustomer;`,
  );

  // Se o bloco ainda não existir, injeta depois do parsedDossier.
  if (!source.includes("const extractedCustomer = extractCustomerFromQuoteText(extracted.text);")) {
    source = source.replace(
      "const parsedDossier = parseQuoteDossierFromText(extracted.text, { filename });",
      `const parsedDossier = parseQuoteDossierFromText(extracted.text, { filename });
      const extractedCustomer = extractCustomerFromQuoteText(extracted.text);
      const parsedCustomer = normalizeCustomerName(parsedDossier.customerName);
      const customerName = extractedCustomer || parsedCustomer;`,
    );
  }

  source = source.replace(
    /customerName:\s*parsedDossier\.customerName\s*\|\|\s*""/g,
    "customerName",
  );

  source = source.replace(
    /customerName:\s*normalizeCustomerName\(parsedDossier\.customerName\)\s*\|\|\s*extractedCustomer/g,
    "customerName",
  );

  source = source.replace(
    /customerName:\s*customerName/g,
    "customerName",
  );

  write(files.route, source);
}

function patchParserImportFallback() {
  let source = read(files.parser);

  // Caso a rota não seja usada em algum fluxo futuro, força também o parser a usar a mesma lógica.
  if (!source.includes("quoteDossierCustomerService.js")) {
    source = `import { extractCustomerFromQuoteText } from "./quoteDossierCustomerService.js";\n${source}`;
  }

  source = source.replace(
    /customerName:\s*extractCustomer\(normalized\),/g,
    "customerName: extractCustomerFromQuoteText(normalized) || extractCustomer(normalized),",
  );

  write(files.parser, source);
}

write(files.customer, "function normalizeText(value = \"\") {\n  return String(value || \"\")\n    .replace(/\\r/g, \"\\n\")\n    .replace(/\\u00a0/g, \" \")\n    .replace(/[ \\t]+/g, \" \")\n    .replace(/\\n[ \\t]+/g, \"\\n\")\n    .replace(/[ \\t]+\\n/g, \"\\n\")\n    .replace(/\\n{3,}/g, \"\\n\\n\")\n    .trim();\n}\n\nfunction collapseSpaces(value = \"\") {\n  return String(value || \"\").replace(/\\s+/g, \" \").trim();\n}\n\nconst INVALID_CUSTOMER_PATTERNS = [\n  /V\\/N\\.?\u00ba?\\s*Contrib/i,\n  /Requisi[\u00e7c][a\u00e3]o/i,\n  /Desc\\.\\s*Cli/i,\n  /Desc\\.\\s*Fin/i,\n  /Condi[\u00e7c][a\u00e3]o\\s+Pagamento/i,\n  /Vencimento/i,\n  /Enti?dade/i,\n  /PRONTO\\s+PAGAMENTO/i,\n  /^Rua\\b/i,\n  /^RUA\\b/i,\n  /^Avenida\\b/i,\n  /^AVENIDA\\b/i,\n  /\\bN[\u00bao]\\s*\\d/i,\n  /^Canada\\b/i,\n  /^CANADA\\b/i,\n  /^Fonte\\b/i,\n  /^FONTE\\b/i,\n  /^Posto\\s+Santo$/i,\n  /^POSTO\\s+SANTO$/i,\n  /^SANTA\\s+CRUZ$/i,\n  /^Porto\\b/i,\n  /^PORTO\\b/i,\n  /^Praia\\b/i,\n  /^PRAIA\\b/i,\n  /^Santa\\b/i,\n  /^SANTA\\b/i,\n  /^Portugal\\b/i,\n  /^NIB\\b/i,\n  /^Telef\\b/i,\n  /^Tel\\.?/i,\n  /^Fax\\b/i,\n  /^Contribuinte\\b/i,\n  /^Capital\\b/i,\n  /^C\\.R\\.C\\./i,\n  /^Alvar[a\u00e1]/i,\n  /^Empresa\\b/i,\n  /^Produtor\\b/i,\n  /^P[a\u00e1]g\\.?/i,\n  /^Expert\\b/i,\n  /Jos[e\u00e9]\\s+Tom[a\u00e1]s\\s+da\\s+Cunha/i,\n  /Filhos,\\s*Lda/i,\n  /\\bLda\\b/i,\n  /^Descarga\\b/i,\n  /^Carga\\b/i,\n  /^N\\/ Morada/i,\n  /^V\\/ Morada/i,\n  /^Exmo\\b/i,\n  /^Original\\b/i,\n  /^Or[\u00e7c]amentos\\b/i,\n  /^Data\\b/i,\n  /^Artigo\\b/i,\n  /^Este documento/i,\n  /^Total\\b/i,\n  /^Quadro\\b/i,\n  /^Aquando\\b/i,\n  /^ATCUD\\b/i,\n  /^Respons[a\u00e1]vel/i,\n  /^Mercadoria/i,\n  /^IVA\\b/i,\n];\n\nfunction isMostlyUppercaseName(value = \"\") {\n  const letters = value.replace(/[^A-Za-z\u00c0-\u00ff]/g, \"\");\n  if (!letters) return false;\n\n  const upper = letters.replace(/[^A-Z\u00c0-\u00dd]/g, \"\");\n  return upper.length / letters.length >= 0.75;\n}\n\nexport function normalizeCustomerName(value = \"\") {\n  const candidate = collapseSpaces(value)\n    .replace(/^Cliente\\s*[:.-]?\\s*/i, \"\")\n    .replace(/^Nome\\s*[:.-]?\\s*/i, \"\")\n    .trim();\n\n  if (!candidate || candidate === \"\u2014\" || candidate === \"-\") return \"\";\n\n  if (candidate.length < 4 || candidate.length > 90) return \"\";\n  if (/[@]|https?:|www\\./i.test(candidate)) return \"\";\n  if (/\\d/.test(candidate)) return \"\";\n  if (INVALID_CUSTOMER_PATTERNS.some((pattern) => pattern.test(candidate))) return \"\";\n\n  const words = candidate.match(/[A-Za-z\u00c0-\u00ff]{2,}/g) || [];\n  if (words.length < 2) return \"\";\n\n  // Evita apanhar cabe\u00e7alhos com muitas palavras de formul\u00e1rio.\n  if (words.length > 7 && !isMostlyUppercaseName(candidate)) return \"\";\n\n  return candidate;\n}\n\nfunction candidateScore({ line, index, exmoIndex, budgetIndex }) {\n  const words = line.match(/[A-Za-z\u00c0-\u00ff]{2,}/g) || [];\n  let score = 0;\n\n  if (isMostlyUppercaseName(line)) score += 10;\n  if (words.length === 3) score += 8;\n  if (words.length === 2 || words.length === 4) score += 4;\n  if (exmoIndex >= 0) score += Math.max(0, 20 - Math.abs(index - exmoIndex));\n  if (budgetIndex >= 0 && index < budgetIndex) score += 4;\n  if (/&|,|\\./.test(line)) score -= 6;\n  if (words.length > 5) score -= 6;\n\n  return score;\n}\n\nfunction extractFromSameExmoLine(line = \"\") {\n  const clean = collapseSpaces(line);\n  const after = clean.split(/Exmo\\.\\(s\\)\\s*Sr\\.\\(s\\)|Exmo\\.\\(s\\)\\s*Sr|Exmo/i)[1] || \"\";\n  return normalizeCustomerName(after);\n}\n\nexport function extractCustomerFromQuoteText(text = \"\") {\n  const lines = normalizeText(text)\n    .split(\"\\n\")\n    .map((line) => collapseSpaces(line))\n    .filter(Boolean);\n\n  if (!lines.length) return \"\";\n\n  const exmoIndex = lines.findIndex((line) => /Exmo\\.\\(s\\)\\s*Sr/i.test(line) || /^Exmo/i.test(line));\n  const budgetIndex = lines.findIndex((line) => /Or[\u00e7c]amentos\\s+OR\\s+ORC\\./i.test(line));\n\n  if (exmoIndex >= 0) {\n    const sameLineCustomer = extractFromSameExmoLine(lines[exmoIndex]);\n    if (sameLineCustomer) return sameLineCustomer;\n\n    // Prefer\u00eancia absoluta: linha imediatamente antes/depois de Exmo.\n    const preferredIndexes = [\n      exmoIndex - 1,\n      exmoIndex + 1,\n      exmoIndex - 2,\n      exmoIndex + 2,\n      exmoIndex - 3,\n      exmoIndex + 3,\n    ];\n\n    for (const index of preferredIndexes) {\n      const customer = normalizeCustomerName(lines[index] || \"\");\n      if (customer) return customer;\n    }\n\n    // Se a extra\u00e7\u00e3o por coordenadas baralhar a ordem, pontua candidatos pr\u00f3ximos.\n    const candidates = [];\n\n    for (let index = Math.max(0, exmoIndex - 16); index <= Math.min(lines.length - 1, exmoIndex + 16); index += 1) {\n      const customer = normalizeCustomerName(lines[index]);\n      if (!customer) continue;\n\n      candidates.push({\n        customer,\n        score: candidateScore({ line: customer, index, exmoIndex, budgetIndex }),\n      });\n    }\n\n    candidates.sort((a, b) => b.score - a.score);\n    if (candidates[0]?.customer) return candidates[0].customer;\n  }\n\n  // Fallback: procura nomes de pessoa antes do bloco do or\u00e7amento.\n  if (budgetIndex > 0) {\n    const candidates = [];\n\n    for (let index = Math.max(0, budgetIndex - 45); index < budgetIndex; index += 1) {\n      const customer = normalizeCustomerName(lines[index]);\n      if (!customer) continue;\n\n      candidates.push({\n        customer,\n        score: candidateScore({ line: customer, index, exmoIndex, budgetIndex }),\n      });\n    }\n\n    candidates.sort((a, b) => b.score - a.score);\n    if (candidates[0]?.customer) return candidates[0].customer;\n  }\n\n  return \"\";\n}\n");
patchRoute();
patchParserImportFallback();

console.log("✅ Cliente dos dossiers corrigido v5.");
console.log("Alterado:");
console.log(" - server/services/quote-dossiers/quoteDossierCustomerService.js");
console.log(" - server/routes/quoteDossiers.js");
console.log(" - server/services/quote-dossiers/quoteDossierParser.js");
console.log("");
console.log("Corrige:");
console.log(" - dá prioridade ao nome junto de Exmo.(s) Sr.(s)");
console.log(" - rejeita cabeçalhos tipo V/N.º Contrib./Requisição/Condição Pagamento");
console.log(" - no ORC.EXP1E/11797 deve extrair VASCO OLIVEIRA MENDES");
console.log("");
console.log("Next:");
console.log(" - cd server");
console.log(" - node --check routes/quoteDossiers.js");
console.log(" - node --check services/quote-dossiers/quoteDossierCustomerService.js");
console.log(" - node --check services/quote-dossiers/quoteDossierParser.js");
