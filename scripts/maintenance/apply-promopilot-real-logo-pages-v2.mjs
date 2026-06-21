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

  if (!fs.existsSync(from)) {
    throw new Error(`Asset em falta no patch: ${fromRelative}`);
  }

  ensureDir(to);
  fs.copyFileSync(from, to);
  console.log(`✔ asset: ${toRelative}`);
}

function writeFile(relativePath, content) {
  const target = path.join(projectRoot, relativePath);
  ensureDir(target);
  fs.writeFileSync(target, content, "utf8");
  console.log(`✔ file: ${relativePath}`);
}

function patchFile(relativePath, transform) {
  const target = path.join(projectRoot, relativePath);

  if (!fs.existsSync(target)) {
    console.warn(`⚠ ficheiro não encontrado: ${relativePath}`);
    return;
  }

  const before = fs.readFileSync(target, "utf8");
  const after = transform(before);

  if (after !== before) {
    fs.writeFileSync(target, after, "utf8");
    console.log(`✔ patch: ${relativePath}`);
  } else {
    console.log(`• sem alterações: ${relativePath}`);
  }
}

function appendMarkedCss(relativePath, markerName, cssBlock) {
  const target = path.join(projectRoot, relativePath);
  ensureDir(target);

  const start = `/* ${markerName} START */`;
  const end = `/* ${markerName} END */`;

  let content = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const pattern = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");

  content = content.replace(pattern, "").trimEnd();
  content += `\n\n${start}\n${cssBlock.trim()}\n${end}\n`;

  fs.writeFileSync(target, content, "utf8");
  console.log(`✔ css: ${relativePath}`);
}

const promoPilotMark = `import React from "react";
import logo from "../../logo.png";

export default function PromoPilotMark({
  compact = false,
  tone = "dark",
  className = "",
}) {
  return (
    <div
      className={\`pp-brand-lockup pp-brand-lockup-\${tone} \${compact ? "pp-brand-compact" : ""} pp-brand-real-logo \${className}\`.trim()}
    >
      <img
        src={logo}
        alt="PromoPilot"
        className={\`pp-brand-logo-img \${compact ? "pp-brand-logo-img-compact" : ""}\`.trim()}
        draggable="false"
      />
    </div>
  );
}
`;

const promoPilotBrand = `import React from "react";
import PromoPilotMark from "./PromoPilotMark";

export { PromoPilotMark };

export function PromoPilotWordmark({ compact = false, className = "" }) {
  return <PromoPilotMark compact={compact} className={className} />;
}

export default PromoPilotMark;
`;

const logoCss = `
/*
  Logo real PromoPilot nas páginas.
  Está no styles.css de propósito, porque o App já importa este ficheiro sempre.
*/
.pp-brand-real-logo,
.pp-brand-lockup.pp-brand-real-logo {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  min-width: 0 !important;
  max-width: 100% !important;
  gap: 0 !important;
}

.pp-brand-real-logo .pp-brand-logo-img,
.pp-brand-logo-img {
  display: block !important;
  width: 180px !important;
  height: auto !important;
  max-height: 58px !important;
  max-width: 100% !important;
  object-fit: contain !important;
  object-position: center !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
  user-select: none !important;
}

.pp-brand-logo-img-compact {
  width: 48px !important;
  max-height: 48px !important;
}

.topbar-site .pp-brand-logo-img,
.logo-topbar {
  display: block !important;
  width: 174px !important;
  height: auto !important;
  max-height: 54px !important;
  object-fit: contain !important;
  object-position: center !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

.sidebar-header .pp-brand-logo-img {
  width: 190px !important;
  max-height: 64px !important;
}

.login-logo {
  display: block !important;
  width: min(300px, 76vw) !important;
  height: auto !important;
  max-height: 150px !important;
  object-fit: contain !important;
  object-position: center !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

.splash-logo {
  display: block !important;
  width: 230px !important;
  height: auto !important;
  max-height: 140px !important;
  object-fit: contain !important;
  object-position: center !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

.pp-login-brand .pp-brand-logo-img,
.pp-splash-card .pp-brand-logo-img {
  width: min(300px, 78vw) !important;
  max-height: 150px !important;
}

.pp-brand-real-logo .pp-brand-mark,
.pp-brand-real-logo .pp-brand-copy,
.pp-brand-real-logo .pp-brand-mark-dot {
  display: none !important;
}

@media (max-width: 720px) {
  .topbar-site .pp-brand-logo-img,
  .logo-topbar {
    width: 138px !important;
    max-height: 46px !important;
  }

  .sidebar-header .pp-brand-logo-img {
    width: 164px !important;
    max-height: 58px !important;
  }

  .login-logo,
  .pp-login-brand .pp-brand-logo-img {
    width: min(240px, 78vw) !important;
  }
}
`;

copyAsset("assets/promopilot-logo.png", "src/logo.png");
copyAsset("assets/promopilot-logo.png", "src/favicon.png");
copyAsset("assets/promopilot-logo.png", "src/assets/promopilot-logo.png");
copyAsset("assets/promopilot-logo.png", "public/logo192.png");
copyAsset("assets/promopilot-logo.png", "public/logo512.png");
copyAsset("assets/favicon.ico", "public/favicon.ico");

writeFile("src/components/brand/PromoPilotMark.jsx", promoPilotMark);
writeFile("src/components/brand/PromoPilotBrand.jsx", promoPilotBrand);

patchFile("src/App.js", (content) => {
  return content
    .replace(/alt="Expert"/g, 'alt="PromoPilot"')
    .replace(/titulo="Expert Administração"/g, 'titulo="PromoPilot"')
    .replace(/Expert Administração/g, "PromoPilot");
});

patchFile("src/components/Sidebar.jsx", (content) => {
  let next = content
    .replace(/titulo\s*=\s*"[^"]*"/, 'titulo = "PromoPilot"')
    .replace(/alt="Expert"/g, 'alt="PromoPilot"')
    .replace(/Expert Administração/g, "PromoPilot");

  if (next.includes('import logo from "../favicon.png";')) {
    next = next.replace('import logo from "../favicon.png";', 'import logo from "../logo.png";');
  }

  return next;
});

patchFile("src/pages/Login.jsx", (content) => {
  let next = content
    .replace(/alt="Expert"/g, 'alt="PromoPilot"')
    .replace(/Expert Administração/g, "PromoPilot")
    .replace(/seu\.email@susiarte\.com/g, "seu.email@empresa.pt");

  next = next.replace('import logo from "../favicon.png";', 'import logo from "../logo.png";');

  return next;
});

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
      type: "image/x-icon",
    },
    {
      src: "logo192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "logo512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ];

  return `${JSON.stringify(manifest, null, 2)}\n`;
});

appendMarkedCss("src/styles/styles.css", "PROMOPILOT REAL LOGO PAGES V2", logoCss);

console.log("\n✅ PromoPilot real logo aplicado nas páginas.");
console.log("\nValida agora:");
console.log("npm run build");
console.log("\nSe o favicon/logótipo antigo persistir no browser, faz hard refresh ou abre o preview numa nova aba.");
