export function parseNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return Number.isNaN(valor) ? 0 : valor;

  let texto = String(valor).trim();

  if (!texto) return 0;

  texto = texto
    .replace(/\u00A0/g, "") // espaço não separável
    .replace(/\s/g, "")
    .replace(/€/g, "");

  if (texto.includes(",") && texto.includes(".")) {
    const ultimaVirgula = texto.lastIndexOf(",");
    const ultimoPonto = texto.lastIndexOf(".");

    if (ultimaVirgula > ultimoPonto) {
      texto = texto.replace(/\./g, "").replace(",", ".");
    } else {
      texto = texto.replace(/,/g, "");
    }
  } else if (texto.includes(",")) {
    texto = texto.replace(",", ".");
  }

  const numero = Number(texto);
  return Number.isNaN(numero) ? 0 : numero;
}

export function formatarEuro(valor) {
  const numero = parseNumero(valor);
  const temCentimos = numero % 1 !== 0;

  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: temCentimos ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(numero);
}