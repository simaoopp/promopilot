import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCampaignEndNotification } from "../services/campaignLifecycleService";
import "../styles/campaignEnd.css";

function formatDate(value = "") {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || "—";
}

function codeOf(item = {}) {
  return item.codigo || item.artigo || item.codigoInterno || item.articleCode || "—";
}

function descriptionOf(item = {}) {
  return item.descricao || item.description || item.titulo || item.designacao || "Artigo";
}

function priceOf(item = {}) {
  const value = item.atual ?? item.precoAtual ?? item.preco ?? item.pvp2 ?? item.newPrice;
  if (value === undefined || value === null || value === "") return "—";
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? `${number.toFixed(2).replace(".", ",")} €` : String(value);
}

export default function CampaignEndedDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getCampaignEndNotification(id)
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar a campanha."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const campaign = data?.campaign || {};
  const notification = data?.notification || {};
  const items = useMemo(() => (Array.isArray(campaign.dados) ? campaign.dados : []), [campaign.dados]);

  return (
    <main className="campaign-ended-page">
      <section className="campaign-ended-shell">
        <button type="button" className="campaign-ended-back" onClick={() => navigate("/Homepage")}>← Voltar ao início</button>

        {loading && <div className="campaign-ended-state">A carregar campanha…</div>}
        {!loading && error && <div className="campaign-ended-state campaign-ended-error">{error}</div>}

        {!loading && !error && data && (
          <>
            <header className="campaign-ended-hero">
              <div>
                <span className="campaign-ended-kicker">Campaign lifecycle · Loja da Praia</span>
                <h1>{campaign.titulo || notification.title || "Campanha terminada"}</h1>
                <p>A campanha terminou. Este registo mantém o snapshot usado no momento da notificação.</p>
              </div>
              <span className="campaign-ended-badge">Concluída</span>
            </header>

            <div className="campaign-ended-metrics">
              <article><span>Fim da campanha</span><strong>{formatDate(notification.campaignEndDate)}</strong></article>
              <article><span>Artigos</span><strong>{campaign.totalArtigos ?? items.length}</strong></article>
              <article><span>Loja</span><strong>{campaign.store || notification.store || "Loja da Praia"}</strong></article>
              <article><span>Origem</span><strong>{notification.source === "automatic" ? "Automática" : "Manual"}</strong></article>
            </div>

            <section className="campaign-ended-card">
              <div className="campaign-ended-card-header">
                <div><span>Detalhe operacional</span><h2>Artigos da campanha</h2></div>
                <strong>{items.length}</strong>
              </div>

              <div className="campaign-ended-table-wrap">
                <table className="campaign-ended-table">
                  <thead><tr><th>Código</th><th>Descrição</th><th>Preço</th><th>Data fim</th></tr></thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.id || `${codeOf(item)}-${index}`}>
                        <td><strong>{codeOf(item)}</strong></td>
                        <td>{descriptionOf(item)}</td>
                        <td>{priceOf(item)}</td>
                        <td>{item.dataFim || item.data_fim || "—"}</td>
                      </tr>
                    ))}
                    {!items.length && <tr><td colSpan="4" className="campaign-ended-empty">Sem artigos guardados no snapshot.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
