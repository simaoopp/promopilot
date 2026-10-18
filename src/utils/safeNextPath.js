export function safeNextPath(value, origin, fallback = "/Homepage") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    const unsafe = [...value, ...decoded].some(char => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
    if (decoded.startsWith("//") || unsafe) return fallback;
    const url = new URL(value, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}
