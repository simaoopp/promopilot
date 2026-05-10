import fs from "node:fs";
import path from "node:path";

const DEFAULT_ARTIGOS_PATH = "src/data/artigos.json";
const filePath = path.resolve(process.argv[2] || DEFAULT_ARTIGOS_PATH);
const backupPath = `${filePath}.backup`;

const input = fs.readFileSync(filePath, "utf8");

try {
  const parsed = JSON.parse(input);
  const artigos = Array.isArray(parsed?.artigos) ? parsed.artigos.length : 0;
  console.log(`JSON já está válido. Artigos: ${artigos}`);
  process.exit(0);
} catch {
  // Continua para reparação conservadora.
}

fs.writeFileSync(backupPath, input, "utf8");

let inString = false;
let escaped = false;
let braceDepth = 0;
let bracketDepth = 0;
let lastCompleteArticleEnd = null;
let articleCount = 0;

for (let i = 0; i < input.length; i += 1) {
  const char = input[i];

  if (inString) {
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      inString = false;
    }
    continue;
  }

  if (char === '"') {
    inString = true;
  } else if (char === "{") {
    braceDepth += 1;
  } else if (char === "}") {
    braceDepth -= 1;

    if (bracketDepth === 1 && braceDepth === 1) {
      lastCompleteArticleEnd = i + 1;
      articleCount += 1;
    }
  } else if (char === "[") {
    bracketDepth += 1;
  } else if (char === "]") {
    bracketDepth -= 1;
  }
}

if (!lastCompleteArticleEnd) {
  throw new Error("Não foi possível encontrar o último artigo completo para reparar o JSON.");
}

const repaired = `${input.slice(0, lastCompleteArticleEnd).trimEnd()}\n  ]\n}\n`;
const parsed = JSON.parse(repaired);
const repairedCount = Array.isArray(parsed?.artigos) ? parsed.artigos.length : articleCount;

fs.writeFileSync(filePath, repaired, "utf8");

console.log(`Backup criado em: ${backupPath}`);
console.log(`artigos.json reparado com ${repairedCount} artigos válidos.`);
