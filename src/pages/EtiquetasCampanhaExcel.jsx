import React, { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { printDocument } from "../utils/print";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import logo from "../logo.png";
import Barcode from "../components/Barcode";
import FilterMenu from "../components/FilterMenu";
import "../styles/styles.css";

import { formatarEuro, parseNumero } from "../utils/formatters";
import { useAutoFontSize } from "../utils/useAutoFontSize";
import {
  addCampaignToHistory,
  createCampaignSnapshot,
} from "../utils/campaignHistory";
import {
  aplicarFiltroTexto,
  compararNumero,
  dividirEmPaginas,
} from "../utils/filters";
import SyncedHorizontalScroll from "../components/SyncedHorizontalScroll";

const EXCEL_FORMATS = {
  CAMPANHA: "campanha",
  SHOPPING: "shopping",
};

const CAMPANHA_TABLE_COLUMNS = [
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

const CAMPANHA_PRIMARY_COLUMNS = [
  { key: "codigo", label: "ARTIGO", tipo: "text" },
  { key: "descricao", label: "DESCRIÇÃO", tipo: "text" },
  { key: "antes", label: "PVP ANTES", tipo: "number" },
  { key: "atual", label: "PVP ATUAL", tipo: "number" },
  { key: "dataInicio", label: "DATA INÍCIO" },
  { key: "dataFim", label: "DATA FIM" },
];

const SHOPPING_TABLE_COLUMNS = [
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

const SHOPPING_PRIMARY_COLUMNS = [
  { key: "codigo", label: "ARTIGO", tipo: "text" },
  { key: "descricao", label: "DESCRIÇÃO", tipo: "text" },
  { key: "nossoPreco", label: "NOSSO PREÇO", tipo: "number" },
  { key: "menorConcorrente", label: "MENOR CONCORRÊNCIA", tipo: "number" },
  { key: "comparacao", label: "COMPARAÇÃO", tipo: "text" },
  { key: "precoSemDescontoSelecionado", label: "PREÇO SEM DESCONTO" },
  { key: "precoComDescontoSelecionado", label: "PREÇO COM DESCONTO" },
];

const SHOPPING_PRICE_SOURCE_OPTIONS = [
  { value: "nossoPreco", label: "Nosso preço" },
  { value: "worten", label: "Worten" },
  { value: "radioPopular", label: "Rádio Popular" },
  { value: "manual", label: "Outro" },
];

const SHOPPING_PRICE_SOURCE_LABELS = {
  nossoPreco: "Nosso preço",
  worten: "Worten",
  radioPopular: "Rádio Popular",
  manual: "Outro",
};

/* =========================================================
   AUTO TEXT
   ========================================================= */
function AutoText({ texto, className, min, max, style = {} }) {
  const autoFont = useAutoFontSize(texto, min, max);

  return (
    <div
      ref={autoFont.ref}
      className={className}
      style={{
        width: "100%",
        ...style,
        fontSize: `${autoFont.fontSize}px`,
      }}
    >
      {texto}
    </div>
  );
}

function DescricaoAuto({ texto, formatoEtiqueta }) {
  return (
    <AutoText
      texto={texto}
      className="descricao"
      min={formatoEtiqueta === "a5" ? 24 : 12}
      max={formatoEtiqueta === "a5" ? 38 : 18}
    />
  );
}

function PrecoAntesAuto({ valor, formatoEtiqueta }) {
  return (
    <AutoText
      texto={`${formatarEuro(valor)}€`}
      className="antes"
      min={formatoEtiqueta === "a5" ? 44 : 38}
      max={formatoEtiqueta === "a5" ? 54 : 46}
    />
  );
}

function DescontoAuto({ valor, formatoEtiqueta }) {
  return (
    <AutoText
      texto={`-${formatarEuro(valor)}€`}
      className="desconto"
      min={formatoEtiqueta === "a5" ? 48 : 40}
      max={formatoEtiqueta === "a5" ? 60 : 50}
    />
  );
}

function PrecoAtualAuto({ valor, formatoEtiqueta }) {
  return (
    <AutoText
      texto={`${formatarEuro(valor)}€`}
      className="atual"
      min={formatoEtiqueta === "a5" ? 62 : 48}
      max={formatoEtiqueta === "a5" ? 88 : 68}
    />
  );
}



/* =========================================================
   HELPERS
   ========================================================= */
function normalizarCabecalho(texto) {
  return String(texto || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/_/g, " ")
    .trim();
}

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obterValor(normalizado, chaves = [], fallback = "") {
  for (const chave of chaves) {
    if (normalizado[chave] !== undefined && normalizado[chave] !== null) {
      return normalizado[chave];
    }
  }
  return fallback;
}

function formatarValorTabelaMoeda(valor) {
  return Number(valor) > 0 ? `${formatarEuro(valor)}€` : "—";
}
function obterOpcoesPrecoShopping(item) {
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

function obterFontePrecoPredefinida(item, criterio = "max") {
  const opcoes = obterOpcoesPrecoShopping(item);

  if (!opcoes.length) return "nossoPreco";

  const comparador = criterio === "min"
    ? (atual, melhor) => atual.valor < melhor.valor
    : (atual, melhor) => atual.valor > melhor.valor;

  return opcoes.reduce((melhor, atual) => (
    comparador(atual, melhor) ? atual : melhor
  )).key;
}

function obterValorFontePreco(item, fonte, valorManual = "") {
  if (fonte === "manual") {
    return parseNumero(valorManual);
  }

  return parseNumero(item[fonte]);
}

function recalcularSelecaoPrecosShopping(item) {
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

function formatarSelecaoPrecoShopping(item, tipo) {
  const isSemDesconto = tipo === "semDesconto";
  const fonte = isSemDesconto
    ? item.precoSemDescontoFonte
    : item.precoComDescontoFonte;
  const valor = isSemDesconto ? item.antes : item.atual;
  const label = SHOPPING_PRICE_SOURCE_LABELS[fonte] || "—";

  return `${label}: ${formatarValorTabelaMoeda(valor)}`;
}

function renderExcelTableCell(item, columnKey, formatoPrevisto = "") {
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

function formatarDataDiaMes(data) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}


function normalizarCodigoTexto(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function normalizarEan(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number") {
    return String(Math.trunc(valor));
  }
  return String(valor).replace(/\D/g, "");
}

function limparComparador(valor) {
  const texto = normalizarTexto(valor);
  if (!texto || texto === "x" || texto === "-") return 0;
  return parseNumero(valor);
}

function obterMenorPrecoConcorrencia(...valores) {
  const numeros = valores
    .map((valor) => parseNumero(valor))
    .filter((valor) => Number.isFinite(valor) && valor > 0);

  if (!numeros.length) return 0;
  return Math.min(...numeros);
}

function normalizarComparacaoShopping(valor, nossoPreco, menorConcorrente) {
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

function detetarFormatoExcel(rows = []) {
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

function mapearLinhaExcelCampanha(row, index) {
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

function mapearLinhaExcelShopping(row, index) {
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

function mapearLinhaExcel(row, index, formato) {
  return formato === EXCEL_FORMATS.SHOPPING
    ? mapearLinhaExcelShopping(row, index)
    : mapearLinhaExcelCampanha(row, index);
}

function obterFormatoAutomaticoEtiqueta(descricao = "") {
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

function obterTextoValidade(item, anoValidade) {
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

function obterFormatoFinalEtiqueta(
  item,
  formatoAutomaticoAtivo,
  formatoManual,
) {
  if (!formatoAutomaticoAtivo) return formatoManual;
  return obterFormatoAutomaticoEtiqueta(item.descricao);
}


/* =========================================================
   COMPONENTE
   ========================================================= */
export default function EtiquetasExcelPage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [titulo, setTitulo] = useState("PROMO");
  const [anoValidade, setAnoValidade] = useState(new Date().getFullYear());
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nomeFicheiro, setNomeFicheiro] = useState("");
  const [formatoEtiqueta, setFormatoEtiqueta] = useState("a6");
  const [formatoAutomaticoAtivo, setFormatoAutomaticoAtivo] = useState(false);
  const [modeloImportado, setModeloImportado] = useState(EXCEL_FORMATS.CAMPANHA);

  const [popupArtigosInvalidosAberto, setPopupArtigosInvalidosAberto] =
    useState(false);
  const [artigosInvalidosPopup, setArtigosInvalidosPopup] = useState([]);

  const [filtroAberto, setFiltroAberto] = useState(null);
  const [ordenacao, setOrdenacao] = useState({
    coluna: "",
    direcao: "",
  });

  const [filtros, setFiltros] = useState({
    codigo: { contains: "", equals: "" },
    descricao: { contains: "", equals: "" },
    pn: { contains: "", equals: "" },
    estado: { contains: "", equals: "" },
    info: { contains: "", equals: "" },
    comparacao: { contains: "", equals: "" },
    ae: { op: "", valor: "" },
    aea: { op: "", valor: "" },
    aev: { op: "", valor: "" },
    a10: { op: "", valor: "" },
    a1e: { op: "", valor: "" },
    antes: { op: "", valor: "" },
    atual: { op: "", valor: "" },
    nossoPreco: { op: "", valor: "" },
    worten: { op: "", valor: "" },
    radioPopular: { op: "", valor: "" },
    menorConcorrente: { op: "", valor: "" },
  });
  const [mostrarTabelaCompleta, setMostrarTabelaCompleta] = useState(false);
  const filterButtonRefs = useRef({});

  const colunasTabelaAtivas = useMemo(
    () =>
      modeloImportado === EXCEL_FORMATS.SHOPPING
        ? SHOPPING_TABLE_COLUMNS
        : CAMPANHA_TABLE_COLUMNS,
    [modeloImportado],
  );

  const colunasResumoAtivas = useMemo(
    () =>
      modeloImportado === EXCEL_FORMATS.SHOPPING
        ? SHOPPING_PRIMARY_COLUMNS
        : CAMPANHA_PRIMARY_COLUMNS,
    [modeloImportado],
  );

  function atualizarFiltroPopup(campo, chave, valor) {
    setFiltros((prev) => ({
      ...prev,
      [campo]: {
        ...prev[campo],
        [chave]: valor,
      },
    }));
  }

  function limparFiltro(campo, tipo = "text") {
    setFiltros((prev) => ({
      ...prev,
      [campo]:
        tipo === "text" ? { contains: "", equals: "" } : { op: "", valor: "" },
    }));
  }

  const ordenarLista = useCallback(
    (lista) => {
      if (!ordenacao.coluna || !ordenacao.direcao) return lista;

      const copia = [...lista];

      copia.sort((a, b) => {
        const va = a[ordenacao.coluna];
        const vb = b[ordenacao.coluna];

        const aNum = Number(va);
        const bNum = Number(vb);
        const ambosNumeros = !Number.isNaN(aNum) && !Number.isNaN(bNum);

        if (ambosNumeros) {
          return ordenacao.direcao === "asc" ? aNum - bNum : bNum - aNum;
        }

        const aText = String(va || "").toLowerCase();
        const bText = String(vb || "").toLowerCase();

        return ordenacao.direcao === "asc"
          ? aText.localeCompare(bText, "pt")
          : bText.localeCompare(aText, "pt");
      });

      return copia;
    },
    [ordenacao],
  );

  async function carregarExcel(event) {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setNomeFicheiro(file.name);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);

      const nomeSheet =
        workbook.SheetNames.find(
          (name) => normalizarCabecalho(name) === "RELATORIO DIARIO ALTERACOES",
        ) || workbook.SheetNames[0];

      const sheet = workbook.Sheets[nomeSheet];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const formatoExcel = detetarFormatoExcel(rows);

      const linhas = rows
        .map((row, index) => mapearLinhaExcel(row, index, formatoExcel))
        .filter((item) => item.codigo || item.descricao || item.ean);

      if (!linhas.length) {
        throw new Error("Sem linhas válidas");
      }

      setModeloImportado(formatoExcel);
      setMostrarTabelaCompleta(false);
      setOrdenacao({ coluna: "", direcao: "" });
      setFiltroAberto(null);
      setDados(linhas);

      toast.success(
        formatoExcel === EXCEL_FORMATS.SHOPPING
          ? "Excel Shopping importado com sucesso."
          : "Excel de campanha importado com sucesso.",
      );
    } catch (error) {
      console.error("Erro ao ler Excel:", error);
      toast.error("Não foi possível ler o ficheiro Excel.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  const dadosFiltrados = useMemo(() => {
    const filtrados = dados.filter((item) => {
      const codigoOk = aplicarFiltroTexto(item.codigo, filtros.codigo);
      const descricaoOk = aplicarFiltroTexto(item.descricao, filtros.descricao);

      if (modeloImportado === EXCEL_FORMATS.SHOPPING) {
        const comparacaoOk = aplicarFiltroTexto(
          item.comparacao,
          filtros.comparacao,
        );
        const nossoPrecoOk = compararNumero(
          item.nossoPreco,
          filtros.nossoPreco.op,
          filtros.nossoPreco.valor,
        );
        const wortenOk = compararNumero(
          item.worten,
          filtros.worten.op,
          filtros.worten.valor,
        );
        const radioPopularOk = compararNumero(
          item.radioPopular,
          filtros.radioPopular.op,
          filtros.radioPopular.valor,
        );
        const menorConcorrenteOk = compararNumero(
          item.menorConcorrente,
          filtros.menorConcorrente.op,
          filtros.menorConcorrente.valor,
        );

        return (
          codigoOk &&
          descricaoOk &&
          comparacaoOk &&
          nossoPrecoOk &&
          wortenOk &&
          radioPopularOk &&
          menorConcorrenteOk
        );
      }

      const pnOk = aplicarFiltroTexto(item.pn, filtros.pn);
      const estadoOk = aplicarFiltroTexto(item.estado, filtros.estado);
      const infoOk = aplicarFiltroTexto(item.info, filtros.info);

      const aeOk = compararNumero(item.ae, filtros.ae.op, filtros.ae.valor);
      const aeaOk = compararNumero(item.aea, filtros.aea.op, filtros.aea.valor);
      const aevOk = compararNumero(item.aev, filtros.aev.op, filtros.aev.valor);
      const a10Ok = compararNumero(item.a10, filtros.a10.op, filtros.a10.valor);
      const a1eOk = compararNumero(item.a1e, filtros.a1e.op, filtros.a1e.valor);

      return (
        codigoOk &&
        descricaoOk &&
        pnOk &&
        estadoOk &&
        infoOk &&
        aeOk &&
        aeaOk &&
        aevOk &&
        a10Ok &&
        a1eOk
      );
    });

    return ordenarLista(filtrados);
  }, [dados, filtros, modeloImportado, ordenarLista]);

  const selecionados = useMemo(
    () => dados.filter((item) => item.selecionado),
    [dados],
  );

  const selecionadosComFormato = useMemo(() => {
    return selecionados.map((item) => ({
      ...item,
      formato_final: obterFormatoFinalEtiqueta(
        item,
        formatoAutomaticoAtivo,
        formatoEtiqueta,
      ),
    }));
  }, [selecionados, formatoAutomaticoAtivo, formatoEtiqueta]);

  const selecionadosA5 = useMemo(
    () => selecionadosComFormato.filter((item) => item.formato_final === "a5"),
    [selecionadosComFormato],
  );

  const selecionadosA6 = useMemo(
    () => selecionadosComFormato.filter((item) => item.formato_final === "a6"),
    [selecionadosComFormato],
  );

  const paginasA5 = useMemo(
    () => dividirEmPaginas(selecionadosA5, 2),
    [selecionadosA5],
  );

  const paginasA6 = useMemo(
    () => dividirEmPaginas(selecionadosA6, 4),
    [selecionadosA6],
  );

  function alternarSelecionado(id) {
    setDados((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selecionado: !item.selecionado } : item,
      ),
    );
  }

  function atualizarPrecoShopping(id, atualizacoes) {
    setDados((prev) =>
      prev.map((item) => {
        if (item.id !== id || item.tipo_registo !== EXCEL_FORMATS.SHOPPING) {
          return item;
        }

        return recalcularSelecaoPrecosShopping({
          ...item,
          ...atualizacoes,
        });
      }),
    );
  }

  function selecionarTodosFiltrados() {
    const ids = new Set(dadosFiltrados.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        ids.has(item.id) ? { ...item, selecionado: true } : item,
      ),
    );
  }

  function desmarcarTodosFiltrados() {
    const ids = new Set(dadosFiltrados.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        ids.has(item.id) ? { ...item, selecionado: false } : item,
      ),
    );
  }

  function limparSelecao() {
    setDados((prev) => prev.map((item) => ({ ...item, selecionado: false })));
  }

  function removerInvalidosDaSelecao() {
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        idsInvalidos.has(item.id) ? { ...item, selecionado: false } : item,
      ),
    );
  }

  async function guardarCampanhaNoHistorico(origem = "manual") {
    const itensSelecionados = dados.filter((item) => item.selecionado);

    if (!itensSelecionados.length) return false;

    const store = String(profile?.store || "").trim();

    if (!store || !user?.id) {
      console.warn(
        "Sem utilizador autenticado ou loja associada; campanha não foi guardada.",
      );
      return false;
    }

    const nomeCompleto =
      `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

    const snapshot = createCampaignSnapshot({
      titulo,
      dados: itensSelecionados,
      anoValidade,
      formatoEtiqueta,
      origem: `${origem}-${modeloImportado}`,
      createdBy: nomeCompleto || "Utilizador",
      createdByEmail: user?.email || "",
      store,
      userId: user.id,
    });

    try {
      await addCampaignToHistory(snapshot);
      return true;
    } catch (error) {
      console.error("Não foi possível guardar a campanha no histórico.", error);
      toast.error("Não foi possível guardar a campanha no histórico.");
      return false;
    }
  }

  async function copiarCodigosInvalidosEProsseguir() {
    const texto = artigosInvalidosPopup
      .map((item) => String(item.codigo || "").trim())
      .filter(Boolean)
      .join("|");

    try {
      if (texto) {
        await navigator.clipboard.writeText(texto);
      }
    } catch (error) {
      console.error("Não foi possível copiar os códigos.", error);
    }

    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));
    const restantesValidos = selecionados.filter(
      (item) => !idsInvalidos.has(item.id),
    );

    removerInvalidosDaSelecao();
    setPopupArtigosInvalidosAberto(false);

    if (restantesValidos.length === 0) {
      toast.warning("Não existem etiquetas válidas para imprimir.");
      return;
    }

    await guardarCampanhaNoHistorico("impressao");

    await printDocument();
  }

  async function fecharPopupEProsseguir() {
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));
    const restantesValidos = selecionados.filter(
      (item) => !idsInvalidos.has(item.id),
    );

    removerInvalidosDaSelecao();
    setPopupArtigosInvalidosAberto(false);

    if (restantesValidos.length === 0) {
      toast.warning("Não existem etiquetas válidas para imprimir.");
      return;
    }

    await guardarCampanhaNoHistorico("impressao");

    await printDocument();
  }

  async function imprimirSelecionados() {
    if (selecionados.length === 0) {
      toast.warning("Seleciona pelo menos um artigo.");
      return;
    }

    if (modeloImportado === EXCEL_FORMATS.CAMPANHA) {
      const invalidos = selecionados.filter(
        (item) =>
          Number(item.antes) > 0 &&
          Number(item.atual) > 0 &&
          Number(item.antes) <= Number(item.atual),
      );

      if (invalidos.length > 0) {
        setArtigosInvalidosPopup(invalidos);
        setPopupArtigosInvalidosAberto(true);
        return;
      }
    }

    await guardarCampanhaNoHistorico("impressao");
    await printDocument();
  }

  function renderEtiquetaCampanha(item, formatoAtual) {
    const desconto = Math.max(0, item.antes - item.atual);
    const textoValidade = obterTextoValidade(item, anoValidade);

    return (
      <div
        key={item.id}
        className={`label ${formatoAtual === "a5" ? "label-a5" : "label-a6"}`}
      >
        {formatoAtual === "a5" ? (
          <div className="label-a5-rotator">
            <div className="label-inner">
              <div className="topbar">
                <img src={logo} alt="Expert" className="print-logo" />
              </div>

              <div className="content">
                <div className="topo">
                  <div className="codigo">{item.codigo}</div>
                  <div className="titulo">{titulo}</div>
                  <DescricaoAuto
                    texto={item.descricao}
                    formatoEtiqueta={formatoAtual}
                  />
                </div>

                <div className="precos">
                  <div className="linha-preco">
                    <PrecoAntesAuto
                      valor={item.antes}
                      formatoEtiqueta={formatoAtual}
                    />
                  </div>

                  <div className="linha-preco desconto-linha">
                    <DescontoAuto
                      valor={desconto}
                      formatoEtiqueta={formatoAtual}
                    />
                  </div>

                  <div className="linha-preco">
                    <PrecoAtualAuto
                      valor={item.atual}
                      formatoEtiqueta={formatoAtual}
                    />
                  </div>
                </div>

                <div className="rodape">
                  <Barcode value={item.ean} />

                  <div className="validade">{textoValidade}</div>

                  <div className="nota">
                    VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock existente e
                    não acumulável com outras promoções.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="label-inner">
            <div className="topbar">
              <img src={logo} alt="Expert" className="print-logo" />
            </div>

            <div className="content">
              <div className="topo">
                <div className="codigo">{item.codigo}</div>
                <div className="titulo">{titulo}</div>
                <DescricaoAuto
                  texto={item.descricao}
                  formatoEtiqueta={formatoAtual}
                />
              </div>

              <div className="precos">
                <div className="linha-preco">
                  <PrecoAntesAuto
                    valor={item.antes}
                    formatoEtiqueta={formatoAtual}
                  />
                </div>

                <div className="linha-preco desconto-linha">
                  <DescontoAuto
                    valor={desconto}
                    formatoEtiqueta={formatoAtual}
                  />
                </div>

                <div className="linha-preco">
                  <PrecoAtualAuto
                    valor={item.atual}
                    formatoEtiqueta={formatoAtual}
                  />
                </div>
              </div>

              <div className="rodape">
                <Barcode value={item.ean} />

                <div className="validade">{textoValidade}</div>

                <div className="nota">
                  VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock existente e
                  não acumulável com outras promoções.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderEtiqueta(item, formatoAtual) {
    return renderEtiquetaCampanha(item, formatoAtual);
  }

  function renderPrecoShoppingSelector(item, tipo) {
    const isSemDesconto = tipo === "semDesconto";
    const fonteAtual = isSemDesconto
      ? item.precoSemDescontoFonte
      : item.precoComDescontoFonte;
    const valorManual = isSemDesconto
      ? item.precoSemDescontoManual
      : item.precoComDescontoManual;

    return (
      <div className="shopping-price-selector" onClick={(e) => e.stopPropagation()}>
        <select
          value={fonteAtual}
          onChange={(e) =>
            atualizarPrecoShopping(item.id, {
              [isSemDesconto ? "precoSemDescontoFonte" : "precoComDescontoFonte"]:
                e.target.value,
            })
          }
        >
          {SHOPPING_PRICE_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {fonteAtual === "manual" ? (
          <input
            type="text"
            inputMode="decimal"
            value={valorManual}
            placeholder="0,00"
            onChange={(e) =>
              atualizarPrecoShopping(item.id, {
                [isSemDesconto ? "precoSemDescontoManual" : "precoComDescontoManual"]:
                  e.target.value,
              })
            }
          />
        ) : null}

        <small>{formatarValorTabelaMoeda(isSemDesconto ? item.antes : item.atual)}</small>
      </div>
    );
  }

  function renderTableCell(item, col, formatoPrevisto = "") {
    if (
      item.tipo_registo === EXCEL_FORMATS.SHOPPING &&
      col.key === "precoSemDescontoSelecionado"
    ) {
      return renderPrecoShoppingSelector(item, "semDesconto");
    }

    if (
      item.tipo_registo === EXCEL_FORMATS.SHOPPING &&
      col.key === "precoComDescontoSelecionado"
    ) {
      return renderPrecoShoppingSelector(item, "comDesconto");
    }

    return renderExcelTableCell(item, col.key, formatoPrevisto);
  }

  return (
    <>
      <div className="page-content no-print">
        <div className="page-header">
          <div>
            <h1 className="page-title">Etiquetas de Campanha em Excel</h1>
            <p className="page-subtitle">
              Importa ficheiros Excel em formato Campanha ou Shopping, filtra os
              artigos e imprime apenas as etiquetas selecionadas.
            </p>
          </div>
        </div>

        <div className="control-card">
          <div className="toolbar-grid">
            <label className="input-group">
              <span>Título da campanha</span>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: ASUS PROMO / SHOPPING"
              />
            </label>

            <div className="input-group">
              <span>Ano de validade</span>
              <div className="ano-formato-row ano-formato-row-advanced">
                <input
                  type="number"
                  value={anoValidade}
                  onChange={(e) => setAnoValidade(e.target.value)}
                  placeholder="2026"
                />

                <button
                  type="button"
                  className="btn btn-secondary formato-btn"
                  onClick={() =>
                    setFormatoEtiqueta((prev) => (prev === "a6" ? "a5" : "a6"))
                  }
                  disabled={formatoAutomaticoAtivo}
                >
                  Formato manual: {formatoEtiqueta.toUpperCase()}
                </button>

                <button
                  type="button"
                  className={`btn ${
                    formatoAutomaticoAtivo ? "btn-primary" : "btn-secondary"
                  } formato-btn`}
                  onClick={() => setFormatoAutomaticoAtivo((prev) => !prev)}
                >
                  Automático: {formatoAutomaticoAtivo ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>

          <div className="input-group">
            <span>Importar ficheiro Excel</span>
            <input
              type="file"
              accept=".xlsx,.xls,.xlsb,.csv,.ods"
              onChange={carregarExcel}
            />
            {nomeFicheiro ? <small>Ficheiro: {nomeFicheiro}</small> : null}
            {loading ? <small>A carregar Excel...</small> : null}
          </div>

          <div className="resumo-cards">
            <div className="resumo-card">
              <span className="resumo-label">Formato detetado</span>
              <strong>
                {modeloImportado === EXCEL_FORMATS.SHOPPING
                  ? "Shopping"
                  : "Campanha"}
              </strong>
            </div>

            <div className="resumo-card">
              <span className="resumo-label">Total artigos</span>
              <strong>{dados.length}</strong>
            </div>

            <div className="resumo-card">
              <span className="resumo-label">Filtrados</span>
              <strong>{dadosFiltrados.length}</strong>
            </div>

            <div className="resumo-card">
              <span className="resumo-label">Selecionados</span>
              <strong>{selecionados.length}</strong>
            </div>

            <div className="resumo-card">
              <span className="resumo-label">Modo formato</span>
              <strong>
                {formatoAutomaticoAtivo ? "Automático" : "Manual"}
              </strong>
            </div>
          </div>

          <div className="toolbar-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={selecionarTodosFiltrados}
            >
              Selecionar filtrados
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={desmarcarTodosFiltrados}
            >
              Desmarcar filtrados
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={limparSelecao}
            >
              Limpar seleção
            </button>

            <button
              type="button"
              className="btn btn-success"
              onClick={imprimirSelecionados}
            >
              Imprimir selecionados
            </button>
          </div>
        </div>

        <div className="table-card">
          <div className="table-card-header table-card-header-inline">
            <h2>{mostrarTabelaCompleta ? "Tabela completa" : "Lista de artigos"}</h2>

            <button
              type="button"
              className={`btn ${
                mostrarTabelaCompleta ? "btn-secondary" : "btn-primary"
              }`}
              onClick={() => setMostrarTabelaCompleta((prev) => !prev)}
            >
              {mostrarTabelaCompleta
                ? "Ver tabela simples"
                : "Abrir tabela completa"}
            </button>
          </div>

          {mostrarTabelaCompleta ? (
            <SyncedHorizontalScroll className="table-panel table-panel-complete">
              <table className="full-table full-campaign-table">
                <thead>
                  <tr>
                    <th>Selecionar</th>

                    {colunasTabelaAtivas.map((col) => (
                      <th
                        key={col.key}
                        className={col.tipo ? "filter-th" : undefined}
                      >
                        {col.tipo ? (
                          <>
                            <button
                              type="button"
                              ref={(node) => {
                                filterButtonRefs.current[col.key] = node;
                              }}
                              className="filter-button"
                              aria-expanded={filtroAberto === col.key}
                              onClick={() =>
                                setFiltroAberto(
                                  filtroAberto === col.key ? null : col.key,
                                )
                              }
                            >
                              {col.label}
                            </button>

                            <FilterMenu
                              coluna={col.label}
                              tipo={col.tipo}
                              aberto={filtroAberto === col.key}
                              filtro={filtros[col.key]}
                              anchorEl={filterButtonRefs.current[col.key]}
                              onClose={() => setFiltroAberto(null)}
                              onUpdate={(chave, valor) =>
                                atualizarFiltroPopup(col.key, chave, valor)
                              }
                              onSort={(direcao) =>
                                setOrdenacao({ coluna: col.key, direcao })
                              }
                              onClear={() => limparFiltro(col.key, col.tipo)}
                            />
                          </>
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {dadosFiltrados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={colunasTabelaAtivas.length + 1}
                        className="empty-cell"
                      >
                        Importa um ficheiro Excel para carregar os artigos.
                      </td>
                    </tr>
                  ) : (
                    dadosFiltrados.map((item) => {
                      const formatoPrevisto = obterFormatoFinalEtiqueta(
                        item,
                        formatoAutomaticoAtivo,
                        formatoEtiqueta,
                      );

                      return (
                        <tr
                          key={`full-${item.id}`}
                          className={item.selecionado ? "linha-selecionada" : ""}
                          onClick={() => alternarSelecionado(item.id)}
                        >
                          <td
                            className="col-select"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={!!item.selecionado}
                              readOnly
                            />
                          </td>

                          {colunasTabelaAtivas.map((col) => (
                            <td key={`${item.id}-${col.key}`}>
                              {renderTableCell(item, col, formatoPrevisto)}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </SyncedHorizontalScroll>
          ) : null}

          {!mostrarTabelaCompleta ? (
            <div className="table-panel table-panel-summary">
              <table className="compact-table compact-campaign-table compact-campaign-table--summary">
                <thead>
                  <tr>
                    <th>Selecionar</th>

                    {colunasResumoAtivas.map((col) => (
                      <th
                        key={col.key}
                        className={col.tipo ? "filter-th" : undefined}
                      >
                        {col.tipo ? (
                          <>
                            <button
                              type="button"
                              ref={(node) => {
                                filterButtonRefs.current[col.key] = node;
                              }}
                              className="filter-button"
                              aria-expanded={filtroAberto === col.key}
                              onClick={() =>
                                setFiltroAberto(
                                  filtroAberto === col.key ? null : col.key,
                                )
                              }
                            >
                              {col.label}
                            </button>

                            <FilterMenu
                              coluna={col.label}
                              tipo={col.tipo}
                              aberto={filtroAberto === col.key}
                              filtro={filtros[col.key]}
                              anchorEl={filterButtonRefs.current[col.key]}
                              onClose={() => setFiltroAberto(null)}
                              onUpdate={(chave, valor) =>
                                atualizarFiltroPopup(col.key, chave, valor)
                              }
                              onSort={(direcao) =>
                                setOrdenacao({ coluna: col.key, direcao })
                              }
                              onClear={() => limparFiltro(col.key, col.tipo)}
                            />
                          </>
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {dadosFiltrados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={colunasResumoAtivas.length + 1}
                        className="empty-cell"
                      >
                        Importa um ficheiro Excel para carregar os artigos.
                      </td>
                    </tr>
                  ) : (
                    dadosFiltrados.map((item) => (
                      <tr
                        key={item.id}
                        className={item.selecionado ? "linha-selecionada" : ""}
                        onClick={() => alternarSelecionado(item.id)}
                      >
                        <td
                          className="col-select"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={!!item.selecionado}
                            readOnly
                          />
                        </td>

                        {colunasResumoAtivas.map((col) => (
                          <td key={`${item.id}-${col.key}`}>
                            {renderTableCell(item, col)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {popupArtigosInvalidosAberto && (
        <div className="popup-overlay">
          <div className="popup-card">
            <div className="popup-header">
              <h2>Artigos com preço inválido</h2>
            </div>

            <p className="popup-text">
              Os artigos abaixo foram selecionados para impressão, mas têm o
              PVP2 atual maior ou igual ao PVP2 antes.
            </p>

            <div className="popup-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={copiarCodigosInvalidosEProsseguir}
              >
                Copiar código
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={fecharPopupEProsseguir}
              >
                Fechar e prosseguir
              </button>
            </div>

            <div className="popup-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Designação</th>
                    <th>PVP2 Antes</th>
                    <th>PVP2 Atual</th>
                  </tr>
                </thead>

                <tbody>
                  {artigosInvalidosPopup.map((item) => (
                    <tr key={item.id}>
                      <td>{item.codigo}</td>
                      <td>{item.descricao}</td>
                      <td>{formatarEuro(item.antes)}€</td>
                      <td>{formatarEuro(item.atual)}€</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="print-area">
        {paginasA5.map((pagina, pageIndex) => (
          <div key={`a5-${pageIndex}`} className="sheet sheet-a5">
            {pagina.map((item) => renderEtiqueta(item, "a5"))}

            {pagina.length === 1 ? (
              <div className="label label-a5 label-vazia">
                <div className="label-inner"></div>
              </div>
            ) : null}
          </div>
        ))}

        {paginasA6.map((pagina, pageIndex) => (
          <div key={`a6-${pageIndex}`} className="sheet sheet-a6">
            {pagina.map((item) => renderEtiqueta(item, "a6"))}
          </div>
        ))}
      </div>
    </>
  );
}
