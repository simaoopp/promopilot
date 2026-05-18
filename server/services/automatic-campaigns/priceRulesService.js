import { parseNumero } from "./numberUtils.js";

export function getAutomaticCampaignReferencePrice(item = {}) {
  const pvp2Antes = parseNumero(item.pvp2Antes ?? item.antes);
  const pv3 = parseNumero(item.pv3);
  return Math.max(pvp2Antes, pv3);
}

export function isAutomaticCampaignDiscountEligible(item = {}) {
  const pvp2Atual = parseNumero(item.pvp2Atual ?? item.atual);
  const precoReferencia = getAutomaticCampaignReferencePrice(item);

  return pvp2Atual > 0 && precoReferencia > 0 && pvp2Atual < precoReferencia;
}

export function filterAutomaticCampaignDiscountItems(items = []) {
  return (Array.isArray(items) ? items : []).filter(isAutomaticCampaignDiscountEligible);
}

export function applyAutomaticCampaignPriceRules(item = {}) {
  const pvp2Antes = parseNumero(item.pvp2Antes ?? item.antes);
  const pvp2Atual = parseNumero(item.pvp2Atual ?? item.atual);
  const pv3 = parseNumero(item.pv3);
  const precoSemDesconto = Math.max(pvp2Antes, pv3);
  const descontoValido = pvp2Atual > 0 && precoSemDesconto > 0 && pvp2Atual < precoSemDesconto;

  return {
    ...item,
    pvp2Antes,
    pvp2Atual,
    pv3,
    antes: precoSemDesconto,
    atual: pvp2Atual,
    precoSemDesconto,
    precoComDesconto: pvp2Atual,
    descontoValido,
    ignoradoSemDesconto: !descontoValido,
    selecionado: descontoValido,
    tipo_registo: "campanha",
  };
}
