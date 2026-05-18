import { campanhaSemDataDefinida } from "./campaignTitleRules.js";

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

  const dataInicio = normalizarData(item?.dataInicio);
  const dataFim = normalizarData(item?.dataFim);

  if (!dataInicio && !dataFim) {
    const hoje = new Date();
    const fim = somarDias(hoje, 30);

    return `VÁLIDO DE ${formatarDataDiaMes(hoje)}/${hoje.getFullYear()} A ${formatarDataDiaMes(fim)}/${fim.getFullYear()}`;
  }

  return `VÁLIDO DE ${dataInicio || "-"}${dataInicio ? `/${anoValidadeAtual}` : ""} A ${dataFim || "-"}${dataFim ? `/${anoValidadeAtual}` : ""}`;
}
