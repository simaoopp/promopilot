import { getPermissionSnapshot } from "../../../services/platformService";
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
        let query = supabase.rpc("get_article_for_label", { p_code: codigo, p_organization_id: getPermissionSnapshot()?.organizationId || null });
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

// Edits campaign prices only; catalog prices and original maintenance markers stay intact.
export function alterarPrecoListaCampanha(resultado, index, campo, valor, existentes = []) {
  const linha = resultado?.revisao?.linhas[index];
  const editavel = linha?.precoEditavel || (linha?.estado === "valido" && linha.item?.precosEditados);
  if (!editavel || !["antes", "atual"].includes(campo) || isPvpUpdatePromotionInfo(linha.item)) return resultado;
  const linhas = resultado.revisao.linhas.map((row, i) => i === index ? {
    ...row, item: { ...row.item, [campo]: valor, precosEditados: true },
  } : row);
  const revalidadas = validarItensCampanha(linhas.filter((row) => row.item).map((row) => row.item), { existentes });
  let posicao = 0;
  const revisao = resumirRevisaoCampanha(linhas.map((row) => row.item
    ? { ...revalidadas.linhas[posicao++], codigo: row.codigo }
    : row));
  return { ...resultado, revisao, artigos: revisao.validos,
    duplicados: revisao.totais.duplicado,
    precosInvalidos: revisao.linhas.filter((row) => row.precoEditavel).map((row) => row.codigo),
  };
}
