export function normalizarValorPvp(valor) {
  if (valor === null || valor === undefined || valor === "") return "-";
  return String(valor).trim() || "-";
}

export function formatarPvpTriplo(artigo = {}) {
  return [
    `PVP1: ${normalizarValorPvp(artigo.pvp1)}`,
    `PVP2: ${normalizarValorPvp(artigo.pvp2)}`,
    `PVP3: ${normalizarValorPvp(artigo.pvp3)}`,
  ].join(" · ");
}
