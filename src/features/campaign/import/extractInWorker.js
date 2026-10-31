import { LIMITS } from "../../../shared/campaign-import/model.js";

export async function extractInWorker({ file, text, name, separator }, signal) {
  if (file?.size > LIMITS.bytes || (text || "").length > LIMITS.bytes)
    throw new Error("O limite por ficheiro é 10 MB.");
  const buffer = file
    ? await file.arrayBuffer()
    : new TextEncoder().encode(text || "").buffer;
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (signal.aborted) throw new Error("Leitura cancelada.");
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./extract.worker.js", import.meta.url));
    const finish = (error, data) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      worker.terminate();
      error ? reject(error) : resolve(data);
    };
    const cancel = () => finish(new Error("Leitura cancelada."));
    const timer = setTimeout(
      () =>
        finish(new Error("A leitura excedeu 30 segundos. Divida o ficheiro.")),
      30000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }) =>
      finish(data.error ? new Error(data.error) : null, data.result);
    worker.onerror = () =>
      finish(new Error("Não foi possível interpretar o ficheiro."));
    worker.postMessage(
      file
        ? { bytes: buffer, name: file.name, separator }
        : { text, name: name || "Tabela colada", separator },
    );
  });
  return {
    ...result,
    source: {
      name: file?.name || name || "Tabela colada",
      hash,
      fileType: result.type,
      size: buffer.byteLength,
    },
  };
}
