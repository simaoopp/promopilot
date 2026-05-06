export function formatarDataInputParaDiaMes(dataIso = "") {
  if (!dataIso) return "";

  const [ano, mes, dia] = String(dataIso).split("-");
  if (!ano || !mes || !dia) return "";

  return `${dia}/${mes}`;
}

export function normalizarTextoDataCampanha(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const dia = String(valor.getDate()).padStart(2, "0");
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    return `${dia}/${mes}`;
  }

  const texto = String(valor || "").trim();
  return texto && texto !== "-" ? texto : "";
}

export function formatarDataCampanhaParaTabela(valor) {
  const texto = normalizarTextoDataCampanha(valor);
  if (!texto) return "—";

  const isoMatch = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}`;
  }

  const partes = texto.split(/[/-]/).map((parte) => parte.trim());
  if (partes.length >= 2 && /^\d{1,2}$/.test(partes[0]) && /^\d{1,2}$/.test(partes[1])) {
    return `${partes[0].padStart(2, "0")}/${partes[1].padStart(2, "0")}`;
  }

  return texto;
}

export function obterDataInputCampanha(valor, anoFallback = new Date().getFullYear()) {
  const texto = normalizarTextoDataCampanha(valor);
  if (!texto) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  const partes = texto.split(/[/-]/).map((parte) => parte.trim());
  if (partes.length < 2) return "";

  const [dia, mes, anoRecebido] = partes;
  const diaNormalizado = String(dia || "").padStart(2, "0");
  const mesNormalizado = String(mes || "").padStart(2, "0");
  const anoNormalizado = String(anoRecebido || anoFallback || new Date().getFullYear());

  if (!/^\d{2}$/.test(diaNormalizado) || !/^\d{2}$/.test(mesNormalizado)) {
    return "";
  }

  return `${anoNormalizado}-${mesNormalizado}-${diaNormalizado}`;
}
