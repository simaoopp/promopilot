import React from "react";

function getItemCode(item = {}) {
  return item.codigo || item.artigo || "-";
}

function getBeforePrice(item = {}) {
  return item.antes ?? item.pvp2Antes ?? item.pvp2_antes ?? "-";
}

function getCurrentPrice(item = {}) {
  return item.atual ?? item.pvp2Atual ?? item.pvp2_atual ?? "-";
}

export default function CampaignDetailsModal({
  campanha,
  onClose,
  onDuplicate,
  onRequestDelete,
  formatarDataHistorico,
}) {
  if (!campanha) return null;

  const terminou = campanha.campaignEndAt && new Date(campanha.campaignEndAt).getTime() <= Date.now();

  return (
    <div className="popup-overlay" role="dialog" aria-modal="true">
      <div className="popup-card popup-card-historico-pro">
        <div className="popup-header popup-header-pro">
          <div>
            <div className="popup-eyebrow">Histórico de campanhas</div>
            <h2>{campanha.titulo || "Campanha"}</h2>
            <p className="popup-subtitle">
              Consulta os detalhes e duplica a campanha para voltar a editar.
            </p>
          </div>
          <button type="button" className="popup-close" onClick={onClose}>×</button>
        </div>

        <div className="ai-popup-scroll">
          <div className="popup-status-row">
            {terminou ? <span className="popup-chip">Estado: Concluída</span> : null}
            <span className="popup-chip">Criada em: {formatarDataHistorico(campanha.criadoEm)}</span>
            {campanha.campaignEndAt ? (
              <span className="popup-chip">Fim: {formatarDataHistorico(campanha.campaignEndAt)}</span>
            ) : null}
            <span className="popup-chip">Artigos: {campanha.totalArtigos || 0}</span>
            <span className="popup-chip">Formato base: {String(campanha.formatoEtiqueta || "a6").toUpperCase()}</span>
            <span className="popup-chip">Validade: {campanha.anoValidade || "-"}</span>
          </div>

          <div className="historico-popup-list">
            {Array.isArray(campanha.dados) && campanha.dados.map((item, index) => (
              <div key={item.id || `${campanha.id}-${getItemCode(item)}-${index}`} className="historico-popup-item">
                <div className="historico-popup-main">
                  <strong>{getItemCode(item)}</strong>
                  <span>{item.descricao || "-"}</span>
                </div>
                <div className="historico-popup-prices">
                  <span>Antes: {getBeforePrice(item)}</span>
                  <span>Atual: {getCurrentPrice(item)}</span>
                  {item.dataFim ? <span>Fim: {item.dataFim}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="popup-actions popup-actions-pro">
          <button type="button" className="btn btn-primary" onClick={() => onDuplicate(campanha)}>
            Duplicar campanha
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onRequestDelete(campanha)}>
            Apagar
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
