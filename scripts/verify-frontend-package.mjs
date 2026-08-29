import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(cwd, rel), "utf8"));

const rootPackage = readJson("package.json");
const rootLock = readJson("package-lock.json");
const serverPackage = readJson("server/package.json");

const failures = [];

if (rootPackage.name !== "etiquetas-prom-web") {
  failures.push(`package.json raiz inválido: esperado etiquetas-prom-web, recebido ${rootPackage.name}`);
}

if (rootPackage.scripts?.build !== "react-scripts build") {
  failures.push('package.json raiz sem "build": "react-scripts build"');
}

if (!rootPackage.dependencies?.["react-scripts"]) {
  failures.push("react-scripts não está nas dependências do frontend.");
}

if (rootLock.name !== rootPackage.name || rootLock.packages?.[""]?.name !== rootPackage.name) {
  failures.push("package-lock.json não corresponde ao package.json do frontend.");
}

const lockRaw = fs.readFileSync(path.join(cwd, "package-lock.json"), "utf8");
if (/packages\.applied-caas-gateway|internal\.api\.openai\.org|artifactory\/api\/npm\/npm-public/i.test(lockRaw)) {
  failures.push("package-lock.json contém URLs de registry interno. Usa apenas https://registry.npmjs.org/.");
}

if (serverPackage.name !== "etiquetas-prom-api") {
  failures.push(`server/package.json inválido: esperado etiquetas-prom-api, recebido ${serverPackage.name}`);
}

if (failures.length) {
  console.error("\n❌ Estrutura npm inválida:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("\nNão publiques enquanto estes erros não forem corrigidos.\n");
  process.exit(1);
}

console.log("✓ Frontend package: etiquetas-prom-web");
console.log("✓ Build: react-scripts build");
console.log("✓ package-lock alinhado");
console.log("✓ Backend separado em server/package.json");
