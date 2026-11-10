export const TECHNICAL_PDF_MAX_BYTES = 10 * 1024 * 1024;

function safeName(value) {
  const printable = Array.from(String(value || "ficha-tecnica"), character => {
    const code = character.codePointAt(0);
    return code < 32 || (code >= 127 && code <= 159) ? "_" : character;
  }).join("");
  const name = printable.replace(/[\\/\u202a-\u202e\u2066-\u2069]/g, "_").trim().replace(/\.pdf$/i, "").slice(0, 170);
  return `${name || "ficha-tecnica"}.pdf`;
}

// Blob is preserved by IndexedDB. Object URLs are created only by the viewer;
// storing a blob: URL would leave a broken link after refreshing the page.
export function normalizeTechnicalPdf(value) {
  if (!value || !(value.blob instanceof Blob) || value.blob.type !== "application/pdf" || !value.blob.size || value.blob.size > TECHNICAL_PDF_MAX_BYTES) return null;
  return { name: safeName(value.name), size: value.blob.size, blob: value.blob };
}

function readPart(blob, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel);
      reader.onload = reader.onerror = reader.onabort = null;
      if (reader.readyState === FileReader.LOADING) reader.abort();
      if (error) reject(error); else resolve(result);
    };
    const cancel = () => finish(Object.assign(new Error("Leitura cancelada."), { name: "AbortError" }));
    const timer = setTimeout(() => finish(new Error("O PDF demorou demasiado tempo a abrir. Tenta novamente.")), 15000);
    reader.onload = () => finish(null, String.fromCharCode(...new Uint8Array(reader.result)));
    reader.onerror = () => finish(new Error("Não foi possível ler o PDF. Escolhe novamente o ficheiro."));
    reader.onabort = cancel;
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener("abort", cancel, { once: true });
    try { reader.readAsArrayBuffer(blob); } catch { finish(new Error("Não foi possível ler o PDF.")); }
  });
}

export async function prepareTechnicalPdf(file, { signal } = {}) {
  if (!(file instanceof Blob) || !file.size) throw new Error("Escolhe uma ficha técnica em PDF que não esteja vazia.");
  if (file.size > TECHNICAL_PDF_MAX_BYTES) throw new Error("A ficha técnica excede 10 MB. Reduz o tamanho do PDF.");
  const type = String(file.type || "").toLowerCase();
  if (type !== "application/pdf" && !((!type || type === "application/octet-stream") && /\.pdf$/i.test(file.name || ""))) throw new Error("Escolhe um ficheiro PDF para a ficha técnica.");
  const header = await readPart(file.slice(0, 1024), signal);
  if (!/^(?:\xef\xbb\xbf)?%PDF-\d\.\d/.test(header)) throw new Error("O ficheiro não contém um cabeçalho PDF válido.");
  const tail = await readPart(file.slice(Math.max(0, file.size - 1024)), signal);
  if (!/%%EOF/.test(tail)) throw new Error("O PDF parece incompleto. Volta a descarregar a ficha técnica.");
  return normalizeTechnicalPdf({ name: file.name, blob: file.slice(0, file.size, "application/pdf") });
}

export function formatTechnicalPdfSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} MB`;
}
