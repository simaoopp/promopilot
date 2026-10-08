import { isPvpUpdatePromotionInfo } from "../../../shared/campaign-label/promotionInfoRules";
import { supabase } from "../../../lib/supabase";
import { parseNumero } from "../../../utils/formatters";

// Keep identifiers as strings: leading zeros and punctuation are significant.
export async function pesquisarCodigosCampanha(texto, { existentes = [], signal } = {}) {
  const entradas = String(texto || "").split(/[\s,;]+/).filter(Boolean);
  const codigos = [...new Set(entradas)];
  const resultado = {
    artigos: [], manutencaoPvp: [], naoEncontrados: [], falhas: [], precosInvalidos: [], codigosCurtos: [],
    duplicados: entradas.length - codigos.length,
  };
  const vistos = new Set(existentes.map((codigo) => String(codigo).trim()));

  // Bound concurrency so a pasted spreadsheet cannot flood the API.
  for (let inicio = 0; inicio < codigos.length; inicio += 5) {
    if (signal?.aborted) break;
    const consultas = await Promise.all(codigos.slice(inicio, inicio + 5).map(async (codigo) => {
      if (vistos.has(codigo)) return { codigo, duplicado: true };
      try {
        // The canonical RPC only accepts identifiers with at least 3 characters.
        if (codigo.length < 3) return { codigo, curto: true };
        let query = supabase.rpc("get_article_for_label", { p_code: codigo });
        if (signal) query = query.abortSignal(signal);
        const { data, error } = await query;
        if (error) return { codigo, falha: true };
        const artigo = (data || []).find((item) =>
          String(item.artigo) === codigo || String(item.codigo_barras) === codigo);
        return { codigo, artigo };
      } catch {
        return { codigo, falha: true };
      }
    }));
    if (signal?.aborted) break;
    for (const { codigo, artigo, falha, duplicado, curto } of consultas) {
      if (duplicado || (artigo && vistos.has(String(artigo.artigo).trim()))) {
        resultado.duplicados += 1;
      } else if (curto) {
        resultado.codigosCurtos.push(codigo);
      } else if (falha) {
        resultado.falhas.push(codigo);
      } else if (!artigo) {
        resultado.naoEncontrados.push(codigo);
      } else {
        vistos.add(String(artigo.artigo).trim());
        if (isPvpUpdatePromotionInfo(artigo)) {
          resultado.manutencaoPvp.push(artigo.artigo);
          continue;
        }
        const antes = parseNumero(artigo.pvp3 || artigo.pvp2);
        const atual = parseNumero(artigo.pvp2);
        if (!Number.isFinite(antes) || !Number.isFinite(atual) || antes <= 0 || atual <= 0 || atual > antes) {
          resultado.precosInvalidos.push(artigo.artigo);
        } else {
          resultado.artigos.push({ ...artigo, codigoBarras: artigo.codigo_barras || "" });
        }
      }
    }
  }
  return resultado;
}
