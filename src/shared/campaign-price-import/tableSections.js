import { isPvpUpdatePromotionInfo, getCampaignArticleCodes } from "../campaign-label/promotionInfoRules.js";

const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const maintenance = value => /^(?:atualizacao|actualizacao|reposicao)(?: de pvp(?: ?[123])?)?$/.test(normalize(value)) || (/^(?:(?:atual|actual|actul|atul)[a-z]*|repor|repos|reposicao|pvp|p v p)\b/.test(normalize(value)) && isPvpUpdatePromotionInfo(value));
const possibleMaintenance = value => /\b(?:atualiz\w*|actualiz\w*|reposi\w*|repor)\b/.test(normalize(value));
const promotion = value => /^(?:promo|promocao|promocoes|campanha|campanhas|artigos promocionais)(?: .*)?$/.test(normalize(value));

// A section title must occupy a title row. A product description that mentions
// an update is not evidence that its price belongs to a maintenance section.
export function classifyTableRows(sheet, mapping) {
  const result = [];
  let section = "promotion", sectionReason = "";
  const headers = sheet.rows[mapping.headerRow] || [];
  for (let index = mapping.headerRow + 1; index < sheet.rows.length; index++) {
    const cells = sheet.rows[index];
    const values = [...new Set(cells.map(cell => String(cell?.text ?? "").trim()).filter(Boolean))];
    if (!values.length) continue;
    if (headers.length && cells.every((cell, col) => normalize(cell?.text) === normalize(headers[col]?.text))) continue;
    const code = String(cells[mapping.codeColumn]?.text ?? "").trim();
    const rawPrice = String(cells[mapping.priceColumn]?.text ?? "").trim();
    const hasCode = Boolean(code) && (/\d/.test(code) || (/^[a-z._/-]{1,40}$/i.test(code) && values.length > 1));
    // Single/merged title rows are checked before the code heuristic (PVP2
    // contains a digit but is not an article identifier).
    if (values.length === 1 && (maintenance(values[0]) || possibleMaintenance(values[0]) || promotion(values[0]))) {
      const unsafeTitle = cells.some(cell => cell?.unsafe);
      section = unsafeTitle ? "review" : maintenance(values[0]) ? "excluded" : promotion(values[0]) ? "promotion" : "review";
      sectionReason = section === "promotion" ? "" : `Secção: ${values[0]}`;
      continue;
    }
    if ((values.length === 1 && /^(?:nota|notas|observacao|observacoes|condicoes|total|subtotal|valido|valida|validade|periodo)\b/.test(normalize(values[0]))) || (!hasCode && (!rawPrice || values.length === 1))) {
      // A different decorative title terminates a known maintenance section.
      // Its following products need review instead of inheriting an exclusion.
      if (section !== "promotion") { section = "review"; sectionReason = "A secção mudou; confirme se o artigo é promocional."; }
      continue;
    }
    const infoCell = mapping.informationColumn >= 0 ? cells[mapping.informationColumn] : null;
    const info = String(infoCell?.text ?? "").trim();
    let classification = section, reason = sectionReason;
    if (!infoCell?.unsafe && maintenance(info)) { classification = "excluded"; reason = info; }
    else if (possibleMaintenance(info) || (infoCell?.unsafe && info)) {
      classification = "review"; reason = "Confirme a informação de atualização/reposição desta linha.";
    } else if (section === "excluded" && promotion(info)) {
      classification = "review"; reason = "A informação da linha contradiz a secção de atualização/reposição.";
    }
    result.push({ cells, line: index + 1, classification, reason });
  }
  return result;
}

export function excludedCodes(rows) {
  return getCampaignArticleCodes(rows.filter(row => row.classification === "excluded")
    .map(row => ({ codigo: row.code }))).join("|");
}
