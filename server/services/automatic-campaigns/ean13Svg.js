import {
  BARCODE_RENDER_DEFAULTS,
  buildEan13Bits,
  calculateEan13CheckDigit,
  normalizeEan13,
} from "../../../src/shared/campaign-label/barcodeRules.js";

export { buildEan13Bits, calculateEan13CheckDigit, normalizeEan13 };

/**
 * Reproduz o Barcode.jsx do frontend para etiquetas de campanha:
 * JsBarcode(EAN13, { displayValue:false, height:20, width:1, margin:0 }).
 * O número fica escondido por defeito, exatamente como no componente React.
 */
export function renderEan13Svg(value, options = {}) {
  const ean = normalizeEan13(value);
  const showValue = Boolean(options.showValue ?? BARCODE_RENDER_DEFAULTS.displayValue);
  const moduleWidth = Number(options.width ?? BARCODE_RENDER_DEFAULTS.width) || BARCODE_RENDER_DEFAULTS.width;
  const barHeight = Number(options.height ?? BARCODE_RENDER_DEFAULTS.height) || BARCODE_RENDER_DEFAULTS.height;

  if (!ean) {
    return `<svg class="barcode-svg barcode-svg-empty" viewBox="0 0 95 ${barHeight}" role="img" aria-label="Código de barras inválido"></svg>`;
  }

  const bits = buildEan13Bits(ean);
  const svgWidth = bits.length * moduleWidth;
  const guardHeight = barHeight + 6;
  let rects = "";

  for (let index = 0; index < bits.length; index += 1) {
    if (bits[index] !== "1") continue;

    // O JsBarcode usado no frontend prolonga visualmente os guard bars
    // do EAN-13. Mantemos esse detalhe para o PDF automático ficar
    // indistinguível da impressão manual.
    const isGuardModule = index <= 2 || (index >= 45 && index <= 49) || index >= 92;
    const rectHeight = isGuardModule ? guardHeight : barHeight;

    rects += `<rect x="${index * moduleWidth}" y="0" width="${moduleWidth}" height="${rectHeight}" />`;
  }

  return `
    <svg
      class="barcode-svg"
      viewBox="0 0 ${svgWidth} ${barHeight}"
      width="${svgWidth}"
      height="${barHeight}"
      role="img"
      aria-label="Código de barras ${ean}"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <g fill="#111111">${rects}</g>
      ${showValue ? `<text class="barcode-value" x="${svgWidth / 2}" y="${barHeight - 2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#111111">${ean}</text>` : ""}
    </svg>
  `;
}
