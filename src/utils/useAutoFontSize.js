import { useEffect, useRef, useState } from "react";
import { fitTextElement } from "../shared/campaign-label/autoFontRules";

export function useAutoFontSize(text, min = 12, max = 24) {
  const ref = useRef(null);
  const [fontSize, setFontSize] = useState(max);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    setFontSize(fitTextElement(el, min, max));
  }, [text, min, max]);

  return { ref, fontSize };
}
