import { preservarOrigemCampanha, isPvpUpdatePromotionInfo } from "../../../shared/campaign-label/promotionInfoRules";
import { validarItensCampanha, resumirRevisaoCampanha } from "../../../shared/campaign-label/campaignValidation";
import { supabase } from "../../../lib/supabase";

export async function pesquisarCodigosCampanha(texto, { existentes = [], signal } = {}) {
  const entradas = String(texto || "").split(/[\s,;]+/).filter(Boolean);
  const codigos = [...new Set(entradas)];
  const existentesSet = new Set(existentes.map((codigo) => String(codigo).trim()));
  const consultas = [];
  for (let inicio = 0; inicio < codigos.length; inicio += 5) {
    if (signal?.aborted) throw Object.assign(new Error("Pesquisa cancelada."), { name: "AbortError" });
    consultas.push(...await Promise.all(codigos.slice(inicio, inicio + 5).map(async (codigo) => {
      if (existentesSet.has(codigo)) return { codigo, estado: "duplicado", motivo: "Artigo já presente na campanha." };
      if (codigo.length < 3) return { codigo, estado: "erro", motivo: "O catálogo exige pelo menos 3 caracteres por código." };
      try {
        let query = supabase.rpc("get_article_for_label", { p_code: codigo });
        if (signal) query = query.abortSignal(signal);
        const { data, error } = await query;
        if (error) throw error;
        const artigo = (data || []).find((item) => String(item.artigo) === codigo || String(item.codigo_barras) === codigo);
        if (!artigo) return { codigo, estado: "naoEncontrado", motivo: "Nenhum artigo corresponde exatamente a este código ou EAN." };
        return { codigo, item: preservarOrigemCampanha({ ...artigo, codigoBarras: artigo.codigo_barras || "" }, { tipo: "catalogo", codigoConsultado: codigo }) };
      } catch {
        return { codigo, estado: "erro", motivo: "Falha na consulta. Tenta pesquisar novamente; o código não foi classificado como inexistente." };
      }
    })));
  }
  if (signal?.aborted) throw Object.assign(new Error("Pesquisa cancelada."), { name: "AbortError" });
  const encontrados = consultas.filter((linha) => linha.item);
  const validacao = validarItensCampanha(encontrados.map((linha) => linha.item), { existentes });
  const porCodigo = new Map(consultas.map((linha) => [linha.codigo, linha]));
  encontrados.forEach((linha, index) => porCodigo.set(linha.codigo, { ...validacao.linhas[index], codigo: linha.codigo }));
  const vistos = new Set();
  const revisao = resumirRevisaoCampanha(entradas.map((codigo) => {
    if (vistos.has(codigo)) return { codigo, estado: "duplicado", motivo: "Código repetido na lista colada." };
    vistos.add(codigo);
    return porCodigo.get(codigo);
  }));
  return {
    revisao,
    artigos: revisao.validos,
    duplicados: revisao.totais.duplicado,
    naoEncontrados: revisao.linhas.filter((linha) => linha.estado === "naoEncontrado").map((linha) => linha.codigo),
    falhas: revisao.linhas.filter((linha) => linha.estado === "erro" && linha.codigo.length >= 3).map((linha) => linha.codigo),
    codigosCurtos: revisao.linhas.filter((linha) => linha.estado === "erro" && linha.codigo.length < 3).map((linha) => linha.codigo),
    manutencaoPvp: revisao.linhas.filter((linha) => linha.estado === "bloqueado" && isPvpUpdatePromotionInfo(linha.item)).map((linha) => linha.codigo),
    precosInvalidos: revisao.linhas.filter((linha) => linha.estado === "bloqueado" && !isPvpUpdatePromotionInfo(linha.item)).map((linha) => linha.codigo),
  };
}
