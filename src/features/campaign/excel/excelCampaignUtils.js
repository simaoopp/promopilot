import { campanhaSemDataDefinida } from "../../../utils/campaignTitleRules";
import { formatarEuro, parseNumero } from "../../../utils/formatters";

export const EXCEL_FORMATS = {
  CAMPANHA: "campanha",
  SHOPPING: "shopping",
};

export const CAMPANHA_TABLE_COLUMNS = [
  { key: "codigo", label: "CÓDIGO", tipo: "text" },
  { key: "descricao", label: "DESCRIÇÃO", tipo: "text" },
  { key: "pn", label: "PN", tipo: "text" },
  { key: "ean", label: "EAN" },
  { key: "antes", label: "PVP2 ANTES", tipo: "number" },
  { key: "atual", label: "PVP2 ATUAL", tipo: "number" },
  { key: "pv3", label: "PV3" },
  { key: "estado", label: "ESTADO", tipo: "text" },
  { key: "ae", label: "AE", tipo: "number" },
  { key: "aea", label: "AEA", tipo: "number" },
  { key: "aev", label: "AEV", tipo: "number" },
  { key: "a10", label: "A10", tipo: "number" },
  { key: "a1e", label: "A1E", tipo: "number" },
  { key: "data", label: "DATA" },
  { key: "dataInicio", label: "DATA INÍCIO" },
  { key: "dataFim", label: "DATA FIM" },
  { key: "alterado", label: "ALTERADO PRIMAVERA" },
  { key: "info", label: "INFORMAÇÃO", tipo: "text" },
];

export const CAMPANHA_PRIMARY_COLUMNS = [
  { key: "codigo", label: "ARTIGO", tipo: "text" },
  { key: "descricao", label: "DESCRIÇÃO", tipo: "text" },
  { key: "antes", label: "PVP ANTES", tipo: "number" },
  { key: "atual", label: "PVP ATUAL", tipo: "number" },
  { key: "dataInicio", label: "DATA INÍCIO" },
  { key: "dataFim", label: "DATA FIM" },
];

export const SHOPPING_TABLE_COLUMNS = [
  { key: "codigo", label: "NOSSO CÓDIGO", tipo: "text" },
  { key: "descricao", label: "DESCRIÇÃO", tipo: "text" },
  { key: "ean", label: "EAN" },
  { key: "nossoPreco", label: "NOSSO PREÇO", tipo: "number" },
  { key: "worten", label: "WORTEN", tipo: "number" },
  { key: "radioPopular", label: "RÁDIO POPULAR", tipo: "number" },
  { key: "menorConcorrente", label: "MENOR CONCORRÊNCIA", tipo: "number" },
  { key: "comparacao", label: "COMPARAÇÃO", tipo: "text" },
  { key: "precoSemDescontoSelecionado", label: "PREÇO SEM DESCONTO" },
  { key: "precoComDescontoSelecionado", label: "PREÇO COM DESCONTO" },
];

export const SHOPPING_PRIMARY_COLUMNS = [
  { key: "codigo", label: "ARTIGO", tipo: "text" },
  { key: "descricao", label: "DESCRIÇÃO", tipo: "text" },
  { key: "nossoPreco", label: "NOSSO PREÇO", tipo: "number" },
  { key: "menorConcorrente", label: "MENOR CONCORRÊNCIA", tipo: "number" },
  { key: "comparacao", label: "COMPARAÇÃO", tipo: "text" },
  { key: "precoSemDescontoSelecionado", label: "PREÇO SEM DESCONTO" },
  { key: "precoComDescontoSelecionado", label: "PREÇO COM DESCONTO" },
];

export const SHOPPING_PRICE_SOURCE_OPTIONS = [
  { value: "nossoPreco", label: "Nosso preço" },
  { value: "worten", label: "Worten" },
  { value: "radioPopular", label: "Rádio Popular" },
  { value: "manual", label: "Outro" },
];

export const SHOPPING_PRICE_SOURCE_LABELS = {
  nossoPreco: "Nosso preço",
  worten: "Worten",
  radioPopular: "Rádio Popular",
  manual: "Outro",
};

/* =========================================================
   HELPERS
   ========================================================= */
export function normalizarCabecalho(texto) {
  return String(texto || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/_/g, " ")
    .trim();
}

