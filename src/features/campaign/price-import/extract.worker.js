/* global globalThis */
import { extractTable } from "../../../shared/campaign-price-import/extract";
globalThis.onmessage = ({ data }) => {
  try { globalThis.postMessage({ sheets: extractTable(data) }); }
  catch (error) { globalThis.postMessage({ error: error.message || "Não foi possível ler a tabela." }); }
};
