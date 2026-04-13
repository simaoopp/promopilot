import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import artigosData from "../data/artigos.json";
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
  return !!(
    item?.caracteristicas_tecnicas &&
    typeof item.caracteristicas_tecnicas === "object" &&
    Object.keys(item.caracteristicas_tecnicas).length > 0
  );
}

function parseGroundingText(texto = "") {
  const textoBase = String(texto || "").trim();

  if (!textoBase) return [];

  const normalized = textoBase
    .replace(/\s*(Título confirmado:)/gi, "\n$1")
    .replace(/\s*(Descrição confirmada:)/gi, "\n$1")
    .replace(/\s*(Características técnicas encontradas:)/gi, "\n$1")
    .replace(/\s*(Resumo para vendedor:)/gi, "\n$1")
    .replace(/\s*(Observações relevantes:)/gi, "\n$1")
    .replace(/\s*(Observações:)/gi, "\n$1")
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
    if (current) sections.push(current);
  }

  for (const line of lines) {
    if (/^Título confirmado:/i.test(line)) {
      pushCurrent();
      current = {
        title: "Título confirmado",
        type: "text",
        content: line.replace(/^Título confirmado:/i, "").trim(),
      };
      continue;
    }

    if (/^Descrição confirmada:/i.test(line)) {
      pushCurrent();
      current = {
        title: "Descrição confirmada",
        type: "text",
        content: line.replace(/^Descrição confirmada:/i, "").trim(),
      };
      continue;
    }

    if (/^Características técnicas encontradas:/i.test(line)) {
      pushCurrent();
      current = {
        title: "Características técnicas",
        type: "list",
        items: [],
      };

      const resto = line
        .replace(/^Características técnicas encontradas:/i, "")
        .trim();

      if (resto) {
        current.items.push(resto.replace(/^•\s*/, "").trim());
      }
      continue;
    }

    if (/^Resumo para vendedor:/i.test(line)) {
      pushCurrent();
      current = {
        title: "Resumo para vendedor",
        type: "text",
        content: line.replace(/^Resumo para vendedor:/i, "").trim(),
      };
      continue;
    }

    if (/^Observações relevantes:/i.test(line) || /^Observações:/i.test(line)) {
      pushCurrent();
      current = {
        title: "Observações",
        type: "text",
        content: line
          .replace(/^Observações relevantes:/i, "")
          .replace(/^Observações:/i, "")
          .trim(),
      };
      continue;
    }

    if (!current) {
      current = {
        title: "Informação encontrada",
        type: "text",
        content: line,
      };
      continue;
    }

    if (current.type === "list") {
      current.items.push(line.replace(/^•\s*/, "").trim());
    } else {
      current.content = `${current.content} ${line}`.trim();
    }
  }

  pushCurrent();
  return sections;
}

