import { isPvpUpdatePromotionInfo } from "./promotionInfoRules.js";

export const CAMPAIGN_A5_KEYWORDS = [
  // Apenas as categorias pedidas: marcas, modelos e polegadas são irrelevantes.
  "TV", "SmartTV", "Televisão", "Televisor",
  "Máquina de lavar roupa", "Máquina de lavar loiça", "Máquina de secar roupa",
  "Máquina de lavar e secar roupa", "Máquina de lavar alta pressão",
  "Frigorífico", "Combinado", "Side by Side",
  "Fogão", "Esquentador", "Termoacumulador", "Bomba de calor", "Jato de água",
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

// Classificação por TIPO de produto, nunca por marca, modelo, tamanho ou preço.
// A6 é o formato de segurança para tudo o que não corresponde a uma categoria A5.
// Regra independente de catálogos, para funcionar nas campanhas manual e Excel.
export function normalizarTermoEtiqueta(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// A5: categorias inteiras, com singulares/plurais e abreviaturas correntes.
// Limites de palavra evitam que "TV" classifique "ATV", ou "comb" classifique
// "combustível". As peças são excluídas antes de aplicar qualquer categoria.
const CATEGORY_PATTERNS = Object.freeze([
  // Televisões de qualquer fabricante, tamanho e tecnologia.
  /\b(?:tvs?|smart\s*tv|televis(?:ao|oes|or(?:es)?|or[a]?)?|television(?:s)?|telev(?:isor(?:es)?)?|qled|oled|qned|uled|nanocell|mini\s*led\s+(?:tv|smart)|led\s+(?:smart\s*)?tv)\b/,
  // Máquinas completas para lavar roupa/loiça, secar e lavar/secar.
  /\b(?:maquinas?|maq|maqs)\s+(?:de\s+)?(?:lav(?:ar|a)?|sec(?:ar|a)?|lavadora|secar)\b|\b(?:mlr|mll|msr|mls|m\s*l\s*[rls]|m\s*s\s*r|lava\s*loi(?:ca|s)|lava\s*loucas?|lavadora(?:s)?\s+(?:de\s+)?(?:loica|louca|roupa)|secadora(?:s)?\s+(?:de\s+)?roupa)\b/,
  /\b(?:secador(?:es)?\s+(?:de\s+)?roupa|lavar\s+e\s+secar|lavar\s+secar)\b/,
  // Frigoríficos, combinados e side by side (não arcas isoladas).
  /\b(?:frigorific[oa]s?|frigorif|frigor|frigo|frig|combinad[oa]s?|combin|comb|combi|side\s+(?:by\s+)?side|s\s*b\s*s|s\s*x\s*s|refrigerador(?:es)?)\b/,
  // Fogões. Fornos de encastre e placas NÃO são abrangidos.
  /\b(?:fog(?:ao|oes)|fog)\b/,
  // Esquentadores, termoacumuladores e bombas de calor.
  /\b(?:esquentador(?:es)?|esquentad|esquent|esq\s+(?:gn|gpl|gas|natural|butano|propano|estq|estanque|ventilado|\d{1,2}\s*l))\b/,
  /\b(?:termo\s*acum(?:ulador(?:es)?)?|termoac|termoacum|t\s+acum(?:ulador(?:es)?)?|termo\s+eletric[oa]s?)\b/,
  /\b(?:bomba(?:s)?\s+(?:de\s+)?calor|b\s+(?:de\s+)?calor|bcalor|b\s*c\s+aqs|bc\s+aqs|heat\s+pump)\b/,
  // Jatos de água e lavadoras de alta pressão.
  /\b(?:jatos?|jat)\s+(?:de\s+|d\s+)?(?:agua|pressao)\b|\b(?:hidro\s*lavadora(?:s)?|lava\s+jato|pressure\s+washer|jet\s+washer|mlap|m\s*l\s*a\s*p)\b/,
  /\b(?:lavadoras?|limpadoras?|lav)\s+(?:de\s+|a\s+)?(?:alta\s+|a\s+)?pressao\b|\blavadora\s+ap\b|\b(?:maq|maquina)\s+(?:de\s+)?alta\s+pressao\b/,
]);

// A designação "combinado" também é usada em fornos e micro-ondas;
// OLED/QLED também aparece em monitores. Só o equipamento pedido recebe A5.
const OTHER_EQUIPMENT = /\b(?:fornos?|micro\s*ondas|microondas|placas?|monitor(?:es)?|ecras?|displays?|arcas?|congeladores?|exaustor(?:es)?|chamines?|cadeiras?|mesas?|garrafeiras?|caves?\s+(?:de\s+)?vinho)\b/;
const EXPLICIT_REQUESTED_EQUIPMENT = /\b(?:tvs?|smart\s*tv|televis(?:ao|oes|or(?:es)?|or[a]?)?|television(?:s)?|telev(?:isor(?:es)?)?|frigorific[oa]s?|frigorif|frigor|frigo|frig|fog(?:ao|oes)|fog|(?:maquinas?|maq|maqs)\s+(?:de\s+)?(?:lav(?:ar|a)?|sec(?:ar|a)?)|esquentador(?:es)?|termoac|termo\s+acum|bomba(?:s)?\s+(?:de\s+)?calor|jatos?\s+(?:de\s+)?(?:agua|pressao)|hidro\s*lavadora)\b/;

// Excluir peças e acessórios mesmo quando têm a palavra "TV", "Máquina",
// "Fogão" ou "Frigorífico" no título. Prefixos comerciais também são frequentes.
const ACCESSORY_LEADING = /^(?:(?:[a-z0-9]{2,22})\s+)?(?:acessorios?|pecas?|suportes?|cabos?|comandos?|telecomandos?|adaptadores?|carregadores?|bicos?|lancas?|pistolas?|ponteiras?|filtros?|mangueiras?|borrachas?|juntas?|resistencias?|modulos?|motor(?:es)?|cestos?|gavetas?|dobradicas?|puxadores?|valvulas?|tubos?|termostatos?|prateleiras?|vedantes?|correias?|escovas?|rolamentos?|sensor(?:es)?|kits?|painel|paineis|pressostatos?|pedestais?|parafusos?)\b/;
const NOT_A_TV = /\b(?:tv\s+box|box\s+(?:tv|android\s+tv)|stick\s+(?:tv|streaming)|fire\s+tv\s+stick)\b/;

export const DEFAULT_LABEL_RULES = Object.freeze({ a5: [], a6: [] });

export function validarTermosEtiquetas(terms) {
  if (!Array.isArray(terms) || terms.length > 100) throw new Error("Máximo de 100 expressões por lista.");
  const normalized = terms.map(term => String(term ?? "").trim()).filter(Boolean);
  if (normalized.some(term => term.length > 80 || normalizarTermoEtiqueta(term).length < 2)) {
    throw new Error("Cada expressão deve ter entre 2 e 80 caracteres úteis.");
  }
  const unique = new Set(normalized.map(normalizarTermoEtiqueta));
  if (unique.size !== normalized.length) throw new Error("Existem expressões repetidas.");
  return normalized;
}

function containsTerm(text, term) {
  const token = normalizarTermoEtiqueta(term);
  return !!token && (` ${text} `).includes(` ${token} `);
}

export function explicarFormatoAutomaticoEtiqueta(descricao = "", rules = DEFAULT_LABEL_RULES) {
  const text = normalizarTermoEtiqueta(descricao);
  if (!text) return { formato: "a6", motivo: "Sem descrição" };
  // O técnico pode mencionar um suporte ou cabo na descrição de uma TV real;
  // o prefixo de peça / acessório é mais fiável do que excluir essa palavra sempre.
  const accessoryAtStart = ACCESSORY_LEADING.test(text);
  const accessoryExplicit = /\b(?:pecas?|acessorios?|de\s+reposicao|para\s+(?:reparacao|substituicao))\b/.test(text);
  const isTvBox = NOT_A_TV.test(text) && !/\btelevisor(?:es)?\b/.test(text);
  if (accessoryAtStart || accessoryExplicit || isTvBox) return { formato: "a6", motivo: "Peça/acessório ou TV Box" };
  if (Array.isArray(rules?.a6) && rules.a6.some(term => containsTerm(text, term))) {
    return { formato: "a6", motivo: "Exceção A6 definida pelo administrador" };
  }
  if (Array.isArray(rules?.a5) && rules.a5.some(term => containsTerm(text, term))) {
    return { formato: "a5", motivo: "Expressão A5 definida pelo administrador" };
  }
  // Ex.: "forno combinado" ou "monitor OLED" não se tornam A5
  // por partilharem uma palavra com frigoríficos ou televisões.
  if (OTHER_EQUIPMENT.test(text) && !EXPLICIT_REQUESTED_EQUIPMENT.test(text)) {
    return { formato: "a6", motivo: "Categoria não definida como A5" };
  }
  if (CATEGORY_PATTERNS.some(pattern => pattern.test(text))) {
    return { formato: "a5", motivo: "Categoria de equipamento A5" };
  }
  // Descrição não reconhecida = A6, nunca inferir tamanho por marca ou polegadas.
  return { formato: "a6", motivo: "Restantes artigos (A6)" };
}

export function obterFormatoAutomaticoEtiqueta(descricao = "", rules = DEFAULT_LABEL_RULES) {
  return explicarFormatoAutomaticoEtiqueta(descricao, rules).formato;
}

export function obterFormatoEtiquetaItem(item, modoAutomatico, formatoManual, rules = DEFAULT_LABEL_RULES) {
  if (!modoAutomatico) return formatoManual;
  return obterFormatoAutomaticoEtiqueta(item?.descricao || "", rules);
}

export function applyAutomaticFormatRules(item = {}, format = "automatico", rules = DEFAULT_LABEL_RULES) {
  const normalizedFormat = normalizeCampaignFormat(format);
  const formato = isAutomaticFormatMode(normalizedFormat)
    ? obterFormatoAutomaticoEtiqueta(item.descricao, rules)
    : normalizedFormat;

  return {
    ...item,
    _formato: formato,
    formato_final: formato,
    formatoEtiqueta: formato,
    formato_automatico: isAutomaticFormatMode(normalizedFormat),
  };
}

export function applyAutomaticFormatRulesToItems(items = [], format = "automatico", rules = DEFAULT_LABEL_RULES) {
  return (Array.isArray(items) ? items : []).map((item) => applyAutomaticFormatRules(item, format, rules));
}

export function buildAutomaticPrintPages(items = [], format = "automatico", rules = DEFAULT_LABEL_RULES) {
  const normalizedFormat = normalizeCampaignFormat(format);
  const formattedItems = applyAutomaticFormatRulesToItems(items, normalizedFormat, rules)
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

export function buildManualCampaignPrintPages(items = [], modoAutomatico = true, formatoManual = "a6", rules = DEFAULT_LABEL_RULES) {
  items = items.filter((item) => !isPvpUpdatePromotionInfo(item));
  if (!modoAutomatico) {
    const etiquetasPorPagina = formatoManual === "a5" ? 2 : 4;
    return dividirEmPaginas(items, etiquetasPorPagina).map((pageItems) => ({
      layout: formatoManual,
      items: pageItems,
    }));
  }

  return buildAutomaticPrintPages(items, "automatico", rules);
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
