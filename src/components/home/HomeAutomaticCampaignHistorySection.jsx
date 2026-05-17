import React from "react";

function getStatusLabel(status) {
  const value = String(status || "processed").toLowerCase();

  if (value === "sent") return "Enviado";
  if (value === "error" || value === "failed") return "Com erro";
  if (value === "pending") return "Pendente";
  if (value === "processing") return "A processar";
  return "Processado";
}

function getPdfUrl(campanha) {
  return campanha?.pdfUrl || campanha?.pdfs?.[campanha?.store] || "";
}

function countFormats(items = []) {
  return (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      const format = String(
        item?._formato || item?.formato_final || item?.formatoEtiqueta || "a6",
      ).toLowerCase();

      if (format === "a5") acc.a5 += 1;
      else acc.a6 += 1;
      return acc;
    },
    { a5: 0, a6: 0 },
  );
}

export default function HomeAutomaticCampaignHistorySection({
  historicoPreview,
  onOpenCampaign,
  formatarDataHistorico,
}) {
  return (
    <div className="home-section">
      <div className="table-card-header">
        <h2>Histórico de campanhas automático</h2>
      </div>

      <div className="home-history-wrap">
        {historicoPreview.length === 0 ? (
          <div className="home-history-empty">
            Ainda não existem campanhas automáticas guardadas.
          </div>
        ) : (
          <div className="home-history-grid">
            {historicoPreview
              .filter((campanha) => campanha && campanha.id)
              .map((campanha) => {
                const pdfUrl = getPdfUrl(campanha);
                const formatCounts = countFormats(campanha.dados);

                return (
                  <button
                    key={campanha.id}
                    type="button"
                    className="home-history-card home-history-card-auto"
                    onClick={() => onOpenCampaign(campanha)}
                  >
                    <div className="home-history-top">
                      <div>
                        <strong>{campanha.titulo || "Campanha automática"}</strong>
                        <span>{formatarDataHistorico(campanha.criadoEm)}</span>
                      </div>

                      <span className="home-history-format home-history-format-auto">
                        AUTO
                      </span>
                    </div>

                    <div className="home-history-meta">
                      <span>{campanha.totalArtigos || 0} artigos</span>
                      <span>{campanha.store || "Loja"}</span>
                      <span>{getStatusLabel(campanha.status)}</span>
                      <span>A5: {formatCounts.a5} · A6: {formatCounts.a6}</span>
                      {pdfUrl ? <span>PDF disponível</span> : null}
                    </div>

                    <div className="home-history-preview">
                      {campanha.emailSubject ? (
                        <p>Email: {campanha.emailSubject}</p>
                      ) : null}
                      {campanha.emailFrom ? <p>De: {campanha.emailFrom}</p> : null}
                      {Array.isArray(campanha.dados) &&
                        campanha.dados.slice(0, 2).map((item) => (
                          <p key={item.id || `${campanha.id}-${item.codigo || item.artigo}`}>
                            {item.codigo || item.artigo || "-"} — {item.descricao || "-"}
                          </p>
                        ))}
                    </div>
                  </button>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
