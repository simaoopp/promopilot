import { isPvpUpdatePromotionInfo } from "./promotionInfoRules.js";
import { normalizarTexto } from "./formatters.js";

export const CAMPAIGN_A5_KEYWORDS = [
  "Máq. Lavar Loiça",
  "Máq. Lavar Louça",
  "Máq. Secar Roupa",
  "Máq. Secar",
  "Máq. Lavar Roupa",
  "Máq. Lavar",
  "maquina de lavar",
  "maquinas de lavar",
  "máquina de lavar",
  "máquinas de lavar",
  "maquina de secar",
  "maquinas de secar",
  "máquina de secar",
  "máquinas de secar",
  "lavar e secar",
  "maquina de lavar e secar",
  "maquinas de lavar e secar",
  "máquina de lavar e secar",
  "máquinas de lavar e secar",
  "maquina de lavar loica",
  "maquinas de lavar loica",
  "máquina de lavar loiça",
  "máquinas de lavar loiça",
  "lava loica",
  "lava loiça",
  "televisao",
  "televisoes",
  "televisão",
  "televisões",
  "tv",
  "smart tv",
  "qled",
  "oled",
  "monitor",
  "monitores",
  "frigorifico",
  "frigorificos",
  "frigorífico",
  "frigoríficos",
  "combinado",
  "combinados",
  "cadeira",
  "cadeiras",
  "mesa",
  "mesas",
  "fogao",
  "fogoes",
  "fogão",
  "fogões",
  "arca",
  "arcas",
  "chamine",
  "chamines",
  "chaminé",
  "chaminés",
  "exaustor",
  "exaustores",
  "cave de vinho",
  "caves de vinho",
  "cave vinho",
  "garrafeira",
  "garrafeiras",
];

export function dividirEmPaginas(items = [], size = 4) {
  const pages = [];

  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }

  return pages;
}

export function isAutomaticFormatMode(format = "automatico") {
  const value = String(format || "automatico").toLowerCase().trim();
  return ["auto", "automatic", "automatico", "automático", "a5/a6", "mixed", "misto"].includes(value);
}

export function normalizeCampaignFormat(format = "automatico") {
  const value = String(format || "automatico").toLowerCase().trim();

  if (value === "a5") return "a5";
  if (value === "a6") return "a6";
  return "automatico";
}

// Canonical names and abbreviations used by Portuguese appliance catalogues.
// Dots, slashes and hyphens in "M.L.R.", "B/CALOR" and "SIDE-BY-SIDE"
// are normalized before matching. Do not match short fragments inside words.
const A5_ABBREVIATIONS = [
  "M.L.R.", "MLR", "M.L.L.", "MLL", "M.S.R.", "MSR", "M.L.S.", "MLS",
  "Máq. Lav. Roupa", "Máq. Lav. Loiça", "Máq. Lav. Louça",
  "Máq. Sec. Roupa", "Máq. Lavar/Secar", "Máq. Lavar e Secar",
  "Frig.", "Frigo", "Frigor.", "Frigorif.", "Comb.", "Combin.",
  "Side by Side", "Side-by-Side", "SBS", "S.B.S.", "SxS", "Americano",
  "Esquentador", "Esquentadores", "Esquent.", "Esquentad.",
  "ESQ. ESTQ.", "ESQ. Estanque", "ESQ. Ventilado", "ESQ. Atmosférico",
  "Termoacumulador", "Termoacumuladores", "Termoac.", "Termoacum.",
  "Termo Acumulador", "T. Acum.", "Termo Elétrico",
  "Bomba de Calor", "Bombas de Calor", "Bomba Calor", "B. Calor",
  "B/Calor", "BC AQS", "B.C. AQS", "Heat Pump",
];

