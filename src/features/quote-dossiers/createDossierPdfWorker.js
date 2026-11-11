export default function createDossierPdfWorker() {
  return new Worker(new URL("./mergeDossier.worker.js", import.meta.url));
}
