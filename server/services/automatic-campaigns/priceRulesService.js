import { parseNumero } from "./numberUtils.js";

export function applyAutomaticCampaignPriceRules(item = {}) {
  const pvp2Antes = parseNumero(item.pvp2Antes ?? item.antes);
  const pvp2Atual = parseNumero(item.pvp2Atual ?? item.atual);
  const pv3 = parseNumero(item.pv3);
  const precoSemDesconto = Math.max(pvp2Antes, pv3);

  return {
    ...item,
    pvp2Antes,
    pvp2Atual,
    pv3,
    antes: precoSemDesconto,
    atual: pvp2Atual,
    precoSemDesconto,
    precoComDesconto: pvp2Atual,
    selecionado: true,
    tipo_registo: "campanha",
  };
}
