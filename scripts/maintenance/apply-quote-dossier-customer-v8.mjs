#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  customer: path.join(root, "server/services/quote-dossiers/quoteDossierCustomerService.js"),
  route: path.join(root, "server/routes/quoteDossiers.js"),
  test: path.join(root, "scripts/maintenance/test-quote-dossier-v8.mjs"),
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

  source = source.replace(
    /quote-dossier-manual-runtime-v\d+/g,
    "quote-dossier-manual-runtime-v8",
  );

  // Geração: se vier "Instalação incluída" ou outro valor inválido no formulário,
  // não pode passar para o PDF como fallback.
  source = source.replace(
    /customerName:\s*normalizeCustomerName\(dossier\.customerName\) \|\| dossier\.customerName \|\| ""/g,
    'customerName: normalizeCustomerName(dossier.customerName) || ""',
  );

  write(files.route, source);
}

const testScript = `#!/usr/bin/env node
import { extractCustomerFromQuoteText, normalizeCustomerName } from "../../server/services/quote-dossiers/quoteDossierCustomerService.js";

const fixture = \`
9700-231 ANGRA DO HEROISMO
POSTO SANTO
CANADA NOVA Nº7A
VASCO OLIVEIRA MENDES
Exmo.(s) Sr.(s)
Contribuinte N.º: 512043434
Orçamentos OR ORC.EXP1E/11797 Original
Instalação incluida
\`;

const customer = extractCustomerFromQuoteText(fixture);
const invalid = normalizeCustomerName("Instalação incluida");

console.log(JSON.stringify({
  customer,
  invalidInstallation: invalid,
}, null, 2));

if (customer !== "VASCO OLIVEIRA MENDES") {
  console.error("❌ Cliente esperado: VASCO OLIVEIRA MENDES");
  process.exit(1);
}

if (invalid) {
  console.error("❌ Instalação incluida não pode ser cliente");
  process.exit(1);
}

console.log("✅ Customer parser v8 OK");
`;

