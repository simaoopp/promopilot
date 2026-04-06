import { parseNumero } from "./formatters";

export function parseTabelaColada(texto) {
  const linhas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (linhas.length === 0) return [];

  const primeiraLinha = linhas[0].toUpperCase();
  const temCabecalho =
    primeiraLinha.includes("CODIGO") || primeiraLinha.includes("DESCRICAO");

  const linhasDados = temCabecalho ? linhas.slice(1) : linhas;
  const resultado = [];

  for (let i = 0; i < linhasDados.length; i += 1) {
    const linha = linhasDados[i];

    let partes = linha.split("\t").map((p) => p.trim());

    if (partes.length < 10) {
      partes = linha.split(/\s{2,}/).map((p) => p.trim());
    }

    if (partes.length < 4) continue;

    resultado.push({
      id: `row-${i}`,
      codigo: partes[0] || "",
      descricao: partes[1] || "",
      pn: partes[2] || "",
      ean: partes[3] || "",
      antes: parseNumero(partes[4] || 0),
      atual: parseNumero(partes[5] || 0),
      pv3: partes[6] || "",
      estado: partes[7] || "",
      ae: partes[8] || "",
      aea: partes[9] || "",
      aev: partes[10] || "",
      a10: partes[11] || "",
      a1e: partes[12] || "",
      data: partes[13] || "",
      dataInicio: partes[14] || "",
      dataFim: partes[15] || "",
      alterado: partes[16] || "",
      info: partes[17] || "",
      selecionado: false,
    });
  }

  return resultado;
}