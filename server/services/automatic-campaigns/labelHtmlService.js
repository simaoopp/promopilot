import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatarEuro, parseNumero } from "./numberUtils.js";
import { renderEan13Svg } from "./ean13Svg.js";
import { buildAutomaticPrintPages, normalizeCampaignFormat } from "./formatRulesService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const logoPath = path.join(projectRoot, "src", "logo.png");

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

function getValidityText(item = {}, anoValidade, title = "") {
  if (campanhaSemDataDefinida(title)) return "";

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

  return `VÁLIDO DE ${dataInicio || "-"}${dataInicio ? `/${anoValidade}` : ""} A ${dataFim || "-"}${dataFim ? `/${anoValidade}` : ""}`;
}

function renderLabelContent(item, { title, format, anoValidade, note }) {
  const precoAntesImpressao = ajustarPrecoPromocionalParaImpressao(item?.antes);
  const precoAtualImpressao = ajustarPrecoPromocionalParaImpressao(item?.atual);
  const desconto = Math.max(0, parseNumero(precoAntesImpressao) - parseNumero(precoAtualImpressao));
  const validity = getValidityText(item, anoValidade, title);
  const descricaoMax = format === "a5" ? 38 : 18;
  const descricaoMin = format === "a5" ? 24 : 12;
  const antesMax = format === "a5" ? 54 : 46;
  const antesMin = format === "a5" ? 44 : 38;
  const descontoMax = format === "a5" ? 60 : 50;
  const descontoMin = format === "a5" ? 48 : 40;
  const atualMax = format === "a5" ? 88 : 68;
  const atualMin = format === "a5" ? 62 : 48;

  return `
    <div class="label-inner">
      <div class="topbar">
        ${getLogoDataUri() ? `<img src="${getLogoDataUri()}" alt="Expert" class="print-logo" />` : `<div class="logo-fallback">EXPERT</div>`}
      </div>

      <div class="content">
        <div class="topo">
          <div class="codigo">${escapeHtml(item?.codigo || item?.artigo || "")}</div>
          <div class="titulo">${escapeHtml(title || "PROMOÇÃO")}</div>
          <div class="descricao auto-fit" data-min="${descricaoMin}" data-max="${descricaoMax}">${escapeHtml(item?.descricao || "")}</div>
        </div>

        <div class="precos">
          <div class="linha-preco">
            <div class="antes auto-fit" data-min="${antesMin}" data-max="${antesMax}">${escapeHtml(`${formatarEuroPromocional(precoAntesImpressao)}€`)}</div>
          </div>

          <div class="linha-preco desconto-linha">
            <div class="desconto auto-fit" data-min="${descontoMin}" data-max="${descontoMax}">${escapeHtml(`-${formatarEuro(desconto)}€`)}</div>
          </div>

          <div class="linha-preco">
            <div class="atual auto-fit" data-min="${atualMin}" data-max="${atualMax}">${escapeHtml(`${formatarEuroPromocional(precoAtualImpressao)}€`)}</div>
          </div>
        </div>

        <div class="rodape">
          ${renderEan13Svg(item?.ean)}
          ${validity ? `<div class="validade-row"><div class="validade">${escapeHtml(validity)}</div></div>` : ""}
          <div class="nota">${escapeHtml(note || DEFAULT_NOTE)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderLabel(item, { title, format, anoValidade, note }) {
  if (format === "a5") {
    return `
      <article class="label label-a5">
        <div class="label-a5-rotator">
          ${renderLabelContent(item, { title, format, anoValidade, note })}
        </div>
      </article>
    `;
  }

  return `
    <article class="label label-a6">
      ${renderLabelContent(item, { title, format, anoValidade, note })}
    </article>
  `;
}

function renderEmptyLabel(format) {
  if (format === "a5") {
    return `
      <article class="label label-a5 label-vazia">
        <div class="label-inner"></div>
      </article>
    `;
  }

  return '<article class="label label-a6 label-vazia"></article>';
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
        <section class="sheet sheet-${format}" data-page="${pageIndex + 1}">
          ${page.items.map((item) => renderLabel(item, { ...options, format })).join("\n")}
          ${Array.from({ length: emptySlots }).map(() => renderEmptyLabel(format)).join("\n")}
        </section>
      `;
    })
    .join("\n");
}

