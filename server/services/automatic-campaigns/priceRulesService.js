import { parseNumero } from "./numberUtils.js";

const MAX_REASONABLE_PRICE = 50000;
const ARTICLE_CODE_RE = /^\d{2}\.\d{3}\.\d{3}\.\d{5}$/;
const EAN_RE = /^\d{12,13}$/;

function clean(value) {
  return String(value ?? "").trim();
}

function digitsOnly(value) {
  return clean(value).replace(/\D/g, "");
}

function looksLikeEan(value) {
  return EAN_RE.test(digitsOnly(value));
}

function looksLikeArticleCode(value) {
  return ARTICLE_CODE_RE.test(clean(value));
}

function hasTooManyContinuousDigits(value) {
  const normalized = clean(value).replace(/\s+/g, "");
  return /\d{7,}/.test(normalized);
}

export function isProtectedCampaignPrice(value) {
  const raw = clean(value);
  if (!raw) return false;
  if (looksLikeEan(raw) || looksLikeArticleCode(raw) || hasTooManyContinuousDigits(raw)) return false;

  const normalized = raw
    .replace(/€/g, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9,.-]/g, "");

  if (!/^-?\d{1,5}([,.]\d{1,4})?$/.test(normalized)) return false;

  const price = parseNumero(raw);
  return Number.isFinite(price) && price > 0 && price <= MAX_REASONABLE_PRICE;
}

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
  const pvp2AntesRaw = item.pvp2Antes ?? item.antes;
  const pvp2AtualRaw = item.pvp2Atual ?? item.atual;
  const pv3Raw = item.pv3;
  const pvp2Antes = parseNumero(pvp2AntesRaw);
  const pvp2Atual = parseNumero(pvp2AtualRaw);
  const pv3 = parseNumero(pv3Raw);
  const precoSemDesconto = Math.max(pvp2Antes, pv3);
  const precoValido =
    isProtectedCampaignPrice(pvp2AntesRaw) &&
    isProtectedCampaignPrice(pvp2AtualRaw) &&
    isProtectedCampaignPrice(pv3Raw);
  const descontoValido = precoValido && pvp2Atual < precoSemDesconto;

  return {
    ...item,
    pvp2AntesRaw,
    pvp2AtualRaw,
    pv3Raw,
    pvp2Antes,
    pvp2Atual,
    pv3,
    antes: precoSemDesconto,
    atual: pvp2Atual,
    precoSemDesconto,
    precoComDesconto: pvp2Atual,
    precoValido,
    descontoValido,
    ignoradoSemDesconto: !descontoValido,
    selecionado: descontoValido,
    tipo_registo: "campanha",
  };
}
