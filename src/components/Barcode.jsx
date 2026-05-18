import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import {
  BARCODE_RENDER_DEFAULTS,
  isValidEanForBarcode,
  normalizeEan13,
} from "../shared/campaign-label/barcodeRules";

export default function Barcode({
  value,
  height = BARCODE_RENDER_DEFAULTS.height,
  width = BARCODE_RENDER_DEFAULTS.width,
  showValue = BARCODE_RENDER_DEFAULTS.displayValue,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;

    if (!svg) return;

    if (!value || !isValidEanForBarcode(value)) {
      svg.innerHTML = "";
      return;
    }

    try {
      JsBarcode(svg, normalizeEan13(value), {
        format: BARCODE_RENDER_DEFAULTS.format,
        displayValue: showValue,
        height,
        width,
        margin: BARCODE_RENDER_DEFAULTS.margin,
      });
    } catch (err) {
      console.error("Erro ao gerar código de barras:", err);
      svg.innerHTML = "";
    }
  }, [value, height, width, showValue]);

  return (
    <svg
      ref={ref}
      role="img"
      aria-label={`Código de barras ${value || ""}`}
    />
  );
}
