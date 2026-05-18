import {
  campanhaSemDataDefinida,
} from "../../../utils/campaignTitleRules";
import { formatarEuro, parseNumero } from "../../../utils/formatters";
import {
  buildManualCampaignPrintPages,
  normalizarTexto as normalizarTextoPartilhado,
  obterFormatoAutomaticoEtiqueta as obterFormatoAutomaticoEtiquetaPartilhado,
  obterFormatoEtiquetaItem as obterFormatoEtiquetaItemPartilhado,
} from "../../../shared/campaign-label";

export const CAMPANHA_TITULO_DEFAULT = "PROMO";

export const FILTROS_INICIAIS = {
  codigo: { contains: "", equals: "" },
  descricao: { contains: "", equals: "" },
  pn: { contains: "", equals: "" },
  estado: { contains: "", equals: "" },
  info: { contains: "", equals: "" },
  ae: { op: "", valor: "" },
  aea: { op: "", valor: "" },
  aev: { op: "", valor: "" },
  a10: { op: "", valor: "" },
  a1e: { op: "", valor: "" },
};

export function renderCampaignTableCell(item, columnKey) {
  switch (columnKey) {
    case "antes":
    case "atual":
      return `${formatarEuro(item[columnKey])}€`;
    default:
      return item[columnKey] ?? "";
  }
}

export function normalizarTexto(texto) {
  return normalizarTextoPartilhado(texto);
}


export function converterPreco(valor) {
  return parseNumero(valor);
}

export function formatarDataInputParaDiaMes(dataIso = "") {
  if (!dataIso) return "";

  const [ano, mes, dia] = String(dataIso).split("-");
  if (!ano || !mes || !dia) return "";

  return `${dia}/${mes}`;
}

export function somarDias(data, dias) {
  const novaData = new Date(data);
  novaData.setDate(novaData.getDate() + dias);
  return novaData;
}

export function formatarDataDiaMes(data) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

export function obterTextoValidade(item, anoValidadeAtual, tituloCampanha) {
  if (campanhaSemDataDefinida(tituloCampanha)) return "";

  const normalizarData = (valor) => {
    const texto = String(valor || "").trim();
    return texto && texto !== "-" ? texto : "";
  };

  const dataInicio = normalizarData(item.dataInicio);
  const dataFim = normalizarData(item.dataFim);

  if (!dataInicio && !dataFim) {
    const hoje = new Date();
    const fim = somarDias(hoje, 30);

    return `VÁLIDO DE ${formatarDataDiaMes(
      hoje,
    )}/${hoje.getFullYear()} A ${formatarDataDiaMes(fim)}/${fim.getFullYear()}`;
  }

  return `VÁLIDO DE ${dataInicio || "-"}${
    dataInicio ? `/${anoValidadeAtual}` : ""
  } A ${dataFim || "-"}${dataFim ? `/${anoValidadeAtual}` : ""}`;
}

export function obterFormatoAutomaticoEtiqueta(descricao = "") {
  return obterFormatoAutomaticoEtiquetaPartilhado(descricao);
}


export function obterFormatoEtiquetaItem(item, modoAutomatico, formatoManual) {
  return obterFormatoEtiquetaItemPartilhado(item, modoAutomatico, formatoManual);
}


export function construirPaginasImpressao(itens, modoAutomatico, formatoManual) {
  return buildManualCampaignPrintPages(itens, modoAutomatico, formatoManual);
}


export function dataCampanhaInvalida(data) {
  const texto = String(data || "").trim();
  if (!texto || texto === "-") return false;

  const formatoMesTexto = /^\d{1,2}\/[a-z]{3}\.?$/i;
  const formatoMesNumero = /^\d{1,2}\/\d{2}$/;

  return !formatoMesTexto.test(texto) && !formatoMesNumero.test(texto);
}

export function itemTabelaInvalido(item) {
  const nomeInvalido = !item.descricao || item.descricao.length < 3;
  const precoAntesInvalido = !item.antes || parseNumero(item.antes) <= 0;
  const precoAtualInvalido = !item.atual || parseNumero(item.atual) <= 0;
  const eanInvalido =
    !item.ean || String(item.ean).replace(/\D/g, "").length < 8;

  return (
    nomeInvalido ||
    precoAntesInvalido ||
    precoAtualInvalido ||
    eanInvalido ||
    dataCampanhaInvalida(item.dataInicio) ||
    dataCampanhaInvalida(item.dataFim)
  );
}

export function ordenarLista(lista, ordenacao) {
  if (!ordenacao.coluna || !ordenacao.direcao) return lista;

  const copia = [...lista];

  copia.sort((a, b) => {
    const valorA = a[ordenacao.coluna];
    const valorB = b[ordenacao.coluna];

    const aNum = parseNumero(valorA);
    const bNum = parseNumero(valorB);
    const ambosNumeros = !Number.isNaN(aNum) && !Number.isNaN(bNum);

    if (ambosNumeros) {
      return ordenacao.direcao === "asc" ? aNum - bNum : bNum - aNum;
    }

    const aText = String(valorA || "").toLowerCase();
    const bText = String(valorB || "").toLowerCase();

    return ordenacao.direcao === "asc"
      ? aText.localeCompare(bText, "pt")
      : bText.localeCompare(aText, "pt");
  });

  return copia;
}
