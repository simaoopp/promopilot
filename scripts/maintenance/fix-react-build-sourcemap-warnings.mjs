#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envProductionPath = path.join(root, ".env.production");

function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, "m");

  if (regex.test(content)) {
    return content.replace(regex, line);
  }

  const separator = content && !content.endsWith("\n") ? "\n" : "";
  return `${content}${separator}${line}\n`;
}

let content = "";
if (fs.existsSync(envProductionPath)) {
  content = fs.readFileSync(envProductionPath, "utf8");
}

content = upsertEnvLine(content, "GENERATE_SOURCEMAP", "false");

fs.writeFileSync(envProductionPath, content, "utf8");

console.log("✅ Build React configurado para não gerar source maps.");
console.log("Alterado/criado:");
console.log(" - .env.production");
console.log("");
console.log("Isto evita que warnings de source-map-loader em dependências como @zxing/browser façam o build falhar em CI/Render.");
console.log("");
console.log("Next:");
console.log(" - npm run build");
