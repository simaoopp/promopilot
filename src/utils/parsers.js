import { parseNumero } from "./formatters";

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function dividirLinha(linha) {
  let partes = String(linha || "")
    .replace(/\u00A0/g, " ")
    .split("\t")
    .map((p) => p.trim());

  if (partes.length < 10) {
    partes = String(linha || "")
      .replace(/\u00A0/g, " ")
      .split(/\s{2,}/)
      .map((p) => p.trim());
  }

  return partes;
}

export function parseTabelaColada(texto) {
  const linhas = String(texto || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (linhas.length === 0) return [];

  const primeiraLinha = normalizarTexto(linhas[0]);
  const temCabecalho =
    primeiraLinha.includes("CODIGO") ||
    primeiraLinha.includes("DESCRICAO");

  const linhasDados = temCabecalho ? linhas.slice(1) : linhas;
  const resultado = [];

  for (let i = 0; i < linhasDados.length; i += 1) {
    const linha = linhasDados[i];
    const partes = dividirLinha(linha);

    if (partes.length < 4) continue;

    resultado.push({
      id: `row-${i}-${partes[0] || "sem-codigo"}`,
      codigo: partes[0] || "",
      descricao: partes[1] || "",
      pn: partes[2] || "",
      ean: partes[3] || "",
      antes: parseNumero(partes[4] || 0),
      atual: parseNumero(partes[5] || 0),
      pv3: partes[6] || "",
      estado: partes[7] || "",
      ae: parseNumero(partes[8] || 0),
      aea: parseNumero(partes[9] || 0),
      aev: parseNumero(partes[10] || 0),
      a10: parseNumero(partes[11] || 0),
      a1e: parseNumero(partes[12] || 0),
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