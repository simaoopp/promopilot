import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderEan13Svg } from "./ean13Svg.js";
import { buildAutomaticPrintPages, isAutomaticFormatMode, normalizeCampaignFormat } from "./formatRulesService.js";
import {
  CAMPAIGN_AUTO_FONT_CLASS,
  CAMPAIGN_LABEL_FONT_FAMILY,
  CAMPAIGN_LABEL_HEAVY_FONT_FAMILY,
  DEFAULT_PROMOTION_NOTE,
  EXPERT_ORANGE,
  buildCampaignAutoFontBrowserScript,
  formatarEuro,
  formatarEuroPromocional,
  getCampaignLabelAutoFontRange,
  obterTextoValidade,
  parseNumero,
  ajustarPrecoPromocionalParaImpressao,
} from "../../../src/shared/campaign-label/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const srcRoot = path.join(projectRoot, "src");
const labelLogoCandidates = [
  path.join(srcRoot, "assets", "expert-label-logo.png"),
  path.join(srcRoot, "logo.png"),
];
const tokensCssPath = path.join(srcRoot, "styles", "tokens.css");
const baseCssPath = path.join(srcRoot, "styles", "base.css");
const printCssPath = path.join(srcRoot, "styles", "print.css");

export const DEFAULT_NOTE = DEFAULT_PROMOTION_NOTE;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readCssFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}

function getExistingLogoPath() {
  return labelLogoCandidates.find((candidatePath) => fs.existsSync(candidatePath)) || null;
}