export function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function obterValor(normalizado, chaves = [], fallback = "") {
  for (const chave of chaves) {
    if (normalizado[chave] !== undefined && normalizado[chave] !== null) {
      return normalizado[chave];
    }
  }
  return fallback;
}

export function formatarValorTabelaMoeda(valor) {
  return parseNumero(valor) > 0 ? `${formatarEuro(valor)}€` : "—";
}
export function formatarLabelOpcaoPreco(opcao) {
  if (opcao.value === "manual") return "Outro valor";
  return `${opcao.label}: ${formatarValorTabelaMoeda(opcao.valor)}`;
}

export function obterOpcoesPrecoShopping(item) {
  return [
    {
      key: "nossoPreco",
      label: "Nosso preço",
      valor: parseNumero(item.nossoPreco),
    },
    {
      key: "worten",
      label: "Worten",
      valor: parseNumero(item.worten),
    },
    {
      key: "radioPopular",
      label: "Rádio Popular",
      valor: parseNumero(item.radioPopular),
    },
  ].filter((opcao) => Number.isFinite(opcao.valor) && opcao.valor > 0);
}

export function obterFontePrecoPredefinida(item, criterio = "max") {
  const opcoes = obterOpcoesPrecoShopping(item);

  if (!opcoes.length) return "nossoPreco";

  const comparador = criterio === "min"
    ? (atual, melhor) => atual.valor < melhor.valor
    : (atual, melhor) => atual.valor > melhor.valor;

  return opcoes.reduce((melhor, atual) => (
    comparador(atual, melhor) ? atual : melhor
  )).key;
}

export function obterValorFontePreco(item, fonte, valorManual = "") {
  if (fonte === "manual") {
    return parseNumero(valorManual);
  }

  return parseNumero(item[fonte]);
}

export function recalcularSelecaoPrecosShopping(item) {
  const antes = obterValorFontePreco(
    item,
    item.precoSemDescontoFonte,
    item.precoSemDescontoManual,
  );
  const atual = obterValorFontePreco(
    item,
    item.precoComDescontoFonte,
    item.precoComDescontoManual,
  );

  return {
    ...item,
    antes,
    atual,
  };
}

export function formatarSelecaoPrecoShopping(item, tipo) {
  const isSemDesconto = tipo === "semDesconto";
  const fonte = isSemDesconto
    ? item.precoSemDescontoFonte
    : item.precoComDescontoFonte;
  const valor = isSemDesconto ? item.antes : item.atual;
  const label = SHOPPING_PRICE_SOURCE_LABELS[fonte] || "—";

  return `${label}: ${formatarValorTabelaMoeda(valor)}`;
}

export function obterClasseIndicadorShopping(item) {
  if (item.tipo_registo !== EXCEL_FORMATS.SHOPPING) return "";

  switch (item.precoComDescontoFonte) {
    case "radioPopular":
      return "shopping-price-dot--radio-popular";
    case "worten":
      return "shopping-price-dot--worten";
    case "nossoPreco":
    default:
      return "shopping-price-dot--nosso-preco";
  }
}

export function obterOpcoesSelectShopping(item) {
  return SHOPPING_PRICE_SOURCE_OPTIONS.map((option) => {
    const valor =
      option.value === "manual" ? null : obterValorFontePreco(item, option.value);

    return {
      ...option,
      valor,
      optionLabel: formatarLabelOpcaoPreco({ ...option, valor }),
    };
  });
}

export function renderExcelTableCell(item, columnKey, formatoPrevisto = "") {
  switch (columnKey) {
    case "antes":
    case "atual":
    case "nossoPreco":
    case "worten":
    case "radioPopular":
    case "menorConcorrente":
      return formatarValorTabelaMoeda(item[columnKey]);
    case "precoSemDescontoSelecionado":
      return formatarSelecaoPrecoShopping(item, "semDesconto");
    case "precoComDescontoSelecionado":
      return formatarSelecaoPrecoShopping(item, "comDesconto");
    case "info": {
      const infoBase = item.info || "";
      return `${infoBase}${infoBase ? " · " : ""}${formatoPrevisto.toUpperCase()}`;
    }
    default:
      return item[columnKey] ?? "";
  }
}

export function formatarDataDiaMes(data) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

