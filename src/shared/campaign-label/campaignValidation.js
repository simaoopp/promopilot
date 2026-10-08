import { parseNumero } from "./formatters.js";
import { isPvpUpdatePromotionInfo } from "./promotionInfoRules.js";

export function resumirRevisaoCampanha(linhas = []) {
  return {
    linhas,
    validos: linhas.filter((linha) => linha.estado === "valido").map((linha) => linha.item),
    totais: linhas.reduce((total, linha) => {
      total[linha.estado] = (total[linha.estado] || 0) + 1;
      return total;
    }, { valido: 0, bloqueado: 0, duplicado: 0, naoEncontrado: 0, erro: 0 }),
  };
}

export function validarItensCampanha(items = [], {
  existentes = [], permitirComparacaoPvp3 = false, validarPrecos = true,
} = {}) {
  const vistos = new Set(existentes.map((item) => String(item?.codigo ?? item?.artigo ?? item).trim()));
  const codigoItem = (item) => String(item.codigo ?? item.artigo ?? "").trim();
  // Conflicting duplicates must not hide a maintenance marker on another row.
  const manutencao = new Set(items.filter(isPvpUpdatePromotionInfo).map(codigoItem).filter(Boolean));
  return resumirRevisaoCampanha(items.map((item) => {
    const codigo = codigoItem(item);
    const base = { item, codigo };
    if (isPvpUpdatePromotionInfo(item) || manutencao.has(codigo)) {
      return { ...base, estado: "bloqueado", motivo: "Atualização/Reposição de PVP na origem. Não pode ser promoção, mesmo com desconto face ao PVP3." };
    }
    if (!codigo) return { ...base, estado: "bloqueado", motivo: "Código do artigo em falta." };
    if (vistos.has(codigo)) return { ...base, estado: "duplicado", motivo: "Artigo repetido ou já presente na campanha." };
    const antes = parseNumero(item.antes ?? (item.pvp3 || item.pvp2));
    const atual = parseNumero(item.atual ?? item.pvp2);
    const pv3 = parseNumero(item.pv3 ?? item.pvp3);
    let motivo = "Pronto para adicionar.";
    if (!String(item.descricao || "").trim()) {
      return { ...base, estado: "bloqueado", motivo: "Descrição do artigo em falta." };
    }
    if (validarPrecos && (antes <= 0 || atual <= 0)) {
      return { ...base, estado: "bloqueado", motivo: "Os preços antes e atual devem ser superiores a zero." };
    }
    if (validarPrecos && atual >= antes) {
      if (permitirComparacaoPvp3 && atual < pv3) {
        motivo = "Requer confirmação da comparação com PVP3 antes de imprimir.";
      } else {
        return { ...base, estado: "bloqueado", motivo: "Sem desconto: o preço atual deve ser inferior ao preço antes." };
      }
    }
    vistos.add(codigo);
    return { ...base, estado: "valido", motivo };
  }));
}
