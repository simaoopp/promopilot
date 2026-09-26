import React, { useMemo, useState } from "react";

function formatDate(value = "") {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function price(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number.parseFloat(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(number);
}

function code(item = {}) {
  return String(item.codigo || item.artigo || item.code || "-").trim() || "-";
}

export default function EndedCampaignDetailsModal({ notification, onClose }) {
  const [copied, setCopied] = useState(false);
  const campaign = notification?.campaign;
  const items = useMemo(
    () => (Array.isArray(campaign?.dados) ? campaign.dados.filter(Boolean) : []),
    [campaign?.dados],
  );

  if (!notification || !campaign) return null;

  const codes = [...new Set(items.map(code).filter((value) => value && value !== "-"))];

  async function copyCodes() {
    if (!codes.length) return;
    try {
      await navigator.clipboard.writeText(codes.join("|"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Não foi possível copiar os códigos da campanha.", error);
    }
  }

  return (
    <div className="popup-overlay" role="dialog" aria-modal="true">
      <div className="popup-card popup-card-historico-pro campaign-ended-modal">
        <div className="popup-header popup-header-pro">
          <div>
            <div className="popup-eyebrow">Campaign Lifecycle</div>
            <div className="campaign-ended-status">Campanha concluída</div>
            <h2>{campaign.titulo || notification.title || "Campanha"}</h2>
            <p className="popup-subtitle">
              Registo imutável da campanha no momento em que terminou.
            </p>
          </div>
          <button type="button" className="popup-close" onClick={onClose}>×</button>
        </div>

        <div className="ai-popup-scroll">
          <div className="popup-status-row">
            <span className="popup-chip">Terminou: {formatDate(notification.endedOn)}</span>
            <span className="popup-chip">Artigos: {notification.totalArticles || items.length}</span>
            <span className="popup-chip">Loja: {notification.store || campaign.store || "-"}</span>
            <span className="popup-chip">
              Origem: {notification.source === "automatic" ? "Automática" : "Manual"}
            </span>
          </div>

          <div className="campaign-ended-callout">
            <div>
              <strong>Revisão de fim de campanha</strong>
              <p>Confirma os materiais promocionais ainda em exposição e consulta abaixo os artigos abrangidos.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={copyCodes} disabled={!codes.length}>
              {copied ? "Códigos copiados" : `Copiar ${codes.length} códigos`}
            </button>
          </div>

          <div className="historico-popup-list">
            {items.length ? items.map((item, index) => (
              <div key={item.id || `${campaign.id}-${code(item)}-${index}`} className="historico-popup-item">
                <div className="historico-popup-main">
                  <strong>{code(item)}</strong>
                  <span>{item.descricao || item.description || "-"}</span>
                  {(item.dataInicio || item.dataFim) ? (
                    <small>{item.dataInicio || "-"} → {item.dataFim || "-"}</small>
                  ) : null}
                </div>
                <div className="historico-popup-prices">
                  <span>Antes: {price(item.antes ?? item.pvpAnterior ?? item.pvp1)}</span>
                  <span>Final: {price(item.atual ?? item.pvpAtual ?? item.pvp2)}</span>
                </div>
              </div>
            )) : (
              <div className="home-history-empty">Não existem artigos guardados neste registo.</div>
            )}
          </div>
        </div>

        <div className="popup-actions popup-actions-pro">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
