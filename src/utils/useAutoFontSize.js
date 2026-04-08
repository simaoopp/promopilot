import { useEffect, useRef, useState } from "react";

export function useAutoFontSize(text, min = 12, max = 24) {
  const ref = useRef(null);
  const [fontSize, setFontSize] = useState(max);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let size = max;
    el.style.fontSize = `${size}px`;

    while (
      (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) &&
      size > min
    ) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }

    setFontSize(size);
  }, [text, min, max]);

  return { ref, fontSize };
}