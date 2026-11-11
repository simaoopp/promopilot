/* eslint-env worker */
/* global globalThis */
import { mergeDossierPdfs } from "./mergeDossierPdfs";
import fontUrl from "./assets/DejaVuSans.ttf";
globalThis.onmessage = async ({ data }) => {
  try {
    const response = await fetch(fontUrl);
    if (!response.ok) throw Object.assign(new Error("FONT"), { code: "FONT" });
    const result = await mergeDossierPdfs({ ...data, fontBytes: await response.arrayBuffer() });
    globalThis.postMessage({ result }, [result.buffer]);
  } catch (error) {
    globalThis.postMessage({ error: { code: error.code || "INVALID", equipmentNumber: error.equipmentNumber } });
  }
};
