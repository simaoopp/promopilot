import React, { useMemo } from "react";
import { normalizarValorPvp } from "../../utils/articlePrices";

function cleanSpecs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value)
    .filter(([key, item]) => String(key || "").trim() && String(item ?? "").trim())
    .filter(([key]) => !["info", "alterado"].includes(String(key).toLowerCase()))
    .slice(0, 24);
}

export default function ArticleDetailsModal({ artigo, onClose }) {
  const specs = useMemo(
    () => cleanSpecs(artigo?.caracteristicas_tecnicas),
    [artigo?.caracteristicas_tecnicas],
  );

  if (!artigo) return null;

  return (
    <div className="popup-overlay" role="dialog" aria-modal="true">
      <div className="popup-card ai-popup-card-pro">
        <div className="popup-header popup-header-pro">
          <div>
            <div className="popup-eyebrow">Artigo selecionado</div>
            <h2>{artigo.titulo_oficial || artigo.descricao || "Detalhes do artigo"}</h2>
            <p className="popup-subtitle">
              Consulta a ficha comercial e técnica deste artigo.
            </p>
          </div>

          <button type="button" className="popup-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="ai-popup-scroll">
          <div className="popup-status-row">
            <span className="popup-chip">Artigo: {artigo.artigo || "N/D"}</span>
            <span className="popup-chip">EAN: {artigo.codigoBarras || "N/D"}</span>
            {artigo.estado && (
              <span className="popup-chip">Estado: {artigo.estado}</span>
            )}
          </div>

          <div className="popup-grid-pro">
            <section className="ai-card-panel">
              <div className="section-title-row">
                <h3>Ficha comercial</h3>
              </div>

              <div className="popup-info-grid">
                <p><strong>Descrição:</strong> {artigo.descricao || "-"}</p>
                <p><strong>Marca:</strong> {artigo.marca || artigo.brand || "-"}</p>
                <p><strong>Modelo:</strong> {artigo.modelo || "-"}</p>
                <p><strong>Categoria:</strong> {artigo.categoria || "-"}</p>
                <p><strong>PVP1:</strong> {normalizarValorPvp(artigo.pvp1)}</p>
                <p><strong>PVP2:</strong> {normalizarValorPvp(artigo.pvp2)}</p>
                <p><strong>PVP3:</strong> {normalizarValorPvp(artigo.pvp3)}</p>
              </div>
            </section>

            <section className="ai-card-panel">
              <div className="section-title-row">
                <h3>Informação para venda</h3>
              </div>

              <div className="popup-info-grid">
                <p>
                  <strong>Descrição oficial:</strong>{" "}
                  {artigo.descricao_oficial || "Ainda não disponível"}
                </p>
                <p>
                  <strong>Resumo vendedor:</strong>{" "}
                  {artigo.resumo_vendedor || "Ainda não disponível"}
                </p>
              </div>
            </section>
          </div>

          {specs.length > 0 && (
            <section className="ai-card-panel">
              <div className="section-title-row">
                <h3>Características técnicas</h3>
                <span className="section-count">{specs.length}</span>
              </div>

              <div className="tech-specs-grid">
                {specs.map(([key, value]) => (
                  <div key={key} className="tech-spec-item">
                    <span className="tech-spec-label">{key}</span>
                    <strong className="tech-spec-value">{String(value)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="popup-actions popup-actions-pro">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
