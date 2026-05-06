import { parseNumero } from "./formatters";

export function parsePrecoComparacao(valor) {
  return parseNumero(valor);
}

export function artigoElegivelComparacaoPvp3(item) {
  const pvpAtual = parsePrecoComparacao(item?.atual);
  const pvp3 = parsePrecoComparacao(item?.pv3);

  return pvpAtual > 0 && pvp3 > 0 && pvpAtual < pvp3;
}

export function criarIdsComparacaoPvp3(artigos, idsSelecionados) {
  return new Set(
    artigos
      .filter(
        (item) => idsSelecionados.has(item.id) && artigoElegivelComparacaoPvp3(item),
      )
      .map((item) => item.id),
  );
}

export function aplicarComparacaoPvp3NoArtigo(item) {
  return {
    ...item,
    antes: parsePrecoComparacao(item.pv3),
    atual: parsePrecoComparacao(item.atual),
    selecionado: true,
    info: item.info
      ? `${item.info} | Comparação PVP atual/PVP3`
      : "Comparação PVP atual/PVP3",
  };
}

export function obterCodigosParaCopiar(artigos, idsComparacaoPvp3) {
  return artigos
    .filter(
      (item) =>
        !idsComparacaoPvp3.has(item.id) || !artigoElegivelComparacaoPvp3(item),
    )
    .map((item) => String(item.codigo || "").trim())
    .filter(Boolean)
    .join("|");
}
