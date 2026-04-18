import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  enrichArtigoWithAi,
  loadAllArtigos,
  mergeArtigoData,
  mergeArtigosIntoList,
  syncUpdatedArtigoToCache,
} from "../services/artigosService";
import {
  loadCampaignHistory,
  removeCampaignFromHistory,
} from "../utils/campaignHistory";
import "../styles/styles.css";

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasUsefulTechData(item) {
  if (
    !item?.caracteristicas_tecnicas ||
    typeof item.caracteristicas_tecnicas !== "object"
  ) {
    return false;
  }

  const blacklist = new Set(["estado", "info", "alterado"]);

  const entries = Object.entries(item.caracteristicas_tecnicas)
    .filter(
      ([key, value]) => String(key || "").trim() && String(value || "").trim(),
    )
    .filter(([key]) => !blacklist.has(normalizarTexto(key)));

  const hasResumo = !!String(item?.resumo_vendedor || "").trim();
  const hasFontes = Array.isArray(item?.documentos_oficiais)
    ? item.documentos_oficiais.some(Boolean)
    : !!String(item?.fonte_oficial || "").trim();

  return entries.length >= 2 || hasResumo || hasFontes;
}

function cleanGroundingInlineNoise(texto = "") {
  return String(texto || "")
    .replace(/\[cite:[^\]]*\]/gi, "")
    .replace(/\[[^\]]*cite[^\]]*\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseGroundingText(texto = "") {
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

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

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
    current = {
      title,
      type: "text",
      content: cleanGroundingInlineNoise(content),
    };
  }

  function startListSection(title) {
    pushCurrent();
    current = {
      title,
      type: "list",
      items: [],
    };
  }

  for (const line of lines) {
    if (/^Título confirmado:/i.test(line)) {
      startTextSection(
        "Título confirmado",
        line.replace(/^Título confirmado:/i, ""),
      );
      continue;
    }

    if (/^Descrição confirmada:/i.test(line)) {
      startTextSection(
        "Descrição confirmada",
        line.replace(/^Descrição confirmada:/i, ""),
      );
      continue;
    }

    if (/^Marca:/i.test(line)) {
      startTextSection("Marca", line.replace(/^Marca:/i, ""));
      continue;
    }

    if (/^Modelo:/i.test(line)) {
      startTextSection("Modelo", line.replace(/^Modelo:/i, ""));
      continue;
    }

    if (/^Série:/i.test(line)) {
      startTextSection("Série", line.replace(/^Série:/i, ""));
      continue;
    }

    if (/^Categoria:/i.test(line)) {
      startTextSection("Categoria", line.replace(/^Categoria:/i, ""));
      continue;
    }

    if (/^Características técnicas encontradas:/i.test(line)) {
      startListSection("Características técnicas");

      const resto = line
        .replace(/^Características técnicas encontradas:/i, "")
        .trim();

      if (resto) {
        current.items.push(
          cleanGroundingInlineNoise(resto.replace(/^•\s*/, "")),
        );
      }
      continue;
    }

    if (/^Resumo para vendedor:/i.test(line)) {
      startTextSection(
        "Resumo para vendedor",
        line.replace(/^Resumo para vendedor:/i, ""),
      );
      continue;
    }

    if (/^Observações relevantes:/i.test(line) || /^Observações:/i.test(line)) {
      startTextSection(
        "Observações",
        line
          .replace(/^Observações relevantes:/i, "")
          .replace(/^Observações:/i, ""),
      );
      continue;
    }

    if (!current) {
      startTextSection("Informação encontrada", line);
      continue;
    }

    if (current.type === "list") {
      current.items.push(cleanGroundingInlineNoise(line.replace(/^•\s*/, "")));
    } else {
      current.content =
        `${current.content} ${cleanGroundingInlineNoise(line)}`.trim();
    }
  }

  pushCurrent();
  return sections;
}

