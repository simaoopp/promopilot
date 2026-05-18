const LEFT_ODD = {
  0: "0001101",
  1: "0011001",
  2: "0010011",
  3: "0111101",
  4: "0100011",
  5: "0110001",
  6: "0101111",
  7: "0111011",
  8: "0110111",
  9: "0001011",
};

const LEFT_EVEN = {
  0: "0100111",
  1: "0110011",
  2: "0011011",
  3: "0100001",
  4: "0011101",
  5: "0111001",
  6: "0000101",
  7: "0010001",
  8: "0001001",
  9: "0010111",
};

const RIGHT = {
  0: "1110010",
  1: "1100110",
  2: "1101100",
  3: "1000010",
  4: "1011100",
  5: "1001110",
  6: "1010000",
  7: "1000100",
  8: "1001000",
  9: "1110100",
};

const PARITY = {
  0: "OOOOOO",
  1: "OOEOEE",
  2: "OOEEOE",
  3: "OOEEEO",
  4: "OEOOEE",
  5: "OEEOOE",
  6: "OEEEOO",
  7: "OEOEOE",
  8: "OEOEEO",
  9: "OEEOEO",
};

export function calculateEan13CheckDigit(first12) {
  const sum = first12
    .split("")
    .map(Number)
    .reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);

  return String((10 - (sum % 10)) % 10);
}

export function normalizeEan13(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 12) {
    return `${digits}${calculateEan13CheckDigit(digits)}`;
  }

  if (digits.length === 13) {
    return digits;
  }

  return "";
}

export function buildEan13Bits(ean) {
  const firstDigit = Number(ean[0]);
  const parity = PARITY[firstDigit] || PARITY[0];
  let bits = "101";

  for (let index = 1; index <= 6; index += 1) {
    const digit = ean[index];
    bits += parity[index - 1] === "O" ? LEFT_ODD[digit] : LEFT_EVEN[digit];
  }

  bits += "01010";

  for (let index = 7; index <= 12; index += 1) {
    bits += RIGHT[ean[index]];
  }

  bits += "101";
  return bits;
}

/**
 * Reproduz o Barcode.jsx do frontend para etiquetas de campanha:
 * JsBarcode(EAN13, { displayValue:false, height:20, width:1, margin:0 }).
 * O número fica escondido por defeito, exatamente como no componente React.
 */
export function renderEan13Svg(value, { width = 1, height = 20, showValue = false } = {}) {
  const ean = normalizeEan13(value);

  if (!ean) {
    return `<svg class="barcode-svg barcode-svg-empty" viewBox="0 0 95 20" role="img" aria-label="Código de barras inválido"></svg>`;
  }

  const bits = buildEan13Bits(ean);
  const moduleWidth = Number(width) > 0 ? Number(width) : 1;
  const barHeight = Number(height) > 0 ? Number(height) : 20;
  const svgWidth = bits.length * moduleWidth;
  let rects = "";

  for (let index = 0; index < bits.length; index += 1) {
    if (bits[index] !== "1") continue;
    rects += `<rect x="${index * moduleWidth}" y="0" width="${moduleWidth}" height="${barHeight}" />`;
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
