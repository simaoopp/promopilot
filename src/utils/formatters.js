export function parseNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return Number.isNaN(valor) ? 0 : valor;

  let texto = String(valor).trim();

  if (!texto) return 0;

  texto = texto.replace(/(\d)[\s\u00A0]+(\d{1,2})\s*$/, "$1,$2");

  texto = texto
    .replace(/\u00A0/g, "")
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/[^0-9,.-]/g, "");

  const negativo = texto.startsWith("-");
  texto = texto.replace(/-/g, "");

  const ultimaVirgula = texto.lastIndexOf(",");
  const ultimoPonto = texto.lastIndexOf(".");
  const ultimaPontuacao = Math.max(ultimaVirgula, ultimoPonto);

  if (ultimaPontuacao !== -1) {
    const parteInteira = texto.slice(0, ultimaPontuacao).replace(/[.,]/g, "");
    const parteDecimal = texto.slice(ultimaPontuacao + 1).replace(/[.,]/g, "");

    if (!parteDecimal) {
      texto = parteInteira;
    } else if (parteDecimal.length <= 2) {
      texto = `${parteInteira || "0"}.${parteDecimal}`;
    } else {
      texto = texto.replace(/[.,]/g, "");
    }
  }

  if (negativo) {
    texto = `-${texto}`;
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
