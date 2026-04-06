import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function Barcode({ value }) {
  const ref = useRef();

  useEffect(() => {
    if (value) {
      JsBarcode(ref.current, value, {
        format: "EAN13",
        displayValue: false,
        height: 18,
        width: 1,
        margin: 0,
      });
    }
  }, [value]);

  return <svg ref={ref}></svg>;
}
