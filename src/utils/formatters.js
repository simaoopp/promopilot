export function formatarEuro(valor) {
  const numero = Number(valor || 0);
  const temCentimos = numero % 1 !== 0;

  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: temCentimos ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(numero);
}

export function parseNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let texto = String(valor).trim();
  texto = texto.replace(/\s/g, "");

  if (texto.includes(",") && texto.includes(".")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (texto.includes(",")) {
    texto = texto.replace(",", ".");
  }

  const numero = Number(texto);
  return Number.isNaN(numero) ? 0 : numero;
}
