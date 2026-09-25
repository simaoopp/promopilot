import React, { useMemo, useState } from "react";
import "../../styles/campaign-end.css";

function price(value) {
  if (value === null || value === undefined || value === "") return "—";
  const raw = String(value).trim();
  if (!raw) return "—";
  if (raw.includes("€")) return raw;
  const numeric = Number(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return raw;
  return `${numeric.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function code(item = {}) {
  return item.codigo || item.artigo || item.article_code || "—";
}

function description(item = {}) {
  return item.descricao || item.description || "Sem descrição";
}

function before(item = {}) {
  return item.pvp2Antes ?? item.antes ?? item.pvp3 ?? item.pv3 ?? item.old_price ?? "";
}

function current(item = {}) {
  return item.pvp2Atual ?? item.atual ?? item.pvp2 ?? item.new_price ?? "";
}

function datePt(value = "") {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || "—";
}

export default function CampaignEndDetailsModal({ payload, onClose, onDuplicate }) {
  const [copied, setCopied] = useState(false);
  const campaign = payload?.campaign;
  const notification = payload?.notification;
  const items = useMemo(
    () => (Array.isArray(campaign?.dados) ? campaign.dados.filter(Boolean) : []),
    [campaign?.dados],
  );

  if (!campaign || !notification) return null;

  async function copyCodes() {
    const codes = items.map(code).filter((value) => value && value !== "—");
    if (!codes.length) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="popup-overlay campaign-end-overlay" role="dialog" aria-modal="true">
      <div className="popup-card campaign-end-modal">
        <div className="campaign-end-header">
          <div>
            <span className="campaign-end-status">Campanha concluída</span>
            <h2>{campaign.titulo || notification.title || "Campanha"}</h2>
            <p>A campanha terminou. Consulta o detalhe operacional antes de remover a comunicação em loja.</p>
          </div>
          <button type="button" className="popup-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="campaign-end-metrics">
          <div><span>Terminou em</span><strong>{datePt(notification.campaignEndDate)}</strong></div>
          <div><span>Artigos</span><strong>{campaign.totalArtigos ?? items.length}</strong></div>
          <div><span>Loja</span><strong>{campaign.store || notification.store || "Praia"}</strong></div>
          <div><span>Origem</span><strong>{notification.source === "automatic" ? "Automática" : "Manual"}</strong></div>
        </div>

        <div className="campaign-end-advice">
          <strong>Checklist de fecho</strong>
          <span>Retirar etiquetas promocionais · confirmar PVP atual · validar exceções antes da abertura de loja.</span>
        </div>

        <div className="campaign-end-toolbar">
          <h3>Artigos da campanha</h3>
          <button type="button" className="btn btn-secondary" onClick={copyCodes} disabled={!items.length}>
            {copied ? "Códigos copiados" : "Copiar códigos"}
          </button>
        </div>

        <div className="campaign-end-list">
          {items.length ? items.map((item, index) => (
            <div className="campaign-end-item" key={item.id || `${code(item)}-${index}`}>
              <div className="campaign-end-item-main">
                <strong>{code(item)}</strong>
                <span>{description(item)}</span>
                {item.info ? <small>{item.info}</small> : null}
              </div>
              <div className="campaign-end-item-prices">
                <span><small>Antes</small>{price(before(item))}</span>
                <span><small>Promo</small><strong>{price(current(item))}</strong></span>
              </div>
            </div>
          )) : (
            <div className="campaign-end-empty">Não existem artigos guardados nesta campanha.</div>
          )}
        </div>

        <div className="popup-actions popup-actions-pro campaign-end-actions">
          {onDuplicate ? (
            <button type="button" className="btn btn-primary" onClick={() => onDuplicate(campaign)} disabled={!items.length}>
              Duplicar como nova campanha
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
