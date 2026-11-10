// Clean copied table text before measuring or rendering it. A raw tab is not a
// printable glyph in PDFKit's standard fonts and can corrupt the following text.
export function normalizeDossierText(value = "") {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function dossierFeatureRows(features = []) {
  const lines = (Array.isArray(features) ? features : [features]).flatMap(value => String(value ?? "").split(/\r\n?|\n/));
  const seen = new Set();
  return lines.flatMap(line => {
    // Preserve the label/value boundary from an Excel or website table.
    const cells = line.split(/\t+/).map(normalizeDossierText).filter(Boolean);
    const clean = normalizeDossierText(line).replace(/^[-•]\s*/, "");
    if (!clean || /^(?:principais caracter[ií]sticas|caracter[ií]sticas principais|caracter[ií]sticas t[eé]cnicas)$/i.test(clean)) return [];
    const colon = clean.indexOf(":");
    const pair = cells.length > 1 && !cells[0].includes(":")
      ? [cells[0].replace(/^[-•]\s*/, ""), cells.slice(1).join(" ")]
      : colon > 0 && !/^https?:\/\//i.test(clean)
        ? [clean.slice(0, colon).trim(), clean.slice(colon + 1).trim()]
        : ["", clean];
    const key = JSON.stringify(pair).toLocaleLowerCase("pt-PT");
    if (seen.has(key)) return [];
    seen.add(key);
    return [pair];
  });
}

export function descriptionSource(value = "") {
  const clean = normalizeDossierText(value);
  if (/\s/.test(clean)) return null;
  try {
    const url = new URL(clean);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return { url: url.href, label: url.hostname };
  } catch { return null; }
}