function renderGroundingSections(texto = "") {
  const textoBase = String(texto || "").trim();
  if (!textoBase) return null;

  const sections = parseGroundingText(textoBase);

  if (!sections.length) {
    return (
      <div className="ai-grounding-sections">
        <div className="ai-grounding-card">
          <h4>Informação encontrada</h4>
          <p>{cleanGroundingInlineNoise(textoBase)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-grounding-sections">
      {sections.map((section, index) => (
        <div key={`${section.title}-${index}`} className="ai-grounding-card">
          <h4>{section.title}</h4>

          {section.type === "list" ? (
            <ul className="ai-list">
              {section.items.map((item, itemIndex) => (
                <li key={`${section.title}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>{section.content || "-"}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function mapArtigoToAiResultado(item) {
  const fontes = Array.isArray(item?.documentos_oficiais)
    ? item.documentos_oficiais.filter(Boolean)
    : item?.fonte_oficial
      ? [item.fonte_oficial]
      : [];

  const caracteristicas = item?.caracteristicas_tecnicas || {};
  const temEstrutura =
    Object.keys(caracteristicas).length > 0 ||
    !!String(item?.resumo_vendedor || "").trim() ||
    !!String(item?.observacoes_ia || "").trim();

  return {
    titulo:
      item?.titulo_oficial ||
      item?.descricao_oficial ||
      item?.descricao ||
      item?.artigo ||
      "",
    categoria: item?.categoria || "",
    marca: item?.marca || "",
    modelo: item?.modelo || "",
    caracteristicas_tecnicas: caracteristicas,
    resumo_vendedor: item?.resumo_vendedor || "",
    observacoes: item?.observacoes_ia || "",
    fontes,
    texto_grounding: item?.texto_grounding || "",
    modo_resposta: temEstrutura
      ? "estruturado"
      : item?.texto_grounding
        ? "texto"
        : "estruturado",
  };
}

function normalizeAiResultado(resultado = {}, artigoFallback = null) {
  const fallback = artigoFallback ? mapArtigoToAiResultado(artigoFallback) : {};
  const caracteristicas =
    resultado?.caracteristicas_tecnicas ||
    fallback?.caracteristicas_tecnicas ||
    {};
  const fontes =
    Array.isArray(resultado?.fontes) && resultado.fontes.length > 0
      ? resultado.fontes
      : fallback?.fontes || [];

  const temEstrutura =
    Object.keys(caracteristicas).length > 0 ||
    !!String(
      resultado?.resumo_vendedor || fallback?.resumo_vendedor || "",
    ).trim() ||
    !!String(resultado?.observacoes || fallback?.observacoes || "").trim();

  return {
    ...fallback,
    ...resultado,
    titulo: resultado?.titulo || fallback?.titulo || "",
    categoria: resultado?.categoria || fallback?.categoria || "",
    marca: resultado?.marca || fallback?.marca || "",
    modelo: resultado?.modelo || fallback?.modelo || "",
    caracteristicas_tecnicas: caracteristicas,
    resumo_vendedor:
      resultado?.resumo_vendedor || fallback?.resumo_vendedor || "",
    observacoes: resultado?.observacoes || fallback?.observacoes || "",
    fontes,
    texto_grounding:
      resultado?.texto_grounding || fallback?.texto_grounding || "",
    modo_resposta: temEstrutura
      ? "estruturado"
      : resultado?.texto_grounding || fallback?.texto_grounding
        ? "texto"
        : "estruturado",
  };
}

function formatarDataHistorico(iso) {
  try {
    return new Date(iso).toLocaleString("pt-PT");
  } catch {
    return iso || "-";
  }
}

function formatarAutorCampanha(campanha) {
  return (
    String(campanha?.createdBy || "").trim() ||
    String(campanha?.createdByEmail || "").trim() ||
    "Utilizador"
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [pesquisa, setPesquisa] = useState("");
  const [artigoSelecionado, setArtigoSelecionado] = useState(null);
  const [aiAberta, setAiAberta] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErro, setAiErro] = useState("");
  const [aiResultado, setAiResultado] = useState(null);

  const [historicoCampanhas, setHistoricoCampanhas] = useState([]);
  const [campanhaSelecionada, setCampanhaSelecionada] = useState(null);
  const [artigos, setArtigos] = useState([]);
  const [artigosLoading, setArtigosLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function syncHistoricoCampanhas() {
      try {
        const campanhas = await loadCampaignHistory(profile?.store);

        if (isMounted) {
          setHistoricoCampanhas(campanhas);
        }
      } catch (error) {
        console.warn(
          "Não foi possível carregar o histórico de campanhas.",
          error,
        );
        if (isMounted) {
          setHistoricoCampanhas([]);
        }
      }
    }

    async function syncArtigosFromApi() {
      try {
        const data = await loadAllArtigos({ pageSize: 500 });

        if (isMounted) {
          setArtigos(data.items || []);
        }
      } catch (error) {
        console.warn("Não foi possível sincronizar artigos pela API.", error);
      } finally {
        if (isMounted) {
          setArtigosLoading(false);
        }
      }
    }

    syncHistoricoCampanhas();
    syncArtigosFromApi();

    return () => {
      isMounted = false;
    };
  }, [profile?.store]);

  const sugestoes = useMemo(() => {
    const termo = normalizarTexto(pesquisa);
    if (termo.length < 2) return [];

    return artigos
      .filter((item) => {
        const artigo = normalizarTexto(item.artigo);
        const descricao = normalizarTexto(item.descricao);
        const codigoBarras = normalizarTexto(item.codigoBarras);
        const tituloOficial = normalizarTexto(item.titulo_oficial);
        const descricaoOficial = normalizarTexto(item.descricao_oficial);

        return (
          artigo.includes(termo) ||
          descricao.includes(termo) ||
          codigoBarras.includes(termo) ||
          tituloOficial.includes(termo) ||
          descricaoOficial.includes(termo)
        );
      })
      .slice(0, 5);
  }, [pesquisa, artigos]);

  const historicoPreview = useMemo(() => {
    return (Array.isArray(historicoCampanhas) ? historicoCampanhas : [])
      .filter(Boolean)
      .slice(0, 4);
  }, [historicoCampanhas]);

  function abrirPesquisaCompleta() {
    if (!pesquisa.trim()) {
      navigate("/Etiquetas");
      return;
    }

    navigate(`/Etiquetas?search=${encodeURIComponent(pesquisa.trim())}`);
  }

  function abrirPopupArtigo(item) {
    setArtigoSelecionado(item);
    setAiAberta(false);
    setAiErro("");
    setAiResultado(null);
    setAiLoading(false);
  }

  function fecharPopupArtigo() {
    setArtigoSelecionado(null);
    setAiAberta(false);
    setAiErro("");
    setAiResultado(null);
    setAiLoading(false);
  }

  function abrirPopupCampanha(campanha) {
    setCampanhaSelecionada(campanha);
  }

  function fecharPopupCampanha() {
    setCampanhaSelecionada(null);
  }

  async function apagarCampanha(id) {
    try {
      const atualizado = await removeCampaignFromHistory(id, profile?.store);
      setHistoricoCampanhas(atualizado);

      if (campanhaSelecionada?.id === id) {
        setCampanhaSelecionada(null);
      }
    } catch (error) {
      console.error("Não foi possível apagar a campanha.", error);
      alert("Não foi possível apagar a campanha.");
    }
  }

  function duplicarCampanha(campanha) {
    navigate("/EtiquetasCampanha", {
      state: {
        campanhaDuplicada: campanha,
      },
    });
  }

  async function abrirPopupAI() {
    if (!artigoSelecionado) return;

    setAiAberta(true);
    setAiErro("");
    setAiResultado(null);

    if (hasUsefulTechData(artigoSelecionado)) {
      setAiResultado(mapArtigoToAiResultado(artigoSelecionado));
      return;
    }

    setAiLoading(true);

    try {
      const payload = {
        artigoInterno: artigoSelecionado.artigo || "",
        descricao: artigoSelecionado.descricao || "",
        codigoBarras: artigoSelecionado.codigoBarras || "",
      };

      const data = await enrichArtigoWithAi(payload);

      const artigoAtualizado = mergeArtigoData(
        artigoSelecionado,
        data?.artigoAtualizado,
      );
      const resultadoNormalizado = normalizeAiResultado(
        data?.resultado,
        artigoAtualizado,
      );

      setAiResultado(resultadoNormalizado);
      setArtigoSelecionado(artigoAtualizado);
      setArtigos((prev) => mergeArtigosIntoList(prev, artigoAtualizado));
      syncUpdatedArtigoToCache(artigoAtualizado);
    } catch (error) {
      console.error("Erro completo AI:", error);
      setAiErro(error?.message || "Erro ao obter dados do artigo.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="page-content">
      <div className="home-hero">
        <div className="home-hero-content">
          <h1 className="page-title">Expert Admin</h1>
          <p className="page-subtitle">
            Pesquisa artigos, cria etiquetas e faz scan rápido num só lugar.
          </p>

          {artigosLoading && (
            <p className="page-subtitle">A carregar catálogo de artigos...</p>
          )}

          <div className="home-search-wrap">
            <input
              type="text"
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              placeholder="Pesquisar artigo, descrição ou código de barras"
              className="home-search-input"
              onKeyDown={(e) => {
                if (e.key === "Enter") abrirPesquisaCompleta();
              }}
            />

            <button
              type="button"
              className="btn btn-primary home-search-btn"
              onClick={abrirPesquisaCompleta}
            >
              Pesquisar
            </button>
          </div>

          {sugestoes.length > 0 && (
            <div className="home-search-suggestions">
              {sugestoes.map((item, index) => (
                <button
                  key={`${item.artigo}-${index}`}
                  type="button"
                  className="home-suggestion-item"
                  onClick={() => abrirPopupArtigo(item)}
                >
                  <strong>{item.artigo}</strong>
                  <span>{item.descricao}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="home-grid">
        <button
          type="button"
          className="home-card home-card-primary"
          onClick={() => navigate("/EtiquetasCampanha")}
        >
          <div className="home-card-icon">🏷️</div>
          <div className="home-card-text">
            <h2>Etiquetas</h2>
            <p>Criar e imprimir etiquetas de campanha.</p>
          </div>
        </button>

        <button
          type="button"
          className="home-card"
          onClick={() => navigate("/Etiquetas")}
        >
          <div className="home-card-icon">📦</div>
          <div className="home-card-text">
            <h2>Artigos</h2>
            <p>Pesquisar, selecionar e copiar artigos.</p>
          </div>
        </button>

        <button
          type="button"
          className="home-card"
          onClick={() => navigate("/Etiquetas")}
        >
          <div className="home-card-icon">📷</div>
          <div className="home-card-text">
            <h2>Scan rápido</h2>
            <p>Ler código de barras ou modelo.</p>
          </div>
        </button>
      </div>

      <div className="home-section">
        <div className="table-card-header">
          <h2>Histórico de campanhas</h2>
        </div>

        <div className="home-history-wrap">
          {historicoPreview.length === 0 ? (
            <div className="home-history-empty">
              Ainda não existem campanhas guardadas.
            </div>
          ) : (
            <div className="home-history-grid">
              {historicoPreview.filter((campanha) => campanha && campanha.id).map((campanha) => (
                <button
                  key={campanha.id}
                  type="button"
                  className="home-history-card"
                  onClick={() => abrirPopupCampanha(campanha)}
                >
                  <div className="home-history-top">
                    <div>
                      <strong>{campanha.titulo || "PROMO"}</strong>
                      <span>{formatarDataHistorico(campanha.criadoEm)}</span>
                    </div>

                    <span className="home-history-format">
                      {String(campanha.formatoEtiqueta || "a6").toUpperCase()}
                    </span>
                  </div>

                  <div className="home-history-meta">
                    <span>{campanha.totalArtigos || 0} artigos</span>
                    <span>Validade: {campanha.anoValidade || "-"}</span>
                    <span>Criado por: {formatarAutorCampanha(campanha)}</span>
                  </div>

                  <div className="home-history-preview">
                    {Array.isArray(campanha.dados) &&
                      campanha.dados.slice(0, 2).map((item) => (
                        <p key={item.id || `${campanha.id}-${item.codigo}`}>
                          {item.codigo} — {item.descricao}
                        </p>
                      ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="home-section">
        <div className="table-card-header">
          <h2>Resumo</h2>
        </div>

        <div className="resumo-cards">
          <div className="resumo-card">
            <span className="resumo-label">Artigos carregados</span>
            <strong>{artigos.length}</strong>
          </div>

          <div className="resumo-card">
            <span className="resumo-label">Área principal</span>
            <strong>Etiquetas</strong>
          </div>

          <div className="resumo-card">
            <span className="resumo-label">Modo ideal</span>
            <strong>Mobile + Desktop</strong>
          </div>
        </div>
      </div>

      {artigoSelecionado && (
        <div className="popup-overlay">
          <div className="popup-card ai-popup-card-pro">
            <div className="popup-header popup-header-pro">
              <div>
                <div className="popup-eyebrow">Artigo selecionado</div>
                <h2>Detalhes do artigo</h2>
                <p className="popup-subtitle">
                  Consulta dados base e usa AI apenas quando faltar informação
                  técnica.
                </p>
              </div>

              <button
                type="button"
                className="popup-close"
                onClick={fecharPopupArtigo}
              >
                ×
              </button>
            </div>

            <div className="ai-popup-scroll">
              <div className="popup-status-row">
                <span className="popup-chip">
                  Criado por: {formatarAutorCampanha(campanhaSelecionada)}
                </span>
                <span className="popup-chip">
                  Artigo: {artigoSelecionado.artigo || "N/D"}
                </span>

                <span className="popup-chip">
                  EAN: {artigoSelecionado.codigoBarras || "N/D"}
                </span>

                <span className="popup-chip popup-chip-ai">
                  {hasUsefulTechData(artigoSelecionado)
                    ? "Dados técnicos já disponíveis"
                    : "Dados técnicos incompletos"}
                </span>
              </div>

              <div className="popup-grid-pro">
                <div className="ai-card-panel">
                  <div className="section-title-row">
                    <h3>Dados do artigo</h3>
                  </div>

                  <div className="popup-info-grid">
                    <p>
                      <strong>Artigo:</strong> {artigoSelecionado.artigo || "-"}
                    </p>
                    <p>
                      <strong>Descrição:</strong>{" "}
                      {artigoSelecionado.descricao || "-"}
                    </p>
                    <p>
                      <strong>PVP2:</strong> {artigoSelecionado.pvp2 || "-"}
                    </p>
                    <p>
                      <strong>Código de barras:</strong>{" "}
                      {artigoSelecionado.codigoBarras || "-"}
                    </p>
                  </div>
                </div>

                <div className="ai-card-panel">
                  <div className="section-title-row">
                    <h3>Estado da análise</h3>
                  </div>

                  {!aiAberta && (
                    <p className="empty-state-text">
                      Abre a AI para consultar características reais do produto.
                    </p>
                  )}

                  {aiAberta && aiLoading && (
                    <p className="empty-state-text">
                      A AI está a procurar características reais na web...
                    </p>
                  )}

                  {aiAberta && !aiLoading && aiErro && (
                    <p className="ai-error">{aiErro}</p>
                  )}

                  {aiAberta && !aiLoading && !aiErro && aiResultado && (
                    <div className="popup-info-grid">
                      <p>
                        <strong>Título:</strong>{" "}
                        {aiResultado.titulo || "Não confirmado"}
                      </p>
                      <p>
                        <strong>Categoria:</strong>{" "}
                        {aiResultado.categoria || "Não confirmado"}
                      </p>
                      <p>
                        <strong>Marca:</strong>{" "}
                        {aiResultado.marca || "Não confirmado"}
                      </p>
                      <p>
                        <strong>Modelo:</strong>{" "}
                        {aiResultado.modelo || "Não confirmado"}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {aiAberta && !aiLoading && !aiErro && aiResultado && (
                <div className="ai-card-panel">
                  <div className="section-title-row">
                    <h3>Resposta AI</h3>
                    <span className="section-count">
                      {aiResultado?.caracteristicas_tecnicas
                        ? Object.keys(aiResultado.caracteristicas_tecnicas)
                            .length
                        : 0}
                    </span>
                  </div>

                  {aiResultado?.texto_grounding
                    ? renderGroundingSections(aiResultado.texto_grounding)
                    : null}

                  {!aiResultado?.texto_grounding &&
                    aiResultado?.caracteristicas_tecnicas &&
                    Object.keys(aiResultado.caracteristicas_tecnicas).length >
                      0 && (
                      <div className="tech-specs-grid">
                        {Object.entries(
                          aiResultado.caracteristicas_tecnicas,
                        ).map(([key, value]) => (
                          <div key={key} className="tech-spec-item">
                            <span className="tech-spec-label">{key}</span>
                            <strong className="tech-spec-value">
                              {value || "-"}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}

                  {!aiResultado?.texto_grounding && (
                    <div className="popup-info-grid ai-extra-info">
                      <p>
                        <strong>Resumo vendedor:</strong>{" "}
                        {aiResultado.resumo_vendedor || "Não disponível"}
                      </p>

                      <p>
                        <strong>Observações:</strong>{" "}
                        {aiResultado.observacoes || "Sem observações"}
                      </p>
                    </div>
                  )}
                  {Array.isArray(aiResultado.fontes) &&
                    aiResultado.fontes.length > 0 && (
                      <div className="ai-fontes-box">
                        <strong>Fontes:</strong>
                        <ul className="ai-list">
                          {aiResultado.fontes.map((fonte, index) => (
                            <li key={index}>
                              <a
                                className="popup-link"
                                href={fonte}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {fonte}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}
            </div>

            <div className="popup-actions popup-actions-pro">
              <button
                type="button"
                className="btn btn-primary"
                onClick={abrirPopupAI}
                disabled={aiLoading}
              >
                {aiLoading ? "A analisar..." : "Ver com AI"}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={fecharPopupArtigo}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {campanhaSelecionada && (
        <div className="popup-overlay">
          <div className="popup-card popup-card-historico-pro">
            <div className="popup-header popup-header-pro">
              <div>
                <div className="popup-eyebrow">Histórico de campanhas</div>
                <h2>{campanhaSelecionada.titulo || "Campanha"}</h2>
                <p className="popup-subtitle">
                  Consulta os detalhes e duplica a campanha para voltar a
                  editar.
                </p>
              </div>

              <button
                type="button"
                className="popup-close"
                onClick={fecharPopupCampanha}
              >
                ×
              </button>
            </div>

            <div className="ai-popup-scroll">
              <div className="popup-status-row">
                <span className="popup-chip">
                  Criada em:{" "}
                  {formatarDataHistorico(campanhaSelecionada.criadoEm)}
                </span>
                <span className="popup-chip">
                  Artigos: {campanhaSelecionada.totalArtigos || 0}
                </span>
                <span className="popup-chip">
                  Formato base:{" "}
                  {String(
                    campanhaSelecionada.formatoEtiqueta || "a6",
                  ).toUpperCase()}
                </span>
                <span className="popup-chip">
                  Validade: {campanhaSelecionada.anoValidade || "-"}
                </span>
              </div>

              <div className="historico-popup-list">
                {Array.isArray(campanhaSelecionada.dados) &&
                  campanhaSelecionada.dados.map((item) => (
                    <div
                      key={
                        item.id || `${campanhaSelecionada.id}-${item.codigo}`
                      }
                      className="historico-popup-item"
                    >
                      <div className="historico-popup-main">
                        <strong>{item.codigo || "-"}</strong>
                        <span>{item.descricao || "-"}</span>
                      </div>

                      <div className="historico-popup-prices">
                        <span>Antes: {item.antes ?? "-"}</span>
                        <span>Atual: {item.atual ?? "-"}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="popup-actions popup-actions-pro">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => duplicarCampanha(campanhaSelecionada)}
              >
                Duplicar campanha
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => apagarCampanha(campanhaSelecionada.id)}
              >
                Apagar
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={fecharPopupCampanha}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