function renderGroundingSections(texto = "") {
  const sections = parseGroundingText(texto);
  if (!sections.length) return null;

  return (
    <div className="ai-grounding-sections">
      {sections.map((section, index) => (
        <div key={`${section.title}-${index}`} className="ai-grounding-card">
          <h4>{section.title}</h4>

          {section.type === "list" ? (
            <ul className="ai-list">
              {section.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
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
  return {
    titulo: item.titulo_oficial || item.descricao || item.artigo || "",
    categoria: item.categoria || "",
    marca: item.marca || "",
    modelo: item.modelo || "",
    caracteristicas_tecnicas: item.caracteristicas_tecnicas || {},
    resumo_vendedor: item.resumo_vendedor || "",
    observacoes: item.observacoes_ia || "",
    fontes: Array.isArray(item.documentos_oficiais)
      ? item.documentos_oficiais
      : item.fonte_oficial
        ? [item.fonte_oficial]
        : [],
    texto_grounding: item.texto_grounding || "",
    modo_resposta: item.texto_grounding ? "texto" : "estruturado",
  };
}

function formatarDataHistorico(iso) {
  try {
    return new Date(iso).toLocaleString("pt-PT");
  } catch {
    return iso || "-";
  }
}

export default function HomePage() {
  const navigate = useNavigate();

  const [pesquisa, setPesquisa] = useState("");
  const [artigoSelecionado, setArtigoSelecionado] = useState(null);
  const [aiAberta, setAiAberta] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErro, setAiErro] = useState("");
  const [aiResultado, setAiResultado] = useState(null);

  const [historicoCampanhas, setHistoricoCampanhas] = useState([]);
  const [campanhaSelecionada, setCampanhaSelecionada] = useState(null);

  const artigos = artigosData?.artigos || [];

  useEffect(() => {
    setHistoricoCampanhas(loadCampaignHistory());
  }, []);

  const sugestoes = useMemo(() => {
    const termo = normalizarTexto(pesquisa);
    if (termo.length < 2) return [];

    return artigos
      .filter((item) => {
        const artigo = normalizarTexto(item.artigo);
        const descricao = normalizarTexto(item.descricao);
        const codigoBarras = normalizarTexto(item.codigoBarras);

        return (
          artigo.includes(termo) ||
          descricao.includes(termo) ||
          codigoBarras.includes(termo)
        );
      })
      .slice(0, 5);
  }, [pesquisa, artigos]);

  const historicoPreview = useMemo(() => {
    return historicoCampanhas.slice(0, 4);
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

  function apagarCampanha(id) {
    const atualizado = removeCampaignFromHistory(id);
    setHistoricoCampanhas(atualizado);

    if (campanhaSelecionada?.id === id) {
      setCampanhaSelecionada(null);
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
      const response = await fetch("http://localhost:3001/api/ai-produto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          artigoInterno: artigoSelecionado.artigo || "",
          descricao: artigoSelecionado.descricao || "",
          codigoBarras: artigoSelecionado.codigoBarras || "",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.detalhe || "Erro no servidor.");
      }

      if (!data?.ok) {
        throw new Error(data?.error || "Resposta inválida da AI.");
      }

      setAiResultado(data.resultado || null);

      setArtigoSelecionado((prev) =>
        prev
          ? {
              ...prev,
              fonte_oficial:
                data?.artigoAtualizado?.fonte_oficial || prev.fonte_oficial,
              raw_hash: data?.artigoAtualizado?.raw_hash || prev.raw_hash,
              ultima_atualizacao:
                data?.artigoAtualizado?.ultima_atualizacao ||
                prev.ultima_atualizacao,
              titulo_oficial:
                data?.artigoAtualizado?.titulo_oficial || prev.titulo_oficial,
              descricao_oficial:
                data?.artigoAtualizado?.descricao_oficial ||
                prev.descricao_oficial,
              caracteristicas_tecnicas:
                data?.artigoAtualizado?.caracteristicas_tecnicas ||
                prev.caracteristicas_tecnicas,
              resumo_vendedor:
                data?.artigoAtualizado?.resumo_vendedor || prev.resumo_vendedor,
              observacoes_ia:
                data?.artigoAtualizado?.observacoes_ia || prev.observacoes_ia,
              texto_grounding:
                data?.artigoAtualizado?.texto_grounding || prev.texto_grounding,
              documentos_oficiais:
                data?.artigoAtualizado?.documentos_oficiais ||
                prev.documentos_oficiais,
            }
          : prev,
      );
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
              {historicoPreview.map((campanha) => (
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
                    <p>
                      <strong>Armazém:</strong>{" "}
                      {artigoSelecionado.armazem || "-"}
                    </p>
                    <p>
                      <strong>Stock:</strong> {artigoSelecionado.stock || "-"}
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

                  {aiResultado?.modo_resposta === "texto" &&
                  aiResultado?.texto_grounding ? (
                    renderGroundingSections(aiResultado.texto_grounding)
                  ) : (
                    <>
                      {aiResultado?.caracteristicas_tecnicas &&
                        Object.keys(aiResultado.caracteristicas_tecnicas)
                          .length > 0 && (
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
                    </>
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
                  Consulta os detalhes e duplica a campanha para voltar a editar.
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
                  Criada em: {formatarDataHistorico(campanhaSelecionada.criadoEm)}
                </span>
                <span className="popup-chip">
                  Artigos: {campanhaSelecionada.totalArtigos || 0}
                </span>
                <span className="popup-chip">
                  Formato base:{" "}
                  {String(campanhaSelecionada.formatoEtiqueta || "a6").toUpperCase()}
                </span>
                <span className="popup-chip">
                  Validade: {campanhaSelecionada.anoValidade || "-"}
                </span>
              </div>

              <div className="historico-popup-list">
                {Array.isArray(campanhaSelecionada.dados) &&
                  campanhaSelecionada.dados.map((item) => (
                    <div
                      key={item.id || `${campanhaSelecionada.id}-${item.codigo}`}
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