import React from "react";

export default function HomeHistorySection({
  historicoPreview,
  onOpenCampaign,
  formatarDataHistorico,
  formatarAutorCampanha,
}) {
  return (
    <section className="home-section pp-history-section">
      <div className="table-card-header pp-card-header">
        <div>
          <span className="pp-kicker">Últimas execuções</span>
          <h2>Campanhas manuais</h2>
        </div>
      </div>

      <div className="home-history-wrap">
        {historicoPreview.length === 0 ? (
          <div className="home-history-empty pp-empty-state">
            Ainda não existem campanhas guardadas.
          </div>
        ) : (
          <div className="home-history-grid pp-history-grid">
            {historicoPreview
              .filter((campanha) => campanha && campanha.id)
              .map((campanha) => (
                <button
                  key={campanha.id}
                  type="button"
                  className="home-history-card pp-history-card"
                  onClick={() => onOpenCampaign(campanha)}
                >
                  <div className="home-history-top">
                    <div>
                      <strong>{campanha.titulo || "Campanha manual"}</strong>
                      <span>{formatarDataHistorico(campanha.criadoEm)}</span>
                    </div>
                    <span className="home-history-format">
                      {String(campanha.formatoEtiqueta || "a6").toUpperCase()}
                    </span>
                  </div>

                  <div className="home-history-meta">
                    <span>{campanha.totalArtigos || 0} artigos</span>
                    <span>Validade: {campanha.anoValidade || "-"}</span>
                    <span>{formatarAutorCampanha(campanha)}</span>
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
    </section>
  );
}
