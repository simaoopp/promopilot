import createDossierPdfWorker from "./createDossierPdfWorker";
import { normalizeTechnicalPdf } from "./dossierTechnicalPdf";

function failure(code, equipmentNumber) {
  const label = Number.isInteger(equipmentNumber) ? `A ficha do equipamento ${equipmentNumber}` : "Uma ficha técnica";
  const message = code === "FONT" ? "Não foi possível carregar o modelo do PDF. Verifica a ligação e tenta novamente. O rascunho foi mantido."
    : code === "LIMIT" ? "As fichas excedem o limite de 50 MB, 50 anexos ou 200 páginas. Reduz o tamanho ou divide o dossier."
    : code === "ENCRYPTED" ? `${label} está protegida. Escolhe uma versão sem proteção para a incluir no dossier.`
      : code === "INTERACTIVE" ? `${label} contém campos interativos ou uma assinatura. Exporta uma cópia estática para a incluir no dossier.`
        : code === "TIMEOUT" ? "A junção das fichas demorou demasiado tempo. Reduz o tamanho dos PDFs e tenta novamente."
          : `${label} não pôde ser incluída. Verifica o PDF e tenta novamente. O rascunho foi mantido.`;
  return Object.assign(new Error(message), { code: `DOSSIER_PDF_${code}` });
}
export function collectTechnicalSheets(items) {
  return items.flatMap((item, index) => {
    if (item.technicalSheet == null) return [];
    const sheet = normalizeTechnicalPdf(item.technicalSheet);
    if (!sheet) throw failure("INVALID", index + 1);
    return [{ ...sheet, equipmentNumber: index + 1, title: [item.brand, item.reference].filter(Boolean).join(" ") || item.title || item.rawDescription || item.articleCode || "Equipamento" }];
  });
}
export function appendTechnicalSheets(dossier, sheets, { signal } = {}) {
  if (!sheets.length) return Promise.resolve(dossier);
  return new Promise((resolve, reject) => {
    let worker, timer, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel);
      worker?.terminate(); error ? reject(error) : resolve(result);
    };
    const cancel = () => finish(Object.assign(new Error("Pedido cancelado."), { name: "AbortError" }));
    if (signal?.aborted) { cancel(); return; }
    try {
      worker = createDossierPdfWorker();
      timer = setTimeout(() => finish(failure("TIMEOUT")), 120000);
      signal?.addEventListener("abort", cancel, { once: true });
      worker.onmessage = ({ data }) => {
        if (data?.error) { finish(failure(data.error.code, data.error.equipmentNumber)); return; }
        if (!(data?.result instanceof Uint8Array) || !data.result.length) { finish(failure("INVALID")); return; }
        finish(null, new Blob([data.result], { type: "application/pdf" }));
      };
      worker.onerror = worker.onmessageerror = () => finish(failure("INVALID"));
      worker.postMessage({ dossier, sheets });
    } catch { finish(failure("INVALID")); }
  });
}
