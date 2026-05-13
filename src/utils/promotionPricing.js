import { formatarEuro, parseNumero } from "./formatters";

const CENTS_EPSILON = 0.00001;

export const PROMOTION_PRICE_SOURCES = {
  PVP2: "pvp2",
  PVP3: "pvp3",
};

export function ajustarPrecoPromocionalParaImpressao(valor) {
  const numero = parseNumero(valor);

  if (!Number.isFinite(numero) || numero <= 0) return numero;

  const centimos = Math.round((numero - Math.trunc(numero)) * 100);

  if (Math.abs(centimos) <= CENTS_EPSILON) {
    return Math.trunc(numero) + 0.99;
  }

  return numero;
}

export function formatarEuroPromocional(valor) {
  return formatarEuro(ajustarPrecoPromocionalParaImpressao(valor));
}

export function obterPrecoAtualPromocional(item = {}, fonte = PROMOTION_PRICE_SOURCES.PVP2) {
  if (fonte === PROMOTION_PRICE_SOURCES.PVP3) {
    const pvp3 = parseNumero(item.pv3 ?? item.pvp3);

    if (Number.isFinite(pvp3) && pvp3 > 0) {
      return pvp3;
    }
  }

  return parseNumero(item.atual);
}

export function prepararItemPromocionalParaImpressao(item = {}, fonte = PROMOTION_PRICE_SOURCES.PVP2) {
  const atual = obterPrecoAtualPromocional(item, fonte);

  return {
    ...item,
    atual,
    promocaoFontePreco: fonte,
  };
}
