import React, { useMemo, useState } from "react";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Atlantic/Azores",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function itemCode(item = {}) {
  return String(item.codigo || item.artigo || item.code || "").trim() || "—";
}

function itemDescription(item = {}) {
  return String(item.descricao || item.description || item.titulo_oficial || "").trim() || "Artigo";
}

function itemPrice(item = {}) {
  const raw = item.atual ?? item.pvp2Atual ?? item.pvp2 ?? item.preco ?? "";
  const text = String(raw ?? "").trim();
  if (!text) return "—";

  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const number = Number(normalized);

  if (!Number.isFinite(number)) return text;
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(number);
}

function itemEndDate(item = {}) {
  return item.dataFim || item.data_fim || item.fim || item.endDate || "—";
}

export default function CampaignEndedDetailsModal({ campaign, loading, error, onClose }) {
  const [copied, setCopied] = useState(false);
  const items = useMemo(
    () => (Array.isArray(campaign?.items) ? campaign.items.filter(Boolean) : []),
    [campaign],
  );

  async function copyCodes() {
    const codes = items.map(itemCode).filter((code) => code && code !== "—");
    if (!codes.length) return;

    try {
      await navigator.clipboard.writeText(codes.join("|"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      console.error("Não foi possível copiar os códigos da campanha.", copyError);
    }
  }

  return (
    <div className="popup-overlay campaign-ended-overlay" role="dialog" aria-modal="true" aria-labelledby="campaign-ended-title">
      <div className="popup-card campaign-ended-modal">
        <header className="campaign-ended-header">
          <div>
            <span className="campaign-ended-kicker">Campanha concluída</span>
            <h2 id="campaign-ended-title">{campaign?.title || (loading ? "A carregar campanha…" : "Detalhe da campanha")}</h2>
            <p>
              Informação operacional de fim de campanha para a Loja da Praia.
            </p>
          </div>
          <button type="button" className="popup-close" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        {loading ? (
          <div className="campaign-ended-state">
            <span className="spinner" aria-hidden="true" />
            <strong>A carregar os detalhes da campanha…</strong>
          </div>
        ) : error ? (
          <div className="campaign-ended-state campaign-ended-state-error">
            <strong>Não foi possível abrir esta campanha.</strong>
            <span>{error}</span>
          </div>
        ) : campaign ? (
          <div className="campaign-ended-scroll">
            <section className="campaign-ended-summary">
              <div>
                <span>Terminou em</span>
                <strong>{formatDate(campaign.campaign_end_at)}</strong>
              </div>
              <div>
                <span>Loja</span>
                <strong>{campaign.store || "Loja da Praia"}</strong>
              </div>
              <div>
                <span>Artigos</span>
                <strong>{campaign.total_items ?? items.length}</strong>
              </div>
              <div>
                <span>Origem</span>
                <strong>{campaign.source_type === "automatic_campaigns" ? "Email automático" : "Campanha manual"}</strong>
              </div>
            </section>

            <section className="campaign-ended-action-card">
              <div>
                <span>Checklist de fecho</span>
                <strong>Confirmar a retirada da comunicação promocional em loja</strong>
                <p>Revê os artigos abaixo e confirma preços, etiquetas, cartazes e exposição após o fim da campanha.</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={copyCodes} disabled={!items.length}>
                {copied ? "Códigos copiados" : "Copiar códigos"}
              </button>
            </section>

            <section className="campaign-ended-items-section">
              <div className="campaign-ended-section-title">
                <div>
                  <span>Artigos abrangidos</span>
                  <strong>{items.length} artigo{items.length === 1 ? "" : "s"}</strong>
                </div>
              </div>

              {items.length ? (
                <div className="campaign-ended-items">
                  {items.map((item, index) => (
                    <article key={`${itemCode(item)}-${index}`} className="campaign-ended-item">
                      <div className="campaign-ended-item-main">
                        <span className="campaign-ended-code">{itemCode(item)}</span>
                        <strong>{itemDescription(item)}</strong>
                        {item.informacao || item.info ? <p>{item.informacao || item.info}</p> : null}
                      </div>
                      <div className="campaign-ended-item-meta">
                        <span>Preço campanha</span>
                        <strong>{itemPrice(item)}</strong>
                        <small>Fim: {itemEndDate(item)}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="home-history-empty">Não existem artigos guardados nesta campanha.</div>
              )}
            </section>
          </div>
        ) : null}

        <footer className="popup-actions popup-actions-pro campaign-ended-footer">
          <span>PromoPilot · Gestão operacional de campanhas</span>
          <button type="button" className="btn btn-primary" onClick={onClose}>Fechar</button>
        </footer>
      </div>
    </div>
  );
}
