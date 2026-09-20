import React, { useMemo, useState } from "react";
import "../../styles/campaignEnd.css";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Atlantic/Azores",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function codeOf(item = {}) {
  return String(item.codigo || item.artigo || item.article_code || "").trim();
}

function descriptionOf(item = {}) {
  return String(item.descricao || item.description || item.titulo_oficial || "").trim();
}

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  let parsed;
  if (typeof value === "number") {
    parsed = value;
  } else {
    const text = String(value).trim().replace(/\s/g, "").replace(/€/g, "");
    parsed = Number.parseFloat(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  }
  if (!Number.isFinite(parsed)) return String(value);
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(parsed);
}

function oldPrice(item = {}) {
  return item.antes ?? item.pvp3 ?? item.old_price ?? "";
}

function newPrice(item = {}) {
  return item.atual ?? item.pvp2 ?? item.new_price ?? "";
}

function validity(item = {}, year) {
  const start = String(item.dataInicio || item.data_inicio || "").trim();
  const end = String(item.dataFim || item.data_fim || "").trim();
  const suffix = (value) => value && value.split("/").length < 3 && year ? `${value}/${year}` : value;
  if (start && end) return `${suffix(start)} → ${suffix(end)}`;
  if (end) return `Até ${suffix(end)}`;
  if (start) return `Desde ${suffix(start)}`;
  return "—";
}

export default function EndedCampaignDetailsModal({ campaign, onClose, onDuplicate }) {
  const [copied, setCopied] = useState(false);
  const items = Array.isArray(campaign?.dados) ? campaign.dados : [];

  const codes = useMemo(
    () => [...new Set(items.map(codeOf).filter(Boolean))],
    [items],
  );

  if (!campaign) return null;

  async function copyCodes() {
    if (!codes.length) return;
    try {
      await navigator.clipboard.writeText(codes.join(" | "));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="popup-overlay campaign-end-overlay" role="dialog" aria-modal="true">
      <div className="campaign-end-modal">
        <header className="campaign-end-modal-header">
          <div>
            <div className="campaign-end-kicker">Campaign lifecycle</div>
            <div className="campaign-end-title-row">
              <h2>{campaign.titulo || "Campanha"}</h2>
              <span className="campaign-end-status">Concluída</span>
            </div>
            <p>Snapshot final da campanha enviado à equipa da Loja da Praia.</p>
          </div>
          <button type="button" className="popup-close" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <div className="campaign-end-modal-scroll">
          <section className="campaign-end-metrics">
            <article>
              <span>Terminou</span>
              <strong>{formatDate(campaign.terminouEm)}</strong>
            </article>
            <article>
              <span>Origem</span>
              <strong>{campaign.sourceType === "automatic" ? "Automática por email" : "Campanha normal"}</strong>
            </article>
            <article>
              <span>Artigos</span>
              <strong>{campaign.totalArtigos || items.length}</strong>
            </article>
            <article>
              <span>Loja</span>
              <strong>{campaign.store || "Loja da Praia"}</strong>
            </article>
          </section>

          <section className="campaign-end-action-card">
            <div>
              <span>Fecho operacional</span>
              <strong>Confirmar comunicação e preço ativo em loja</strong>
            </div>
            <p>Este arquivo mantém os artigos da campanha mesmo depois de o histórico normal expirar.</p>
          </section>

          <section className="campaign-end-items-section">
            <div className="campaign-end-section-heading">
              <div>
                <h3>Artigos da campanha</h3>
                <p>Códigos, descrição, preço promocional e validade registados no momento da criação.</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={copyCodes} disabled={!codes.length}>
                {copied ? "Códigos copiados" : "Copiar códigos"}
              </button>
            </div>

            <div className="campaign-end-table-wrap">
              <table className="campaign-end-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Artigo</th>
                    <th>Antes</th>
                    <th>Promo</th>
                    <th>Validade</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length ? items.map((item, index) => (
                    <tr key={item.id || `${codeOf(item)}-${index}`}>
                      <td><strong>{codeOf(item) || "—"}</strong></td>
                      <td>{descriptionOf(item) || "—"}</td>
                      <td>{money(oldPrice(item))}</td>
                      <td><strong>{money(newPrice(item))}</strong></td>
                      <td>{validity(item, campaign.anoValidade)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5" className="campaign-end-empty">Sem artigos disponíveis neste snapshot.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer className="campaign-end-modal-footer">
          <span>{campaign.notificadoEm ? `Notificação enviada em ${formatDate(campaign.notificadoEm)}` : "Arquivo de fim de campanha"}</span>
          <div>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
            <button type="button" className="btn btn-primary" onClick={() => onDuplicate?.(campaign)}>Criar nova a partir desta</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
