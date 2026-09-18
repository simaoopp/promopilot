function normalizePromotionInfo(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPromotionInfoText(itemOrText = "") {
  if (typeof itemOrText === "string" || typeof itemOrText === "number") {
    return String(itemOrText ?? "");
  }

  const item = itemOrText && typeof itemOrText === "object" ? itemOrText : {};

  return [
    item.info,
    item.informacao,
    item.informacoes,
    item.informacaoPromo,
    item.informacoesPromo,
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .join(" ");
}

export function isPvpUpdatePromotionInfo(itemOrText = "") {
  const normalized = normalizePromotionInfo(getPromotionInfoText(itemOrText));
  if (!normalized) return false;

  // Tudo o que represente apenas manutenção do PVP fica fora da promoção:
  // "ATUALIZAÇÃO PVP", "ATUALIZAÇÃO DE PVP", "ATULIZAÇÃO PVP",
  // "REPOSIÇÃO PVP" e "REPOSIÇÃO DE PVP".
  return (
    /\bATUALIZACAO(?: DE)? PVP\b/.test(normalized) ||
    /\bATULIZACAO(?: DE)? PVP\b/.test(normalized) ||
    /\bREPOSICAO(?: DE)? PVP\b/.test(normalized)
  );
}

export function splitCampaignItemsByPromotionInfo(items = []) {
  const printableCandidates = [];
  const pvpUpdateItems = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (isPvpUpdatePromotionInfo(item)) {
      pvpUpdateItems.push(item);
    } else {
      printableCandidates.push(item);
    }
  }

  return { printableCandidates, pvpUpdateItems };
}

export function getCampaignArticleCodes(items = []) {
  return [...new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item?.codigo || item?.artigo || "").trim())
      .filter(Boolean),
  )];
}
