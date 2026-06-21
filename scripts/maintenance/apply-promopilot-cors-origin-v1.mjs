#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function write(relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`✔ ${relativePath}`);
}

write("server/config/cors.js", "function normalizeOrigin(value = \"\") {\n  return String(value).trim().replace(/\\/+$/, \"\");\n}\n\nfunction readBoolean(name, fallback = false) {\n  const value = process.env[name];\n\n  if (value === undefined || value === null || value === \"\") {\n    return fallback;\n  }\n\n  return [\"1\", \"true\", \"sim\", \"yes\", \"y\", \"on\"].includes(\n    String(value).toLowerCase().trim(),\n  );\n}\n\nfunction readCsvOrigins(name) {\n  return (process.env[name] || \"\")\n    .split(\",\")\n    .map(normalizeOrigin)\n    .filter(Boolean);\n}\n\nconst PRODUCTION_DEFAULT_ALLOWED_ORIGINS = [\n  \"https://expertadmin.netlify.app\",\n  \"https://promopilot.pt\",\n  \"https://www.promopilot.pt\",\n];\n\nconst LOCAL_ALLOWED_ORIGINS = [\n  \"http://localhost:3000\",\n  \"http://localhost:8888\",\n  \"http://localhost:5173\",\n  \"http://127.0.0.1:3000\",\n  \"http://127.0.0.1:8888\",\n  \"http://127.0.0.1:5173\",\n];\n\nconst isProduction = process.env.NODE_ENV === \"production\";\nconst allowLocalhostCors = !isProduction || readBoolean(\"ALLOW_LOCALHOST_CORS\", false);\n\nexport const ALLOWED_ORIGINS = Array.from(\n  new Set([\n    ...PRODUCTION_DEFAULT_ALLOWED_ORIGINS,\n    ...(allowLocalhostCors ? LOCAL_ALLOWED_ORIGINS : []),\n    ...readCsvOrigins(\"CORS_ORIGINS\"),\n    ...readCsvOrigins(\"EXTRA_CORS_ORIGINS\"),\n  ]),\n);\n\nexport const corsOptions = {\n  origin(origin, callback) {\n    if (!origin) {\n      return callback(null, true);\n    }\n\n    const normalizedOrigin = normalizeOrigin(origin);\n\n    if (ALLOWED_ORIGINS.includes(normalizedOrigin)) {\n      return callback(null, true);\n    }\n\n    console.warn(\"[CORS] Origem bloqueada:\", origin, {\n      allowedOrigins: ALLOWED_ORIGINS,\n    });\n\n    return callback(new Error(\"Origem n\u00e3o autorizada.\"));\n  },\n  methods: [\"GET\", \"HEAD\", \"POST\", \"PUT\", \"PATCH\", \"DELETE\", \"OPTIONS\"],\n  allowedHeaders: [\n    \"Authorization\",\n    \"Content-Type\",\n    \"Accept\",\n    \"X-Requested-With\",\n    \"X-Request-Id\",\n  ],\n  credentials: false,\n  optionsSuccessStatus: 204,\n  maxAge: 86400,\n};\n");

console.log("");
console.log("✅ CORS atualizado para PromoPilot.");
console.log("");
console.log("Origens permitidas por defeito:");
console.log(" - https://expertadmin.netlify.app");
console.log(" - https://promopilot.pt");
console.log(" - https://www.promopilot.pt");
console.log("");
console.log("Agora valida localmente:");
console.log("npm --prefix server run smoke");
console.log("");
console.log("Depois faz commit e deploy/redeploy do backend no Render.");