export function formatarDataInputDiaMes(valor) {
  const [ano, mes, dia] = String(valor || "").split("-");

  if (!ano || !mes || !dia) return "";

  return `${dia}/${mes}`;
}


export function normalizarCodigoTexto(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

export function normalizarEan(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number") {
    return String(Math.trunc(valor));
  }
  return String(valor).replace(/\D/g, "");
}

export function limparComparador(valor) {
  const texto = normalizarTexto(valor);
  if (!texto || texto === "x" || texto === "-") return 0;
  return parseNumero(valor);
}

export function obterMenorPrecoConcorrencia(...valores) {
  const numeros = valores
    .map((valor) => parseNumero(valor))
    .filter((valor) => Number.isFinite(valor) && valor > 0);

  if (!numeros.length) return 0;
  return Math.min(...numeros);
}

export function normalizarComparacaoShopping(valor, nossoPreco, menorConcorrente) {
  const texto = normalizarTexto(valor);

  if (texto.includes("mais baixo")) return "Preço mais baixo";
  if (texto.includes("mais alto")) return "Preço mais alto";
  if (texto.includes("igual")) return "Igual";

  if (nossoPreco > 0 && menorConcorrente > 0) {
    if (nossoPreco < menorConcorrente) return "Preço mais baixo";
    if (nossoPreco > menorConcorrente) return "Preço mais alto";
    return "Igual";
  }

  return "Sem comparação";
}

export function detetarFormatoExcel(rows = []) {
  if (!rows.length) return EXCEL_FORMATS.CAMPANHA;

  const cabecalhos = Object.keys(rows[0] || {}).map((key) =>
    normalizarCabecalho(key),
  );

  const temCabecalhoShopping =
    cabecalhos.includes("NOSSO CODIGO") ||
    cabecalhos.includes("NOSSO PRECO") ||
    cabecalhos.includes("WORTEN") ||
    cabecalhos.includes("RADIO POPULAR");

  return temCabecalhoShopping
    ? EXCEL_FORMATS.SHOPPING
    : EXCEL_FORMATS.CAMPANHA;
}

export function mapearLinhaExcelCampanha(row, index) {
  const normalizado = {};

  Object.keys(row || {}).forEach((key) => {
    normalizado[normalizarCabecalho(key)] = row[key];
  });

  return {
    id: `excel-campanha-${index}`,
    tipo_registo: EXCEL_FORMATS.CAMPANHA,
    codigo: obterValor(normalizado, ["CODIGO", "CÓDIGO", "ARTIGO"], ""),
    descricao: obterValor(
      normalizado,
      ["DESCRICAO", "DESCRIÇÃO", "DESIGNACAO", "DESIGNAÇÃO"],
      "",
    ),
    pn: obterValor(normalizado, ["PN", "PART NUMBER"], ""),
    ean: obterValor(normalizado, ["EAN", "CODIGO BARRAS", "CÓDIGO BARRAS"], ""),
    antes: parseNumero(
      obterValor(
        normalizado,
        ["PVP2 ANTES", "ANTES", "PRECO ANTES", "PREÇO ANTES"],
        0,
      ),
    ),
    atual: parseNumero(
      obterValor(
        normalizado,
        ["PVP2 ATUAL", "ATUAL", "PRECO ATUAL", "PREÇO ATUAL"],
        0,
      ),
    ),
    pv3: obterValor(normalizado, ["PV3"], ""),
    estado: obterValor(normalizado, ["ESTADO"], ""),
    ae: obterValor(normalizado, ["AE"], ""),
    aea: obterValor(normalizado, ["AEA"], ""),
    aev: obterValor(normalizado, ["AEV"], ""),
    a10: obterValor(normalizado, ["A10"], ""),
    a1e: obterValor(normalizado, ["A1E"], ""),
    data: obterValor(normalizado, ["DATA"], ""),
    dataInicio: obterValor(
      normalizado,
      ["DATA INICIO", "DATA INÍCIO", "DATA_INICIO"],
      "",
    ),
    dataFim: obterValor(normalizado, ["DATA FIM", "DATA_FIM"], ""),
    alterado: obterValor(normalizado, ["ALTERADO PRIMAVERA", "ALTERADO"], ""),
    info: obterValor(normalizado, ["INFORMAÇÃO", "INFORMACAO", "INFO"], ""),
    selecionado: false,
  };
}

