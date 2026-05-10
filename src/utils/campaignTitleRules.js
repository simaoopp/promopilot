export const TITULO_CAMPANHA_SEM_DATA_DEFINIDA = "ARTIGO C/DEFEITO";

export function normalizarTituloCampanha(titulo = "") {
  return String(titulo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function campanhaSemDataDefinida(titulo = "") {
  return (
    normalizarTituloCampanha(titulo) ===
    normalizarTituloCampanha(TITULO_CAMPANHA_SEM_DATA_DEFINIDA)
  );
}

export function limparDatasCampanhaItem(item) {
  return {
    ...item,
    dataInicio: "",
    dataFim: "",
  };
}