function normalizarDescricaoFormato(value) {
  return normalizarTexto(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const A5_TERMS = [...new Set([...CAMPAIGN_A5_KEYWORDS, ...A5_ABBREVIATIONS]
  .map(normalizarDescricaoFormato).filter(Boolean))];

// Flexible spelling of abbreviated product names without relying on model IDs.
const A5_PRODUCT_PATTERNS = [
  /\b(?:maq(?:uina)?s?\s+(?:de\s+)?lav(?:ar|a)?\s+(?:de\s+)?(?:roupa|r|loica|louca|loica[s]?|louca[s]?))\b/,
  /\b(?:maq(?:uina)?s?\s+(?:de\s+)?sec(?:ar|a)?\s+(?:de\s+)?roupa)\b/,
  /\b(?:maq(?:uina)?s?\s+(?:de\s+)?lav(?:ar|a)?\s+(?:e\s+)?sec(?:ar|a)?(?:\s+roupa)?)\b/,
  /\b(?:lavadora(?:s)?\s+(?:de\s+)?(?:roupa|loica|louca))\b/,
  /\b(?:secador(?:es)?\s+(?:de\s+)?roupa|secadora(?:s)?\s+(?:de\s+)?roupa)\b/,
  /\b(?:frigorific[oa]s?|frigorif|frigor|frigo|frig)\b/,
  /\b(?:combinad[oa]s?|combin|comb|combi)\b/,
  /\b(?:side\s+(?:by\s+)?side|s\s*b\s*s|s\s*x\s*s)\b/,
  /\b(?:esquentador(?:es)?|esquentad|esquent)\b/,
  // "ESQ." alone often means "esquerdo" (e.g. a left-hand spare part).
  /\besq\s+(?:gn|gpl|gas|natural|butano|propano|\d{1,2}\s*l)\b/,
  /\b(?:termo\s*acum(?:ulador(?:es)?)?|t\s+acum(?:ulador(?:es)?)?|termo\s+eletric[oa]s?)\b/,
  /\b(?:bomba(?:s)?\s+(?:de\s+)?calor|b\s+(?:de\s+)?calor|bcalor|b\s*c\s+aqs|bc\s+aqs|heat\s+pump)\b/,
];

// Parts for the appliances should not consume a full-size A5 label just
// because the description says "FILTRO P/ M.L.L." or "MOTOR FRIG.".
const ACCESSORY_PREFIX = /^(?:(?:[a-z0-9]{2,20})\s+)?(?:acessorios?|pecas?|filtros?|resistencias?|mangueiras?|borrachas?|juntas?|motor(?:es)?|modulos?|cestos?|gavetas?|dobradicas?|puxadores?|portas?|valvulas?|tubos?|termostatos?|prateleiras?|vedantes?|correias?|escovas?|rolamentos?|cabos?|suportes?|comandos?|telecomandos?|carregadores?|adaptadores?|sensor(?:es)?|kits?|painel|paineis|pressostatos?)\b/;

export function obterFormatoAutomaticoEtiqueta(descricao = "") {
  const texto = normalizarDescricaoFormato(descricao);
  if (!texto || ACCESSORY_PREFIX.test(texto)) return "a6";
  const padded = ` ${texto} `;
  const isA5 = A5_TERMS.some((term) => padded.includes(` ${term} `)) ||
    A5_PRODUCT_PATTERNS.some((pattern) => pattern.test(texto));
  return isA5 ? "a5" : "a6";
}

export function obterFormatoEtiquetaItem(item, modoAutomatico, formatoManual) {
  if (!modoAutomatico) return formatoManual;
  return obterFormatoAutomaticoEtiqueta(item?.descricao || "");
}

export function applyAutomaticFormatRules(item = {}, format = "automatico") {
  const normalizedFormat = normalizeCampaignFormat(format);
  const formato = isAutomaticFormatMode(normalizedFormat)
    ? obterFormatoAutomaticoEtiqueta(item.descricao)
    : normalizedFormat;

  return {
    ...item,
    _formato: formato,
    formato_final: formato,
    formatoEtiqueta: formato,
    formato_automatico: isAutomaticFormatMode(normalizedFormat),
  };
}

export function applyAutomaticFormatRulesToItems(items = [], format = "automatico") {
  return (Array.isArray(items) ? items : []).map((item) => applyAutomaticFormatRules(item, format));
}

export function buildAutomaticPrintPages(items = [], format = "automatico") {
  const normalizedFormat = normalizeCampaignFormat(format);
  const formattedItems = applyAutomaticFormatRulesToItems(items, normalizedFormat)
    .filter((item) => !isPvpUpdatePromotionInfo(item));

  if (!isAutomaticFormatMode(normalizedFormat)) {
    const etiquetasPorPagina = normalizedFormat === "a5" ? 2 : 4;
    return dividirEmPaginas(formattedItems, etiquetasPorPagina).map((pageItems) => ({
      layout: normalizedFormat,
      items: pageItems,
    }));
  }

  // Regra operacional de impressão: em modo automático misto, imprimimos sempre
  // todas as folhas A6 primeiro e só depois as A5. Isto evita alternância física
  // de formatos na impressora e torna o fluxo previsível para loja/produção.
  const itemsA6 = formattedItems.filter((item) => item._formato !== "a5");
  const itemsA5 = formattedItems.filter((item) => item._formato === "a5");

  return [
    ...dividirEmPaginas(itemsA6, 4).map((pageItems) => ({
      layout: "a6",
      items: pageItems,
    })),
    ...dividirEmPaginas(itemsA5, 2).map((pageItems) => ({
      layout: "a5",
      items: pageItems,
    })),
  ];
}

export function buildManualCampaignPrintPages(items = [], modoAutomatico = true, formatoManual = "a6") {
  items = items.filter((item) => !isPvpUpdatePromotionInfo(item));
  if (!modoAutomatico) {
    const etiquetasPorPagina = formatoManual === "a5" ? 2 : 4;
    return dividirEmPaginas(items, etiquetasPorPagina).map((pageItems) => ({
      layout: formatoManual,
      items: pageItems,
    }));
  }

  return buildAutomaticPrintPages(items, "automatico");
}

export function countAutomaticFormats(items = []) {
  return (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      const formato = String(item?._formato || item?.formato_final || item?.formatoEtiqueta || "a6").toLowerCase();
      if (formato === "a5") acc.a5 += 1;
      else acc.a6 += 1;
      return acc;
    },
    { a5: 0, a6: 0 },
  );
}