write(files.customer, "function normalizeText(value = \"\") {\n  return String(value || \"\")\n    .replace(/\\r/g, \"\\n\")\n    .replace(/\\u00a0/g, \" \")\n    .replace(/[ \\t]+/g, \" \")\n    .replace(/\\n[ \\t]+/g, \"\\n\")\n    .replace(/[ \\t]+\\n/g, \"\\n\")\n    .replace(/\\n{3,}/g, \"\\n\\n\")\n    .trim();\n}\n\nfunction collapseSpaces(value = \"\") {\n  return String(value || \"\").replace(/\\s+/g, \" \").trim();\n}\n\nconst INVALID_CUSTOMER_PATTERNS = [\n  // Cabe\u00e7alhos / condi\u00e7\u00f5es comerciais\n  /V\\/N\\.?\u00ba?\\s*Contrib/i,\n  /Requisi[\u00e7c][a\u00e3]o/i,\n  /Desc\\.\\s*Cli/i,\n  /Desc\\.\\s*Fin/i,\n  /Condi[\u00e7c][a\u00e3]o\\s+Pagamento/i,\n  /Vencimento/i,\n  /Enti?dade/i,\n  /PRONTO\\s+PAGAMENTO/i,\n\n  // Linhas de servi\u00e7o / observa\u00e7\u00f5es: nunca s\u00e3o cliente.\n  /instala[\u00e7c][a\u00e3]o/i,\n  /inclu[i\u00ed]d[ao]/i,\n  /mapfre/i,\n  /garantia/i,\n  /entrega/i,\n  /montagem/i,\n  /transporte/i,\n  /servi[\u00e7c]o/i,\n\n  // Moradas/contactos\n  /^Rua\\b/i,\n  /^RUA\\b/i,\n  /^Avenida\\b/i,\n  /^AVENIDA\\b/i,\n  /\\bN[\u00bao]\\s*\\d/i,\n  /^Canada\\b/i,\n  /^CANADA\\b/i,\n  /^Fonte\\b/i,\n  /^FONTE\\b/i,\n  /^Posto\\s+Santo$/i,\n  /^POSTO\\s+SANTO$/i,\n  /^SANTA\\s+CRUZ$/i,\n  /^Porto\\b/i,\n  /^PORTO\\b/i,\n  /^Praia\\b/i,\n  /^PRAIA\\b/i,\n  /^Santa\\b/i,\n  /^SANTA\\b/i,\n  /^Portugal\\b/i,\n  /^NIB\\b/i,\n  /^Telef\\b/i,\n  /^Tel\\.?/i,\n  /^Fax\\b/i,\n\n  // Empresa emissora / metadados\n  /^Contribuinte\\b/i,\n  /^Capital\\b/i,\n  /^C\\.R\\.C\\./i,\n  /^Alvar[a\u00e1]/i,\n  /^Empresa\\b/i,\n  /^Produtor\\b/i,\n  /^P[a\u00e1]g\\.?/i,\n  /^Expert\\b/i,\n  /Jos[e\u00e9]\\s+Tom[a\u00e1]s\\s+da\\s+Cunha/i,\n  /Filhos,\\s*Lda/i,\n  /\\bLda\\b/i,\n\n  // Blocos t\u00e9cnicos do Primavera\n  /^Descarga\\b/i,\n  /^Carga\\b/i,\n  /^N\\/ Morada/i,\n  /^V\\/ Morada/i,\n  /^Exmo\\b/i,\n  /^Original\\b/i,\n  /^Or[\u00e7c]amentos\\b/i,\n  /^Data\\b/i,\n  /^Artigo\\b/i,\n  /^Este documento/i,\n  /^Total\\b/i,\n  /^Quadro\\b/i,\n  /^Aquando\\b/i,\n  /^ATCUD\\b/i,\n  /^Respons[a\u00e1]vel/i,\n  /^Mercadoria/i,\n  /^IVA\\b/i,\n  /^IEC\\b/i,\n  /^Acerto\\b/i,\n  /^Portes\\b/i,\n  /^Desconto/i,\n  /^Adiantamentos/i,\n];\n\nfunction isMostlyUppercaseName(value = \"\") {\n  const letters = String(value || \"\").replace(/[^A-Za-z\u00c0-\u00ff]/g, \"\");\n  if (!letters) return false;\n\n  const upper = letters.replace(/[^A-Z\u00c0-\u00dd]/g, \"\");\n  return upper.length / letters.length >= 0.72;\n}\n\nfunction hasPersonNameShape(value = \"\") {\n  const words = String(value || \"\").match(/[A-Za-z\u00c0-\u00ff]{2,}/g) || [];\n\n  if (words.length < 2 || words.length > 7) return false;\n\n  // Linhas de cliente em Primavera costumam ser pessoa/empresa curta.\n  // Para evitar servi\u00e7os como \"Instala\u00e7\u00e3o inclu\u00edda\", exigimos forma de nome:\n  // tudo mai\u00fasculo OU palavras com inicial mai\u00fascula.\n  if (isMostlyUppercaseName(value)) return true;\n\n  return words.every((word) => /^[A-Z\u00c0-\u00dd][a-z\u00e0-\u00ff]+$/.test(word));\n}\n\nexport function normalizeCustomerName(value = \"\") {\n  const candidate = collapseSpaces(value)\n    .replace(/^Cliente\\s*[:.-]?\\s*/i, \"\")\n    .replace(/^Nome\\s*[:.-]?\\s*/i, \"\")\n    .trim();\n\n  if (!candidate || candidate === \"\u2014\" || candidate === \"-\") return \"\";\n  if (candidate.length < 4 || candidate.length > 90) return \"\";\n  if (/[@]|https?:|www\\./i.test(candidate)) return \"\";\n  if (/\\d/.test(candidate)) return \"\";\n  if (INVALID_CUSTOMER_PATTERNS.some((pattern) => pattern.test(candidate))) return \"\";\n  if (!hasPersonNameShape(candidate)) return \"\";\n\n  return candidate;\n}\n\nfunction extractByExmoNeighborhood(lines = []) {\n  const exmoIndexes = [];\n\n  lines.forEach((line, index) => {\n    if (/Exmo\\.\\(s\\)\\s*Sr/i.test(line) || /^Exmo/i.test(line)) {\n      exmoIndexes.push(index);\n    }\n  });\n\n  for (const exmoIndex of exmoIndexes) {\n    const sameLineAfterExmo = collapseSpaces(lines[exmoIndex] || \"\")\n      .split(/Exmo\\.\\(s\\)\\s*Sr\\.\\(s\\)|Exmo\\.\\(s\\)\\s*Sr|Exmo/i)\n      .slice(1)\n      .join(\" \");\n\n    const sameLineCustomer = normalizeCustomerName(sameLineAfterExmo);\n    if (sameLineCustomer) return sameLineCustomer;\n\n    // Prioridade determin\u00edstica. No ORC Primavera, o nome vem imediatamente antes\n    // ou imediatamente depois do marcador Exmo.(s) Sr.(s), dependendo do motor PDF.\n    const preferredIndexes = [\n      exmoIndex - 1,\n      exmoIndex + 1,\n      exmoIndex - 2,\n      exmoIndex + 2,\n      exmoIndex - 3,\n      exmoIndex + 3,\n      exmoIndex - 4,\n      exmoIndex + 4,\n    ];\n\n    for (const index of preferredIndexes) {\n      const customer = normalizeCustomerName(lines[index] || \"\");\n      if (customer) return customer;\n    }\n  }\n\n  return \"\";\n}\n\nfunction customerScore({ line, index, exmoIndex, budgetIndex }) {\n  const words = line.match(/[A-Za-z\u00c0-\u00ff]{2,}/g) || [];\n  let score = 0;\n\n  if (isMostlyUppercaseName(line)) score += 10;\n  if (words.length === 3) score += 8;\n  if (words.length === 2 || words.length === 4) score += 4;\n  if (exmoIndex >= 0) score += Math.max(0, 24 - Math.abs(index - exmoIndex));\n  if (budgetIndex >= 0 && index < budgetIndex) score += 4;\n  if (/&|,|\\./.test(line)) score -= 6;\n  if (words.length > 5) score -= 6;\n\n  return score;\n}\n\nfunction extractScored(lines = []) {\n  const exmoIndex = lines.findIndex((line) => /Exmo\\.\\(s\\)\\s*Sr/i.test(line) || /^Exmo/i.test(line));\n  const budgetIndex = lines.findIndex((line) => /Or[\u00e7c]amentos\\s+OR\\s+ORC\\./i.test(line));\n\n  const from = exmoIndex >= 0 ? Math.max(0, exmoIndex - 22) : 0;\n  const to = exmoIndex >= 0\n    ? Math.min(lines.length - 1, exmoIndex + 22)\n    : budgetIndex > 0\n      ? budgetIndex\n      : Math.min(lines.length - 1, 80);\n\n  const candidates = [];\n\n  for (let index = from; index <= to; index += 1) {\n    const customer = normalizeCustomerName(lines[index]);\n    if (!customer) continue;\n\n    candidates.push({\n      customer,\n      score: customerScore({ line: customer, index, exmoIndex, budgetIndex }),\n    });\n  }\n\n  candidates.sort((a, b) => b.score - a.score);\n\n  return candidates[0]?.customer || \"\";\n}\n\nexport function extractCustomerFromQuoteText(text = \"\") {\n  const lines = normalizeText(text)\n    .split(\"\\n\")\n    .map((line) => collapseSpaces(line))\n    .filter(Boolean);\n\n  if (!lines.length) return \"\";\n\n  const byExmo = extractByExmoNeighborhood(lines);\n  if (byExmo) return byExmo;\n\n  const byScore = extractScored(lines);\n  if (byScore) return byScore;\n\n  return \"\";\n}\n");
patchRoute();
write(files.test, testScript);

console.log("✅ Customer parser v8 aplicado.");
console.log("Corrige:");
console.log(" - 'Instalação incluida' passa a ser inválido como cliente");
console.log(" - cliente junto de Exmo.(s) Sr.(s) ganha prioridade");
console.log(" - generate deixa de reaproveitar cliente inválido vindo do formulário");
console.log("");
console.log("Teste:");
console.log(" - node scripts/maintenance/test-quote-dossier-v8.mjs");
console.log("");
console.log("Versão:");
console.log(" - /api/orcamentos-dossiers/version => quote-dossier-manual-runtime-v8");
