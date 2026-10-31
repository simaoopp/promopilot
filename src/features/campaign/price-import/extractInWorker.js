export function extractInWorker(input, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./extract.worker.js", import.meta.url));
    const cleanup = () => { clearTimeout(timer); worker.terminate(); signal?.removeEventListener("abort", abort); };
    const fail = message => { cleanup(); reject(new Error(message)); };
    const abort = () => fail("Leitura cancelada.");
    const timer = setTimeout(() => fail("A leitura excedeu 30 segundos. Divida o ficheiro."), 30000);
    worker.onmessage = ({ data }) => { cleanup(); data.error ? reject(new Error(data.error)) : resolve(data.sheets); };
    worker.onerror = () => fail("Não foi possível ler o ficheiro. Verifique o formato.");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort(); else worker.postMessage(input, input.bytes ? [input.bytes] : []);
  });
}
