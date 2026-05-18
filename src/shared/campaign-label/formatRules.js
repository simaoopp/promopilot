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

export function obterFormatoAutomaticoEtiqueta(descricao = "") {
  const texto = normalizarTexto(descricao);
  const isA5 = CAMPAIGN_A5_KEYWORDS.some((keyword) => texto.includes(normalizarTexto(keyword)));
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
  const formattedItems = applyAutomaticFormatRulesToItems(items, normalizedFormat);

  if (!isAutomaticFormatMode(normalizedFormat)) {
    const etiquetasPorPagina = normalizedFormat === "a5" ? 2 : 4;
    return dividirEmPaginas(formattedItems, etiquetasPorPagina).map((pageItems) => ({
      layout: normalizedFormat,
      items: pageItems,
    }));
  }

  const paginas = [];
  let bufferA5 = [];
  let bufferA6 = [];

  const fecharBufferA5 = () => {
    if (!bufferA5.length) return;

    dividirEmPaginas(bufferA5, 2).forEach((pageItems) => {
      paginas.push({ layout: "a5", items: pageItems });
    });

    bufferA5 = [];
  };

  const fecharBufferA6 = () => {
    if (!bufferA6.length) return;

    dividirEmPaginas(bufferA6, 4).forEach((pageItems) => {
      paginas.push({ layout: "a6", items: pageItems });
    });

    bufferA6 = [];
  };

  formattedItems.forEach((item) => {
    if (item._formato === "a5") {
      fecharBufferA6();
      bufferA5.push(item);

      if (bufferA5.length === 2) {
        fecharBufferA5();
      }

      return;
    }

    fecharBufferA5();
    bufferA6.push(item);

    if (bufferA6.length === 4) {
      fecharBufferA6();
    }
  });

  fecharBufferA5();
  fecharBufferA6();

  return paginas;
}

export function buildManualCampaignPrintPages(items = [], modoAutomatico = true, formatoManual = "a6") {
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
