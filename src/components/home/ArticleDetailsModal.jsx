import React, { useMemo } from "react";
import {
  cleanGroundingInlineNoise,
  hasUsefulTechData,
  parseGroundingText,
} from "../../utils/homepageAi";

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
        <div
          key={`${section.title}-${index}`}
          className="ai-grounding-card"
        >
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

function getDomainLabel(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

export default function ArticleDetailsModal({
  artigo,
  aiAberta,
  aiLoading,
  aiErro,
  aiResultado,
  onClose,
  onOpenAi,
}) {
  const fontesDisponiveis = useMemo(() => {
    const fontes = [
      ...(Array.isArray(aiResultado?.fontes) ? aiResultado.fontes : []),
      ...(Array.isArray(artigo?.documentos_oficiais)
        ? artigo.documentos_oficiais
        : []),
      artigo?.fonte_oficial || "",
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    return Array.from(new Set(fontes));
  }, [aiResultado?.fontes, artigo?.documentos_oficiais, artigo?.fonte_oficial]);

  if (!artigo) return null;

  return (
    <div className="popup-overlay" role="dialog" aria-modal="true">
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

          <button type="button" className="popup-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="ai-popup-scroll">
          <div className="popup-status-row">
            <span className="popup-chip">Artigo: {artigo.artigo || "N/D"}</span>
            <span className="popup-chip">
              EAN: {artigo.codigoBarras || "N/D"}
            </span>
            <span className="popup-chip popup-chip-ai">
              {hasUsefulTechData(artigo)
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
                  <strong>Artigo:</strong> {artigo.artigo || "-"}
                </p>
                <p>
                  <strong>Descrição:</strong> {artigo.descricao || "-"}
                </p>
                <p>
                  <strong>PVP2:</strong> {artigo.pvp2 || "-"}
                </p>
                <p>
                  <strong>Código de barras:</strong> {artigo.codigoBarras || "-"}
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
                    <strong>Título:</strong> {aiResultado.titulo || "Não confirmado"}
                  </p>
                  <p>
                    <strong>Categoria:</strong> {aiResultado.categoria || "Não confirmado"}
                  </p>
                  <p>
                    <strong>Marca:</strong> {aiResultado.marca || "Não confirmado"}
                  </p>
                  <p>
                    <strong>Modelo:</strong> {aiResultado.modelo || "Não confirmado"}
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
                    ? Object.keys(aiResultado.caracteristicas_tecnicas).length
                    : 0}
                </span>
              </div>

              {aiResultado?.texto_grounding
                ? renderGroundingSections(aiResultado.texto_grounding)
                : null}

              {!aiResultado?.texto_grounding &&
                aiResultado?.caracteristicas_tecnicas &&
                Object.keys(aiResultado.caracteristicas_tecnicas).length > 0 && (
                  <div className="tech-specs-grid">
                    {Object.entries(aiResultado.caracteristicas_tecnicas).map(
                      ([key, value]) => (
                        <div key={key} className="tech-spec-item">
                          <span className="tech-spec-label">{key}</span>
                          <strong className="tech-spec-value">{value || "-"}</strong>
                        </div>
                      ),
                    )}
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

              <details className="ai-sources-accordion">
                <summary>
                  <span>Onde foi procurar</span>
                  <span className="ai-sources-count">
                    {fontesDisponiveis.length}
                  </span>
                </summary>

                <div className="ai-sources-content">
                  {fontesDisponiveis.length > 0 ? (
                    <ul className="ai-source-list">
                      {fontesDisponiveis.map((fonte, index) => (
                        <li key={`${fonte}-${index}`} className="ai-source-item">
                          <span className="ai-source-domain">
                            {getDomainLabel(fonte)}
                          </span>
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
                  ) : (
                    <p className="empty-state-text">
                      Ainda não há fontes abertas para este artigo.
                    </p>
                  )}

                  {aiResultado?.texto_grounding && (
                    <div className="ai-source-notes">
                      <strong>Resumo da pesquisa</strong>
                      <p>{cleanGroundingInlineNoise(aiResultado.texto_grounding)}</p>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>

        <div className="popup-actions popup-actions-pro">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenAi}
            disabled={aiLoading}
          >
            {aiLoading ? "A analisar..." : "Ver com AI"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
