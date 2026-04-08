import { parseNumero } from "./formatters";

function normalizarTexto(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function compararNumero(valorItem, operador, valorFiltro) {
  if (operador === "" || valorFiltro === "") return true;

  const a = parseNumero(valorItem);
  const b = parseNumero(valorFiltro);

  if (Number.isNaN(a) || Number.isNaN(b)) return false;

  switch (operador) {
    case "=":
      return a === b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    default:
      return true;
  }
}

export function aplicarFiltroTexto(valor, filtro = {}) {
  const texto = normalizarTexto(valor);
  const contains = normalizarTexto(filtro.contains);
  const equals = normalizarTexto(filtro.equals);

  if (contains && !texto.includes(contains)) return false;
  if (equals && texto !== equals) return false;

  return true;
}

export function dividirEmPaginas(lista, porPagina = 4) {
  const tamanhoPagina = Number(porPagina);

  if (!Array.isArray(lista) || tamanhoPagina <= 0) return [];

  const paginas = [];

  for (let i = 0; i < lista.length; i += tamanhoPagina) {
    paginas.push(lista.slice(i, i + tamanhoPagina));
  }

  return paginas;
}