export function mapearLinhaExcelShopping(row, index) {
  const normalizado = {};

  Object.keys(row || {}).forEach((key) => {
    normalizado[normalizarCabecalho(key)] = row[key];
  });

  const nossoPreco = parseNumero(
    obterValor(normalizado, ["NOSSO PRECO", "NOSSO PREÇO"], 0),
  );
  const worten = limparComparador(obterValor(normalizado, ["WORTEN"], 0));
  const radioPopular = limparComparador(
    obterValor(normalizado, ["RADIO POPULAR", "RÁDIO POPULAR"], 0),
  );
  const menorConcorrente = obterMenorPrecoConcorrencia(worten, radioPopular);
  const comparacao = normalizarComparacaoShopping(
    obterValor(normalizado, ["OBSERVACOES", "OBSERVAÇÕES", "EMPTY 9", "EMPTY 8"], ""),
    nossoPreco,
    menorConcorrente,
  );

  const precoSemDescontoFonte = obterFontePrecoPredefinida(
    { nossoPreco, worten, radioPopular },
    "max",
  );
  const precoComDescontoFonte = obterFontePrecoPredefinida(
    { nossoPreco, worten, radioPopular },
    "min",
  );

  return recalcularSelecaoPrecosShopping({
    id: `excel-shopping-${index}`,
    tipo_registo: EXCEL_FORMATS.SHOPPING,
    codigo: normalizarCodigoTexto(
      obterValor(normalizado, ["NOSSO CODIGO", "NOSSO CÓDIGO", "CODIGO"], ""),
    ),
    descricao: obterValor(
      normalizado,
      ["DESCRICAO", "DESCRIÇÃO", "DESIGNACAO", "DESIGNAÇÃO"],
      "",
    ),
    pn: "",
    ean: normalizarEan(obterValor(normalizado, ["EAN"], "")),
    antes: 0,
    atual: 0,
    pv3: "",
    estado: "",
    ae: 0,
    aea: 0,
    aev: 0,
    a10: 0,
    a1e: 0,
    data: "",
    dataInicio: "",
    dataFim: "",
    alterado: "",
    info: "SHOPPING",
    nossoPreco,
    worten,
    radioPopular,
    menorConcorrente,
    comparacao,
    precoSemDescontoFonte,
    precoSemDescontoManual: "",
    precoComDescontoFonte,
    precoComDescontoManual: "",
    selecionado: false,
  });
}

export function mapearLinhaExcel(row, index, formato) {
  return formato === EXCEL_FORMATS.SHOPPING
    ? mapearLinhaExcelShopping(row, index)
    : mapearLinhaExcelCampanha(row, index);
}

export function obterFormatoAutomaticoEtiqueta(descricao = "") {
  const texto = normalizarTexto(descricao);

  const palavrasA5 = [
    "máq. lavar loiça",
    "máq. lavar louça",
    "máq. secar roupa",
    "máq. secar",
    "máq. lavar roupa",
    "máq. lavar",
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

  const isA5 = palavrasA5.some((palavra) => texto.includes(palavra));
  return isA5 ? "a5" : "a6";
}

export function obterTextoValidade(item, anoValidade, tituloCampanha) {
  if (campanhaSemDataDefinida(tituloCampanha)) return "";

  const normalizarData = (valor) => {
    const texto = String(valor || "").trim();
    return texto && texto !== "-" ? texto : "";
  };

  const dataInicio = normalizarData(item.dataInicio);
  const dataFim = normalizarData(item.dataFim);

  if (!dataInicio && !dataFim) {
    const hoje = new Date();
    const fim = new Date();
    fim.setDate(hoje.getDate() + 30);

    return `VÁLIDO DE ${formatarDataDiaMes(
      hoje,
    )}/${hoje.getFullYear()} A ${formatarDataDiaMes(fim)}/${fim.getFullYear()}`;
  }

  return `VÁLIDO DE ${dataInicio || "-"}${
    dataInicio ? `/${anoValidade}` : ""
  } A ${dataFim || "-"}${dataFim ? `/${anoValidade}` : ""}`;
}

export function obterFormatoFinalEtiqueta(
  item,
  formatoAutomaticoAtivo,
  formatoManual,
) {
  if (!formatoAutomaticoAtivo) return formatoManual;
  return obterFormatoAutomaticoEtiqueta(item.descricao);
}
