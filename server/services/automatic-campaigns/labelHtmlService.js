import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatarEuro, parseNumero } from "./numberUtils.js";
import { renderEan13Svg } from "./ean13Svg.js";
import { buildAutomaticPrintPages, normalizeCampaignFormat, isAutomaticFormatMode } from "./formatRulesService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const srcRoot = path.join(projectRoot, "src");
const logoPath = path.join(srcRoot, "logo.png");
const tokensCssPath = path.join(srcRoot, "styles", "tokens.css");
const printCssPath = path.join(srcRoot, "styles", "print.css");

export const DEFAULT_NOTE =
  "VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock existente e não acumulável com outras promoções.";

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

function getLogoDataUri() {
  try {
    const buffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (_error) {
    return "";
  }
}

function ajustarPrecoPromocionalParaImpressao(valor) {
  const numero = parseNumero(valor);

  if (!Number.isFinite(numero) || numero <= 0) return numero;

  const centimos = Math.round((numero - Math.trunc(numero)) * 100);

  if (Math.abs(centimos) === 0) {
    return Math.trunc(numero) + 0.99;
  }

  return numero;
}

function formatarEuroPromocional(valor) {
  return formatarEuro(ajustarPrecoPromocionalParaImpressao(valor));
}

function normalizarTituloCampanha(titulo = "") {
  return String(titulo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function campanhaSemDataDefinida(titulo = "") {
  return normalizarTituloCampanha(titulo) === normalizarTituloCampanha("ARTIGO C/DEFEITO");
}

function formatarDataDiaMes(data) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

function obterTextoValidade(item = {}, anoValidadeAtual, tituloCampanha) {
  if (campanhaSemDataDefinida(tituloCampanha)) return "";

  const normalizarData = (valor) => {
    const texto = String(valor || "").trim();
    return texto && texto !== "-" ? texto : "";
  };

  const dataInicio = normalizarData(item.dataInicio);
  const dataFim = normalizarData(item.dataFim);

  if (!dataInicio && !dataFim) {
    const hoje = new Date();
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() + 30);

    return `VÁLIDO DE ${formatarDataDiaMes(hoje)}/${hoje.getFullYear()} A ${formatarDataDiaMes(fim)}/${fim.getFullYear()}`;
  }

  return `VÁLIDO DE ${dataInicio || "-"}${dataInicio ? `/${anoValidadeAtual}` : ""} A ${dataFim || "-"}${dataFim ? `/${anoValidadeAtual}` : ""}`;
}

function getFitConfig(className, formatoAtual) {
  const isA5 = formatoAtual === "a5";

  switch (className) {
    case "descricao":
      return { min: isA5 ? 24 : 12, max: isA5 ? 38 : 18 };
    case "antes":
      return { min: isA5 ? 44 : 38, max: isA5 ? 54 : 46 };
    case "desconto":
      return { min: isA5 ? 48 : 40, max: isA5 ? 60 : 50 };
    case "atual":
      return { min: isA5 ? 62 : 48, max: isA5 ? 88 : 68 };
    default:
      return { min: 10, max: 16 };
  }
}

function renderAutoText(text, className, formatoAtual) {
  const { min, max } = getFitConfig(className, formatoAtual);
  return `<div class="${className} auto-font-size" data-min="${min}" data-max="${max}" style="width:100%;font-size:${max}px;">${escapeHtml(text)}</div>`;
}

function renderCampaignLabelContent({ item, formatoAtual, titulo, textoValidade, note = DEFAULT_NOTE }) {
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
    note: options.note || DEFAULT_NOTE,
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
      const perPage = format === "a5" ? 2 : 4;
      const emptySlots = Math.max(0, perPage - page.items.length);

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
          ${Array.from({ length: emptySlots }).map(() => renderEmptyLabel(format)).join("\n")}
        </div>
      `;
    })
    .join("\n");
}

function renderSharedCss() {
  const tokensCss = readCssFile(tokensCssPath);
  const printCss = readCssFile(printCssPath);

  return `
    ${tokensCss}
    ${printCss}

    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      width: 210mm;
      min-height: 297mm;
      font-family: Arial, Helvetica, sans-serif;
    }

    .print-area {
      margin: 0;
      padding: 0;
    }

    .barcode-svg text,
    .barcode-text {
      display: none;
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

function renderFitScript() {
  return `
    <script>
      (function () {
        function fitElement(element) {
          var min = Number(element.dataset.min || 10);
          var max = Number(element.dataset.max || min);
          var size = max;
          element.style.fontSize = size + 'px';
          element.style.width = '100%';

          while (
            size > min &&
            (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
          ) {
            size -= 1;
            element.style.fontSize = size + 'px';
          }
        }

        function run() {
          Array.prototype.forEach.call(document.querySelectorAll('.auto-font-size'), fitElement);
          window.__automaticCampaignLabelsReady = true;
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
          run();
        }
      })();
    </script>
  `;
}

export function renderAutomaticCampaignHtml({
  items = [],
  title = "PROMOÇÃO",
  storeLabel = "",
  format = "automatico",
  anoValidade = new Date().getFullYear(),
  note = DEFAULT_NOTE,
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
  ${renderFitScript()}
</body>
</html>`;
}
