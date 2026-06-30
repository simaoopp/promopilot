#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) fail(`Ficheiro não encontrado: ${relativePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function write(relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.writeFileSync(filePath, content, "utf8");
}

function replaceAllOrFail(content, search, replacement, label) {
  if (!content.includes(search)) {
    fail(`Não encontrei o bloco esperado para substituir: ${label}`);
  }

  return content.split(search).join(replacement);
}

function replaceOnceOrFail(content, search, replacement, label) {
  if (!content.includes(search)) {
    fail(`Não encontrei o bloco esperado para substituir: ${label}`);
  }

  return content.replace(search, replacement);
}

const pagePath = "src/pages/EtiquetasCampanha.jsx";
const modalPath = "src/features/campaign/manual/ManualCreateCampaignModal.jsx";

let page = read(pagePath);

page = replaceAllOrFail(
  page,
  'setErroCampanha("Valor maior que PVP2 antes.");',
  'setErroCampanha("Valor maior que PVP3 antes.");',
  "mensagem de erro PVP2 antes -> PVP3 antes",
);

page = replaceOnceOrFail(
  page,
  'setErroCampanha("Preenche os valores de PVP2 antes e PVP2 atual.");',
  'setErroCampanha("Preenche os valores de PVP3 antes e PVP2 atual.");',
  "mensagem de preenchimento dos preços",
);

page = replaceOnceOrFail(
  page,
  '      pv3: artigoCampanhaSelecionado.pvp3 || "",',
  '      pv3: artigoCampanhaSelecionado.pvp3 || campanhaAntes || "",',
  "guardar pv3 também com o valor manual antes",
);

page = replaceOnceOrFail(
  page,
  `  function selecionarSugestaoCampanha(item) {
    setArtigoCampanhaSelecionado(item);
    setCampanhaAntes(item.pvp2 || "");
    setCampanhaAtual(item.pvp2 || "");
  }`,
  `  function selecionarSugestaoCampanha(item) {
    const pvp3Antes = item.pvp3 || item.pvp2 || "";
    const pvp2Atual = item.pvp2 || "";

    setArtigoCampanhaSelecionado(item);
    setCampanhaAntes(pvp3Antes);
    setCampanhaAtual(pvp2Atual);
  }`,
  "selecionar sugestão cria campanha com PVP3 antes e PVP2 atual",
);

write(pagePath, page);

let modal = read(modalPath);

modal = replaceOnceOrFail(
  modal,
  "Pesquisa um artigo do catálogo, define os preços e adiciona-o diretamente à campanha.",
  "Pesquisa um artigo do catálogo. O preço antes passa a ser o PVP3 e o preço atual mantém o PVP2.",
  "subtítulo do popup Criar campanha",
);

modal = replaceOnceOrFail(
  modal,
  "<span>PVP2 antes</span>",
  "<span>PVP3 antes</span>",
  "label PVP3 antes",
);

write(modalPath, modal);

console.log("✅ Ajuste aplicado ao botão Criar campanha.");
console.log("");
console.log("Agora, ao selecionar um artigo no popup:");
console.log(" - PVP3 entra como preço ANTES");
console.log(" - PVP2 continua como preço ATUAL");
console.log(" - se o artigo não tiver PVP3, usa fallback para PVP2 no preço ANTES");
console.log("");
console.log("Ficheiros alterados:");
console.log(` - ${pagePath}`);
console.log(` - ${modalPath}`);
console.log("");
console.log("Validação recomendada:");
console.log("npm run build");
