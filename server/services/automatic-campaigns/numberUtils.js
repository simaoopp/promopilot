export function parseNumero(valor) {
  if (valor === null || valor === undefined) return 0;

  let texto = String(valor).trim();

  if (!texto) return 0;

  texto = texto.replace(/(\d)[\s\u00A0]+(\d{1,2})\s*$/, "$1,$2");

  texto = texto
    .replace(/\u00A0/g, "")
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/[^0-9,.-]/g, "");

  if (!texto) return 0;

  const temVirgula = texto.includes(",");
  const temPonto = texto.includes(".");

  let separadorDecimal = null;

  if (temVirgula && temPonto) {
    separadorDecimal =
      texto.lastIndexOf(",") > texto.lastIndexOf(".") ? "," : ".";
  } else if (temVirgula) {
    separadorDecimal = ",";
  } else if (temPonto) {
    separadorDecimal = ".";
  }

  if (separadorDecimal) {
    const partes = texto.split(separadorDecimal);
    const parteDecimal = partes.pop();
    const parteInteira = partes.join("").replace(/[.,]/g, "");

    let decimal = parteDecimal || "";

    if (decimal.length > 2 && /^\d{1,2}0+$/.test(decimal)) {
      decimal = decimal.slice(0, 2);
    }

    const numero = Number(`${parteInteira}.${decimal}`);

    return Number.isFinite(numero) ? numero : 0;
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

export function formatarEuro(valor) {
  const numero = parseNumero(valor);
  const temCentimos = numero % 1 !== 0;

  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: temCentimos ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(numero);
}

export function parseInteiro(valor) {
  const numero = Number.parseInt(String(valor ?? "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(numero) ? numero : 0;
}
