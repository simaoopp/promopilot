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

export default function AutomaticCampaignDetailsModal({
  campanha,
  onClose,
  onDuplicate,
  onRequestDelete,
  formatarDataHistorico,
}) {
  if (!campanha) return null;

  const pdfUrl = getPdfUrl(campanha);

  return (
    <div className="popup-overlay" role="dialog" aria-modal="true">
      <div className="popup-card popup-card-historico-pro">
        <div className="popup-header popup-header-pro">
          <div>
            <div className="popup-eyebrow">Histórico de campanhas automático</div>
            <h2>{campanha.titulo || "Campanha automática"}</h2>
            <p className="popup-subtitle">
              Consulta os detalhes da campanha processada automaticamente por email.
            </p>
          </div>

          <button type="button" className="popup-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="ai-popup-scroll">
          <div className="popup-status-row">
            <span className="popup-chip">
              Criada em: {formatarDataHistorico(campanha.criadoEm)}
            </span>
            <span className="popup-chip">Artigos: {campanha.totalArtigos || 0}</span>
            <span className="popup-chip">Loja: {campanha.store || "-"}</span>
            <span className="popup-chip">Estado: {getStatusLabel(campanha.status)}</span>
            <span className="popup-chip">
              Formato base: {String(campanha.formatoEtiqueta || "a6").toUpperCase()}
            </span>
          </div>

          <div className="automatic-campaign-info-grid">
            <div>
              <span>Assunto do email</span>
              <strong>{campanha.emailSubject || campanha.titulo || "-"}</strong>
            </div>
            <div>
              <span>Remetente</span>
              <strong>{campanha.emailFrom || "-"}</strong>
            </div>
            <div>
              <span>Recebido em</span>
              <strong>{formatarDataHistorico(campanha.emailReceivedAt)}</strong>
            </div>
            <div>
              <span>Processado em</span>
              <strong>{formatarDataHistorico(campanha.processedAt)}</strong>
            </div>
          </div>

          {campanha.errorMessage ? (
            <div className="automatic-campaign-error">
              <strong>Erro registado</strong>
              <p>{campanha.errorMessage}</p>
            </div>
          ) : null}

          <div className="historico-popup-list">
            {Array.isArray(campanha.dados) && campanha.dados.length > 0 ? (
              campanha.dados.map((item, index) => (
                <div
                  key={item.id || `${campanha.id}-${item.codigo || item.artigo || index}`}
                  className="historico-popup-item"
                >
                  <div className="historico-popup-main">
                    <strong>{item.codigo || item.artigo || "-"}</strong>
                    <span>{item.descricao || "-"}</span>
                  </div>

                  <div className="historico-popup-prices">
                    <span>Antes: {item.antes ?? "-"}</span>
                    <span>Atual: {item.atual ?? "-"}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="home-history-empty">
                Esta campanha automática não tem artigos guardados.
              </div>
            )}
          </div>
        </div>

        <div className="popup-actions popup-actions-pro">
          {pdfUrl ? (
            <a
              className="btn btn-primary"
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir PDF
            </a>
          ) : null}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onDuplicate(campanha)}
            disabled={!Array.isArray(campanha.dados) || campanha.dados.length === 0}
          >
            Duplicar campanha
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onRequestDelete(campanha)}
          >
            Apagar
          </button>

          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
