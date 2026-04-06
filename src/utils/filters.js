export function compararNumero(valorItem, operador, valorFiltro) {
  if (operador === "" || valorFiltro === "") return true;

  const a = Number(valorItem || 0);
  const b = Number(valorFiltro || 0);

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

export function aplicarFiltroTexto(valor, filtro) {
  const texto = String(valor || "").toLowerCase();
  const contains = String(filtro?.contains || "").toLowerCase();
  const equals = String(filtro?.equals || "").toLowerCase();

  if (contains && !texto.includes(contains)) return false;
  if (equals && texto !== equals) return false;

  return true;
}

export function dividirEmPaginas(lista, porPagina = 4) {
  const paginas = [];
  for (let i = 0; i < lista.length; i += porPagina) {
    paginas.push(lista.slice(i, i + porPagina));
  }
  return paginas;
}