function renderStyle() {
  return `
    :root {
      --color-primary: #d71920;
      --color-surface: #ffffff;
      --color-text: #111111;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--color-text);
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page { size: A4; margin: 0; }

    .print-area {
      width: 210mm;
      margin: 0 auto;
      background: #ffffff;
    }

    .sheet {
      position: relative;
      width: 210mm;
      height: 297mm;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      background: #ffffff;
    }

    .sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .sheet.sheet-a6 {
      display: grid;
      grid-template-columns: 105mm 105mm;
      grid-template-rows: 148.5mm 148.5mm;
    }

    .sheet.sheet-a5 {
      display: grid;
      grid-template-columns: 210mm;
      grid-template-rows: 148.5mm 148.5mm;
    }

    .sheet.sheet-a5::after {
      content: "";
      position: absolute;
      left: 14mm;
      right: 14mm;
      top: 50%;
      transform: translateY(-50%);
      border-top: 1px dashed var(--color-primary);
      pointer-events: none;
      z-index: 5;
    }

    .label {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--color-surface);
      page-break-inside: avoid;
      break-inside: avoid;
      border-radius: 6mm;
    }

    .label::before {
      content: "";
      position: absolute;
      top: 5mm;
      left: 5mm;
      right: 5mm;
      bottom: 5mm;
      border: 5mm solid var(--color-primary);
      border-radius: 4mm;
      pointer-events: none;
      z-index: 2;
    }

    .label-inner {
      width: 100%;
      height: 100%;
      padding: 9mm;
      display: flex;
      flex-direction: column;
      background: var(--color-surface);
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .label.label-a5 {
      width: 210mm;
      height: 148.5mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .label.label-a5 .label-inner {
      width: 148.5mm;
      height: 210mm;
      padding: 10mm;
      background: #ffffff;
      overflow: hidden;
      position: relative;
    }

    .label-a5-rotator {
      width: 148.5mm;
      height: 210mm;
      transform: rotate(90deg) scale(0.998);
      transform-origin: center center;
      overflow: hidden;
      background: #ffffff;
      flex: 0 0 auto;
    }

    .label-vazia {
      background: var(--color-surface);
    }

    .topbar {
      width: 100%;
      height: 110px;
      background: var(--color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      overflow: hidden;
      flex-shrink: 0;
    }

    .topbar img,
    .print-logo {
      width: auto;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      object-position: center;
      display: block;
    }

    .logo-fallback {
      color: #ffffff;
      font-size: 34px;
      font-weight: 900;
      letter-spacing: 1px;
    }

    .content {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      height: auto;
      padding: 14px 16px 12px;
      overflow: visible;
    }

    .topo {
      position: absolute;
      top: 14px;
      left: 16px;
      right: 16px;
    }

    .codigo {
      font-size: 11px;
      color: #666666;
      margin-bottom: 6px;
      text-align: left;
    }

    .titulo {
      font-size: 22px;
      font-weight: 900;
      text-align: center;
      margin-bottom: 6px;
      text-transform: uppercase;
    }

    .descricao {
      min-height: 60px;
      padding: 0 8px;
      font-weight: 800;
      line-height: 1.15;
      text-transform: uppercase;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      width: 100%;
    }

    .precos {
      position: absolute;
      top: 52%;
      left: 16px;
      right: 16px;
      transform: translateY(-50%);
      text-align: center;
    }

    .linha-preco {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
    }

    .antes,
    .desconto,
    .atual {
      width: 100%;
      display: block;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      margin: 0 auto;
    }

    .antes {
      font-weight: 800;
      text-decoration: line-through;
      color: #111111;
      line-height: 1;
      opacity: 0.8;
    }

    .desconto {
      font-weight: 900;
      color: #d71920;
      line-height: 1;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .atual {
      font-weight: 900;
      color: #111111;
      line-height: 1;
      letter-spacing: -1px;
      text-shadow: 0 1px 0 rgba(0, 0, 0, 0.15);
    }

    .desconto-linha {
      margin: 4px 0;
    }

    .rodape {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 12px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      z-index: 3;
    }

    .rodape svg,
    .barcode-svg {
      width: 70%;
      display: block;
      margin: 2px auto 4px;
      flex-shrink: 0;
    }

    .validade-row {
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .validade {
      width: 100%;
      margin-top: 2px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      display: block;
      white-space: normal;
      word-break: break-word;
      text-transform: uppercase;
    }

    .nota {
      margin-top: 2px;
      text-align: center;
      font-size: 8px;
      font-weight: 700;
      line-height: 1.2;
      text-transform: none;
    }

    .barcode-text {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      fill: #111111;
      text-anchor: middle;
    }
  `;
}

function renderFitScript() {
  return `
    <script>
      (function () {
        function fitElement(el) {
          const min = Number(el.dataset.min || 10);
          const max = Number(el.dataset.max || min);
          let size = max;
          el.style.fontSize = size + 'px';
          const widthLimit = el.clientWidth;
          const heightLimit = el.clientHeight || 100000;

          while (size > min && (el.scrollWidth > widthLimit + 1 || el.scrollHeight > heightLimit + 1)) {
            size -= 1;
            el.style.fontSize = size + 'px';
          }
        }

        function run() {
          document.querySelectorAll('.auto-fit').forEach(fitElement);
          window.__labelsReady = true;
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

  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(safeTitle)} - ${escapeHtml(safeStore)}</title>
  <style>${renderStyle()}</style>
</head>
<body>
  <div class="print-area formato-${escapeHtml(normalizeCampaignFormat(format))}">
    ${renderSheets(items, { title: safeTitle, storeLabel: safeStore, format, anoValidade, note })}
  </div>
  ${renderFitScript()}
</body>
</html>`;
}
