import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function Barcode({
  value,
  height = 20,
  width = 1,
  showValue = false,
}) {
  const ref = useRef(null);

  function isValidEAN(value) {
    return /^\d{12,13}$/.test(value);
  }

  useEffect(() => {
    const svg = ref.current;

    if (!svg) return;

    if (!value || !isValidEAN(value)) {
      svg.innerHTML = ""; // limpa código anterior
      return;
    }

    try {
      JsBarcode(svg, value, {
        format: "EAN13",
        displayValue: showValue,
        height,
        width,
        margin: 0,
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