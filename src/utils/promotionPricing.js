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

function obterPvp3Valido(item = {}) {
  const pvp3 = parseNumero(item.pv3 ?? item.pvp3);
  return Number.isFinite(pvp3) && pvp3 > 0 ? pvp3 : null;
}

/**
 * Define o preço de referência/sem promoção que será impresso como "antes".
 * O preço promocional nunca é alterado aqui: mantém sempre o campo PVP ATUAL (`item.atual`).
 */
export function obterPrecoSemPromocaoParaImpressao(item = {}, fonte = PROMOTION_PRICE_SOURCES.PVP2) {
  if (fonte === PROMOTION_PRICE_SOURCES.PVP3) {
    const pvp3 = obterPvp3Valido(item);

    if (pvp3 !== null) {
      return pvp3;
    }
  }

  return parseNumero(item.antes);
}

export function obterPrecoPromocaoParaImpressao(item = {}) {
  return parseNumero(item.atual);
}

// Backwards-compatible alias kept for older imports/tests.
export const obterPrecoAtualPromocional = obterPrecoPromocaoParaImpressao;

export function prepararItemPromocionalParaImpressao(item = {}, fonte = PROMOTION_PRICE_SOURCES.PVP2) {
  const precoSemPromocao = obterPrecoSemPromocaoParaImpressao(item, fonte);
  const precoPromocao = obterPrecoPromocaoParaImpressao(item);

  return {
    ...item,
    antes: precoSemPromocao,
    atual: precoPromocao,
    precoSemPromocaoFonte: fonte,
  };
}
