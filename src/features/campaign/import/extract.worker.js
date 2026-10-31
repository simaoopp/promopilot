/* eslint-env worker */
/* global globalThis */
import { extractTable } from "../../../shared/campaign-import/extract.js";
globalThis.onmessage = ({ data }) => {
  try {
    globalThis.postMessage({ result: extractTable(data) });
  } catch (error) {
    globalThis.postMessage({ error: error.message || "Ficheiro inválido." });
  }
};
