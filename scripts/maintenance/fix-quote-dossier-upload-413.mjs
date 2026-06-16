#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  app: path.join(root, "server/app.js"),
  route: path.join(root, "server/routes/quoteDossiers.js"),
  page: path.join(root, "src/pages/OrcamentosDossiers.jsx"),
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
  fs.writeFileSync(filePath, content, "utf8");
}

function replaceAny(source, replacements, label) {
  for (const [from, to] of replacements) {
    if (source.includes(to)) return source;
    if (source.includes(from)) return source.replace(from, to);
  }

  fail(`Não encontrei bloco para ${label}.`);
}

function insertAfter(source, marker, insertion, label) {
  const firstLine = insertion.trim().split("\n")[0].trim();

  if (source.includes(firstLine)) return source;

  if (!source.includes(marker)) {
    fail(`Não encontrei marker para ${label}: ${marker}`);
  }

  return source.replace(marker, `${marker}${insertion}`);
}

// server/app.js
let app = read(files.app);

app = replaceAny(
  app,
  [
    [
      '  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "20mb" }));',
      '  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "80mb" }));',
    ],
    [
      '  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "2mb" }));',
      '  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "80mb" }));',
    ],
    [
      "  app.use(express.json());",
      '  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "80mb" }));',
    ],
  ],
  "express.json limit",
);

if (!app.includes("express.urlencoded({ limit: process.env.URLENCODED_BODY_LIMIT ||")) {
  app = insertAfter(
    app,
    '  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "80mb" }));',
    '\n  app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || "80mb" }));',
    "express.urlencoded limit",
  );
}

write(files.app, app);

// server/routes/quoteDossiers.js
let route = read(files.route);

route = route.replaceAll("max: 30_000_000", "max: 90_000_000");
route = route.replaceAll("max: 30000000", "max: 90000000");

if (!route.includes("payload too large")) {
  route = route.replace(
    '      console.error("[quote-dossiers] extract error:", error);',
    `      console.error("[quote-dossiers] extract error:", error);`,
  );
}

write(files.route, route);

// src/pages/OrcamentosDossiers.jsx
let page = read(files.page);

if (!page.includes("const MAX_QUOTE_PDF_SIZE_BYTES")) {
  page = page.replace(
    "const fileInputRef = useRef(null);",
    "const fileInputRef = useRef(null);",
  );

  const marker = "function fileToBase64";
  const constants = `const MAX_QUOTE_PDF_SIZE_BYTES = 45 * 1024 * 1024;

function formatFileSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  return \`\${(bytes / 1024 / 1024).toFixed(1)} MB\`;
}

`;

  if (!page.includes(marker)) {
    fail("Não encontrei function fileToBase64 para inserir constantes.");
  }

  page = page.replace(marker, `${constants}${marker}`);
}

if (!page.includes("ficheiro é demasiado grande")) {
  const from = `    if (!file) return;

    try {`;

  const to = `    if (!file) return;

    if (file.size > MAX_QUOTE_PDF_SIZE_BYTES) {
      setError(
        \`O ficheiro é demasiado grande (\${formatFileSize(file.size)}). Usa um PDF até \${formatFileSize(MAX_QUOTE_PDF_SIZE_BYTES)} ou comprime o orçamento antes de carregar.\`,
      );
      return;
    }

    try {`;

  if (page.includes(from)) {
    page = page.replace(from, to);
  } else {
    console.warn("⚠️ Não encontrei bloco de validação handleExtract. Validação frontend não aplicada.");
  }
}

write(files.page, page);

console.log("✅ Upload 413 de dossiers corrigido/aumentado.");
console.log("Alterado:");
console.log(" - server/app.js");
console.log(" - server/routes/quoteDossiers.js");
console.log(" - src/pages/OrcamentosDossiers.jsx");
console.log("");
console.log("IMPORTANTE no Render:");
console.log(" - definir JSON_BODY_LIMIT=80mb");
console.log(" - definir URLENCODED_BODY_LIMIT=80mb");
console.log(" - redeploy");
console.log("");
console.log("Next:");
console.log(" - npm run build");
console.log(" - cd server && node --check routes/quoteDossiers.js && npm start");