function getLogoDataUri() {
  try {
    const logoPath = getExistingLogoPath();
    if (!logoPath) return "";
    const buffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (_error) {
    return "";
  }
}

function renderAutoText(text, className, formatoAtual) {
  const { min, max } = getCampaignLabelAutoFontRange(className, formatoAtual);
  return `<div class="${className} ${CAMPAIGN_AUTO_FONT_CLASS}" data-min="${min}" data-max="${max}" style="width:100%;font-size:${max}px;">${escapeHtml(text)}</div>`;
}

function renderCampaignLabelContent({ item, formatoAtual, titulo, textoValidade, note = DEFAULT_PROMOTION_NOTE }) {
  const precoAntesImpressao = ajustarPrecoPromocionalParaImpressao(item?.antes);
  const precoAtualImpressao = ajustarPrecoPromocionalParaImpressao(item?.atual);
  const desconto = Math.max(0, parseNumero(precoAntesImpressao) - parseNumero(precoAtualImpressao));
  const mostrarValidade = Boolean(String(textoValidade || "").trim());
  const codigo = item?.codigo || item?.artigo || "";

  return `
    <div class="label-inner">
      <div class="topbar">
        ${getLogoDataUri() ? `<img src="${getLogoDataUri()}" alt="Expert" class="print-logo" />` : `<div class="print-logo-fallback">expert</div>`}
      </div>

      <div class="content">
        <div class="topo">
          <div class="codigo">${escapeHtml(codigo)}</div>
          <div class="titulo">${escapeHtml(titulo || "PROMOÇÃO")}</div>
          ${renderAutoText(String(item?.descricao || ""), "descricao", formatoAtual)}
        </div>

        <div class="precos">
          <div class="linha-preco">
            ${renderAutoText(`${formatarEuroPromocional(precoAntesImpressao)}€`, "antes", formatoAtual)}
          </div>

          <div class="linha-preco desconto-linha">
            ${renderAutoText(`-${formatarEuro(desconto)}€`, "desconto", formatoAtual)}
          </div>

          <div class="linha-preco">
            ${renderAutoText(`${formatarEuroPromocional(precoAtualImpressao)}€`, "atual", formatoAtual)}
          </div>
        </div>

        <div class="rodape">
          ${renderEan13Svg(item?.ean, { showValue: false })}

          ${mostrarValidade ? `<div class="validade-row"><div class="validade">${escapeHtml(textoValidade)}</div></div>` : ""}

          <div class="nota">${escapeHtml(note)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderCampaignLabel(item, formatoAtual, options = {}) {
  const etiquetaClassName = `label ${formatoAtual === "a5" ? "label-a5" : "label-a6"}`;
  const content = renderCampaignLabelContent({
    item,
    formatoAtual,
    titulo: options.titulo || "",
    textoValidade: options.textoValidade || "",
    note: options.note || DEFAULT_PROMOTION_NOTE,
  });

  if (formatoAtual === "a5") {
    return `
      <div class="${etiquetaClassName}">
        <div class="label-a5-rotator">
          ${content}
        </div>
      </div>
    `;
  }

  return `<div class="${etiquetaClassName}">${content}</div>`;
}

function renderEmptyLabel(format) {
  if (format === "a5") {
    return `<div class="label label-a5 label-vazia"><div class="label-inner"></div></div>`;
  }

  return `<div class="label label-a6 label-vazia"></div>`;
}

function renderSheets(items = [], options = {}) {
  const normalizedFormat = normalizeCampaignFormat(options.format || "automatico");
  const pages = buildAutomaticPrintPages(items, normalizedFormat);

  return pages
    .map((page, pageIndex) => {
      const format = page.layout === "a5" ? "a5" : "a6";
      return `
        <div class="sheet ${format === "a5" ? "sheet-a5" : "sheet-a6"}" data-page="${pageIndex + 1}">
          ${page.items
            .map((item) =>
              renderCampaignLabel(item, format, {
                titulo: options.title,
                textoValidade: obterTextoValidade(item, options.anoValidade, options.title),
                note: options.note,
              }),
            )
            .join("\n")}
        </div>
      `;
    })
    .join("\n");
}

function renderSharedCss() {
  const tokensCss = readCssFile(tokensCssPath);
  const baseCss = readCssFile(baseCssPath);
  const printCss = readCssFile(printCssPath);

  return `
    ${tokensCss}
    ${baseCss}
    ${printCss}

    :root {
      --color-primary: ${EXPERT_ORANGE};
      --color-primary-dark: ${EXPERT_ORANGE};
      --color-primary-darker: ${EXPERT_ORANGE};
      --color-surface: #ffffff;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    html, body {
      width: 210mm;
      min-height: 297mm;
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      font-family: ${CAMPAIGN_LABEL_FONT_FAMILY};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .app,
    .app-login,
    .print-area,
    .sheet,
    .label,
    .label-inner,
    .label-a5-rotator {
      background: #ffffff !important;
    }

    .print-area {
      width: 210mm;
      margin: 0 !important;
      padding: 0 !important;
    }

    .label::before {
      border-color: ${EXPERT_ORANGE} !important;
    }

    .topbar {
      background: ${EXPERT_ORANGE} !important;
    }

    .sheet.sheet-a5::after {
      border-top-color: ${EXPERT_ORANGE} !important;
    }

    /* Tipografia senior: a etiqueta manual tem peso visual de bold/extra-bold.
       Como a geração por email corre no Chromium do backend e pode não ter a
       mesma fonte física do computador que imprime manualmente, aplicamos a
       compensação apenas aos blocos de texto da etiqueta, sem mexer nos
       formatters nem no auto-font-size partilhado. */
    .label,
    .label * {
      font-family: ${CAMPAIGN_LABEL_FONT_FAMILY} !important;
      font-kerning: normal;
      font-variant-ligatures: none;
      text-rendering: geometricPrecision;
      font-synthesis: weight style;
      font-synthesis-weight: auto;
    }

    .titulo,
    .descricao,
    .antes,
    .desconto,
    .atual,
    .validade {
      font-family: ${CAMPAIGN_LABEL_HEAVY_FONT_FAMILY} !important;
      font-weight: 900 !important;
    }

    .titulo,
    .descricao {
      letter-spacing: 0.12px;
      -webkit-text-stroke: 0.34px currentColor;
      paint-order: stroke fill;
    }

    .antes {
      -webkit-text-stroke: 0.28px currentColor;
      paint-order: stroke fill;
    }

    .desconto {
      -webkit-text-stroke: 0.34px currentColor;
      paint-order: stroke fill;
    }

    .atual {
      -webkit-text-stroke: 0.42px currentColor;
      paint-order: stroke fill;
      text-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
    }

    .validade {
      -webkit-text-stroke: 0.16px currentColor;
      paint-order: stroke fill;
    }


    .barcode-svg {
      overflow: visible;
      shape-rendering: crispEdges;
      display: block;
    }

    .barcode-svg text,
    .barcode-text,
    .barcode-value {
      display: none !important;
      visibility: hidden !important;
    }

    .rodape svg,
    .rodape .barcode-svg {
      height: 20px;
      max-height: 20px;
    }

    .label.label-a5 .rodape svg,
    .label.label-a5 .rodape .barcode-svg {
      height: 20px;
      max-height: 20px;
    }


    /* Ajustes finais para igualar o PDF manual de Etiquetas Campanha.
       A página manual carrega o reset global e usa a área superior A6 com
       uma pequena faixa branca entre a moldura e o logotipo. */
    .label.label-a6 .label-inner {
      padding: 12.5mm 9mm 9mm !important;
    }

    .label.label-a6 .topbar {
      height: 86px !important;
    }

    .label.label-a6 .topo {
      top: 28px !important;
    }

    .label.label-a6 .precos {
      top: 53.4% !important;
    }

    .label.label-a6 .rodape {
      bottom: 19px !important;
    }

    .label.label-a6 .rodape svg,
    .label.label-a6 .rodape .barcode-svg {
      width: 32% !important;
      height: 20px !important;
      max-height: 20px !important;
      margin: 2px auto 4px !important;
    }

    .print-logo-fallback {
      color: #ffffff;
      font-size: 38px;
      font-weight: 900;
      letter-spacing: 1px;
      text-transform: lowercase;
    }
  `;
}

export function renderAutomaticCampaignHtml({
  items = [],
  title = "PROMOÇÃO",
  storeLabel = "",
  format = "automatico",
  anoValidade = new Date().getFullYear(),
  note = DEFAULT_PROMOTION_NOTE,
} = {}) {
  const safeTitle = title || "PROMOÇÃO";
  const safeStore = storeLabel || "Loja";
  const normalizedFormat = normalizeCampaignFormat(format);
  const printAreaClass = isAutomaticFormatMode(normalizedFormat) ? "formato-auto" : `formato-${normalizedFormat}`;

  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(safeTitle)} - ${escapeHtml(safeStore)}</title>
  <style>${renderSharedCss()}</style>
</head>
<body>
  <div class="print-area ${printAreaClass}">
    ${renderSheets(items, { title: safeTitle, storeLabel: safeStore, format: normalizedFormat, anoValidade, note })}
  </div>
  ${buildCampaignAutoFontBrowserScript({ readyFlag: "__automaticCampaignLabelsReady" })}
</body>
</html>`;
}
