export function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function hasUsefulTechData(item) {
  if (!item?.caracteristicas_tecnicas || typeof item.caracteristicas_tecnicas !== "object") {
    return false;
  }

  const blacklist = new Set(["estado", "info", "alterado"]);
  const entries = Object.entries(item.caracteristicas_tecnicas)
    .filter(([key, value]) => String(key || "").trim() && String(value || "").trim())
    .filter(([key]) => !blacklist.has(normalizarTexto(key)));

  const hasResumo = !!String(item?.resumo_vendedor || "").trim();
  const hasFontes = Array.isArray(item?.documentos_oficiais)
    ? item.documentos_oficiais.some(Boolean)
    : !!String(item?.fonte_oficial || "").trim();

  return entries.length >= 2 || hasResumo || hasFontes;
}

export function cleanGroundingInlineNoise(texto = "") {
  return String(texto || "")
    .replace(/\[cite:[^\]]*\]/gi, "")
    .replace(/\[[^\]]*cite[^\]]*\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function parseGroundingText(texto = "") {
  const textoBase = cleanGroundingInlineNoise(texto);
  if (!textoBase) return [];

  const normalized = textoBase
    .replace(/\s*(Título confirmado:)/gi, "\n$1")
    .replace(/\s*(Descrição confirmada:)/gi, "\n$1")
    .replace(/\s*(Marca:)/gi, "\n$1")
    .replace(/\s*(Modelo:)/gi, "\n$1")
    .replace(/\s*(Série:)/gi, "\n$1")
    .replace(/\s*(Categoria:)/gi, "\n$1")
    .replace(/\s*(Características técnicas encontradas:)/gi, "\n$1")
    .replace(/\s*(Resumo para vendedor:)/gi, "\n$1")
    .replace(/\s*(Observações relevantes:)/gi, "\n$1")
    .replace(/\s*(Observações:)/gi, "\n$1")
    .replace(/\s*-\s+/g, "\n• ")
    .replace(/\s*\*\s+/g, "\n• ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections = [];
  let current = null;

  function pushCurrent() {
    if (!current) return;
    if (current.type === "list") {
      current.items = current.items.filter(Boolean);
      if (!current.items.length) return;
    }
    if (current.type === "text") {
      current.content = String(current.content || "").trim();
      if (!current.content) return;
    }
    sections.push(current);
  }

  function startTextSection(title, content = "") {
    pushCurrent();
    current = { title, type: "text", content: cleanGroundingInlineNoise(content) };
  }

  function startListSection(title) {
    pushCurrent();
    current = { title, type: "list", items: [] };
  }

  for (const line of lines) {
    if (/^Título confirmado:/i.test(line)) { startTextSection("Título confirmado", line.replace(/^Título confirmado:/i, "")); continue; }
    if (/^Descrição confirmada:/i.test(line)) { startTextSection("Descrição confirmada", line.replace(/^Descrição confirmada:/i, "")); continue; }
    if (/^Marca:/i.test(line)) { startTextSection("Marca", line.replace(/^Marca:/i, "")); continue; }
    if (/^Modelo:/i.test(line)) { startTextSection("Modelo", line.replace(/^Modelo:/i, "")); continue; }
    if (/^Série:/i.test(line)) { startTextSection("Série", line.replace(/^Série:/i, "")); continue; }
    if (/^Categoria:/i.test(line)) { startTextSection("Categoria", line.replace(/^Categoria:/i, "")); continue; }
    if (/^Características técnicas encontradas:/i.test(line)) {
      startListSection("Características técnicas");
      const resto = line.replace(/^Características técnicas encontradas:/i, "").trim();
      if (resto) current.items.push(cleanGroundingInlineNoise(resto.replace(/^•\s*/, "")));
      continue;
    }
    if (/^Resumo para vendedor:/i.test(line)) { startTextSection("Resumo para vendedor", line.replace(/^Resumo para vendedor:/i, "")); continue; }
    if (/^Observações relevantes:/i.test(line) || /^Observações:/i.test(line)) {
      startTextSection("Observações", line.replace(/^Observações relevantes:/i, "").replace(/^Observações:/i, ""));
      continue;
    }
    if (!current) { startTextSection("Informação encontrada", line); continue; }
    if (current.type === "list") current.items.push(cleanGroundingInlineNoise(line.replace(/^•\s*/, "")));
    else current.content = `${current.content} ${cleanGroundingInlineNoise(line)}`.trim();
  }

  pushCurrent();
  return sections;
}

export function mapArtigoToAiResultado(item) {
  const fontes = Array.isArray(item?.documentos_oficiais)
    ? item.documentos_oficiais.filter(Boolean)
    : item?.fonte_oficial ? [item.fonte_oficial] : [];
  const caracteristicas = item?.caracteristicas_tecnicas || {};
  const temEstrutura = Object.keys(caracteristicas).length > 0 || !!String(item?.resumo_vendedor || "").trim() || !!String(item?.observacoes_ia || "").trim();
  return {
    titulo: item?.titulo_oficial || item?.descricao_oficial || item?.descricao || item?.artigo || "",
    categoria: item?.categoria || "",
    marca: item?.marca || "",
    modelo: item?.modelo || "",
    caracteristicas_tecnicas: caracteristicas,
    resumo_vendedor: item?.resumo_vendedor || "",
    observacoes: item?.observacoes_ia || "",
    fontes,
    texto_grounding: item?.texto_grounding || "",
    modo_resposta: temEstrutura ? "estruturado" : item?.texto_grounding ? "texto" : "estruturado",
  };
}

export function normalizeAiResultado(resultado = {}, artigoFallback = null) {
  const fallback = artigoFallback ? mapArtigoToAiResultado(artigoFallback) : {};
  const caracteristicas = resultado?.caracteristicas_tecnicas || fallback?.caracteristicas_tecnicas || {};
  const fontes = Array.isArray(resultado?.fontes) && resultado.fontes.length > 0 ? resultado.fontes : fallback?.fontes || [];
  const temEstrutura = Object.keys(caracteristicas).length > 0 || !!String(resultado?.resumo_vendedor || fallback?.resumo_vendedor || "").trim() || !!String(resultado?.observacoes || fallback?.observacoes || "").trim();
  return {
    ...fallback,
    ...resultado,
    titulo: resultado?.titulo || fallback?.titulo || "",
    categoria: resultado?.categoria || fallback?.categoria || "",
    marca: resultado?.marca || fallback?.marca || "",
    modelo: resultado?.modelo || fallback?.modelo || "",
    caracteristicas_tecnicas: caracteristicas,
    resumo_vendedor: resultado?.resumo_vendedor || fallback?.resumo_vendedor || "",
    observacoes: resultado?.observacoes || fallback?.observacoes || "",
    fontes,
    texto_grounding: resultado?.texto_grounding || fallback?.texto_grounding || "",
    modo_resposta: temEstrutura ? "estruturado" : resultado?.texto_grounding || fallback?.texto_grounding ? "texto" : "estruturado",
  };
}

export function formatarDataHistorico(iso) {
  try { return new Date(iso).toLocaleString("pt-PT"); } catch { return iso || "-"; }
}

export function formatarAutorCampanha(campanha) {
  return String(campanha?.createdBy || "").trim() || String(campanha?.createdByEmail || "").trim() || "Utilizador";
}
