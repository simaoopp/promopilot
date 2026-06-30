#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const patchRoot = path.resolve(__dirname, "..", "..");
const projectRoot = process.cwd();

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyAsset(fromRelative, toRelative) {
  const from = path.join(patchRoot, fromRelative);
  const to = path.join(projectRoot, toRelative);
  ensureDir(to);
  fs.copyFileSync(from, to);
  console.log(`✔ asset: ${toRelative}`);
}

function patchFile(file, transform) {
  const target = path.join(projectRoot, file);

  if (!fs.existsSync(target)) {
    console.warn(`⚠ ficheiro não encontrado: ${file}`);
    return;
  }

  const current = fs.readFileSync(target, "utf8");
  const next = transform(current);

  if (next !== current) {
    fs.writeFileSync(target, next, "utf8");
    console.log(`✔ patch: ${file}`);
  } else {
    console.log(`• sem alterações: ${file}`);
  }
}

copyAsset("assets/promopilot-logo.png", "src/logo.png");
copyAsset("assets/promopilot-logo.png", "src/favicon.png");
copyAsset("assets/promopilot-logo.png", "public/logo192.png");
copyAsset("assets/promopilot-logo.png", "public/logo512.png");
copyAsset("assets/favicon.ico", "public/favicon.ico");

patchFile("public/index.html", (content) => {
  return content
    .replace(
      /content="Expert Administração - gestão de artigos, campanhas promocionais e etiquetas\."/,
      'content="PromoPilot - campanhas, etiquetas e propostas com uma apresentação profissional."',
    )
    .replace(/<title>[^<]*<\/title>/, "<title>PromoPilot</title>")
    .replace(/name="theme-color" content="[^"]*"/, 'name="theme-color" content="#0b73d9"');
});

patchFile("public/manifest.json", (content) => {
  let manifest;

  try {
    manifest = JSON.parse(content);
  } catch {
    return content;
  }

  manifest.short_name = "PromoPilot";
  manifest.name = "PromoPilot";
  manifest.theme_color = "#0b73d9";
  manifest.background_color = "#ffffff";
  manifest.icons = [
    {
      src: "favicon.ico",
      sizes: "64x64 32x32 24x24 16x16",
      type: "image/x-icon"
    },
    {
      src: "logo192.png",
      type: "image/png",
      sizes: "192x192"
    },
    {
      src: "logo512.png",
      type: "image/png",
      sizes: "512x512"
    }
  ];

  return `${JSON.stringify(manifest, null, 2)}\n`;
});

patchFile("src/App.js", (content) => {
  return content
    .replace(/alt="Expert"/g, 'alt="PromoPilot"')
    .replace(/titulo="Expert Administração"/g, 'titulo="PromoPilot"');
});

patchFile("src/components/Sidebar.jsx", (content) => {
  return content
    .replace(/titulo\s*=\s*"[^"]*"/, 'titulo = "PromoPilot"')
    .replace(/alt="Expert"/g, 'alt="PromoPilot"');
});

patchFile("src/pages/Login.jsx", (content) => {
  return content
    .replace(/alt="Expert"/g, 'alt="PromoPilot"')
    .replace(/Expert Administração/g, "PromoPilot")
    .replace(/seu\.email@susiarte\.com/g, "seu.email@empresa.pt");
});

console.log("\n✅ Logo + favicon PromoPilot aplicados.");
console.log("\nValida agora:");
console.log("npm run build");
