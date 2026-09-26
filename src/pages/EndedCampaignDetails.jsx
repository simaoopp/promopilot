import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getEndedCampaignDetails } from "../services/campaignLifecycleService";
import "../styles/campaignEnd.css";

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Atlantic/Azores",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return "—";
  return raw.includes("€") ? raw : `${raw} €`;
}

function normalizeItem(item = {}) {
  return {
    id: item.id || item.codigo || item.artigo || Math.random().toString(36),
    code: item.codigo || item.artigo || "—",
    description: item.descricao || "Sem descrição",
    before: item.antes ?? item.pvp2Antes ?? item.pvp2AntesRaw ?? "",
    current: item.atual ?? item.pvp2Atual ?? item.pvp2AtualRaw ?? "",
    start: item.dataInicio || "",
    end: item.dataFim || "",
    info: item.info || item.informacao || "",
  };
}

export default function EndedCampaignDetails() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getEndedCampaignDetails(id)
      .then((item) => active && setCampaign(item))
      .catch((requestError) => active && setError(requestError?.message || "Não foi possível carregar a campanha."))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [id]);

  const items = useMemo(() => safeArray(campaign?.dados).map(normalizeItem), [campaign]);
  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      `${item.code} ${item.description} ${item.info}`.toLowerCase().includes(term),
    );
  }, [items, query]);

  if (loading) {
    return <main className="campaign-end-page"><div className="campaign-end-state">A carregar campanha…</div></main>;
  }

  if (error || !campaign) {
    return (
      <main className="campaign-end-page">
        <div className="campaign-end-state campaign-end-state-error">
          <h1>Não foi possível abrir a campanha</h1>
          <p>{error || "Campanha não encontrada."}</p>
          <Link to="/Homepage" className="campaign-end-primary-link">Voltar ao PromoPilot</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="campaign-end-page">
      <section className="campaign-end-hero">
        <div>
          <div className="campaign-end-eyebrow">Campaign lifecycle · concluída</div>
          <h1>{campaign.titulo || "Campanha"}</h1>
          <p>Resumo operacional da campanha terminada para {campaign.store || "a loja"}.</p>
        </div>
        <span className="campaign-end-status">Concluída</span>
      </section>

      <section className="campaign-end-kpis">
        <article><strong>{campaign.total_artigos ?? items.length}</strong><span>Artigos</span></article>
        <article><strong>{formatDate(campaign.ends_at)}</strong><span>Fim da campanha</span></article>
        <article><strong>{campaign.source_table === "automatic_campaigns" ? "Automática" : "Manual"}</strong><span>Origem</span></article>
        <article><strong>{campaign.created_by || "PromoPilot"}</strong><span>Criada por</span></article>
      </section>

      <section className="campaign-end-action-card">
        <div>
          <span>Checklist pós-campanha</span>
          <h2>Fechar a campanha em loja</h2>
          <p>Confirma a comunicação promocional, revê os preços e atualiza as etiquetas dos artigos quando aplicável.</p>
        </div>
        <Link to="/Homepage" className="campaign-end-secondary-link">Ir para o início</Link>
      </section>

      <section className="campaign-end-list-card">
        <div className="campaign-end-list-header">
          <div><span>Inventário da campanha</span><h2>Artigos</h2></div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar código ou descrição"
            aria-label="Pesquisar artigos da campanha"
          />
        </div>

        <div className="campaign-end-table-wrap">
          <table className="campaign-end-table">
            <thead><tr><th>Código</th><th>Descrição</th><th>Antes</th><th>Campanha</th><th>Validade</th><th>Informação</th></tr></thead>
            <tbody>
              {visibleItems.map((item, index) => (
                <tr key={`${item.id}-${index}`}>
                  <td><strong>{item.code}</strong></td>
                  <td>{item.description}</td>
                  <td>{formatPrice(item.before)}</td>
                  <td><strong>{formatPrice(item.current)}</strong></td>
                  <td>{item.start || "—"} → {item.end || "—"}</td>
                  <td>{item.info || "—"}</td>
                </tr>
              ))}
              {!visibleItems.length && <tr><td colSpan="6" className="campaign-end-empty">Sem artigos para apresentar.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
