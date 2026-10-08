function normalizePromotionInfo(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(?:ACTUAL|ATUAL|ATUL)\.(?=\s*(?:D[EO]S?\s+)?P[.\s]*V[.\s]*P)/g, "ATUALIZACAO")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Read operational metadata, never product descriptions: mentioning a PVP in a
// product name does not classify that product as price maintenance.
export function getPromotionInfoText(itemOrText = "") {
  if (typeof itemOrText === "string" || typeof itemOrText === "number") {
    return String(itemOrText ?? "");
  }

  const item = itemOrText && typeof itemOrText === "object" ? itemOrText : {};
  const fields = new Set([
    "INFO", "INFORMACAO", "INFORMACOES", "INFORMACAOPROMO", "INFORMACOESPROMO",
    "INFORMACAOPROMOCAO", "INFORMACOESPROMOCAO", "ALTERADO", "ESTADO",
    "TIPOALTERACAO", "TIPOMOVIMENTO", "MOTIVO", "OBSERVACAO", "OBSERVACOES",
  ]);
  return Object.entries(item)
    .filter(([key, value]) => fields.has(normalizePromotionInfo(key).replace(/ /g, ""))
      && (typeof value === "string" || typeof value === "number"))
    .map(([, value]) => String(value))
    .join(" | ");
}

export function isPvpUpdatePromotionInfo(itemOrText = "") {
  const normalized = normalizePromotionInfo(getPromotionInfoText(itemOrText))
    // P.V.P., P V P, PVP2 and PVP 3 are the same price marker here.
    .replace(/\bP\s*V\s*P(?:\s*[123])?\b/g, "PVP");
  if (!normalized) return false;

  const maintenance = "(?:ACTUALIZACAO|ATUALIZACAO|ATULIZACAO|ACTUALIZAR|ATUALIZAR|REPOSICAO|REPOR|REPOS)";
  const connector = "(?:D[EO](?:S)?\\s+)?";
  return new RegExp(`\\b${maintenance}\\s*${connector}PVP(?:[123])?\\b`).test(normalized)
    || new RegExp(`\\bPVP\\s+${connector}${maintenance}\\b`).test(normalized);
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
