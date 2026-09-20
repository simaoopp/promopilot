import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getEndedCampaignNotification } from "../services/campaignEndNotificationService";
import "../styles/styles.css";
import "../styles/campaignEnded.css";

function clean(value = "") {
  return String(value ?? "").trim();
}

function formatDate(value = "") {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return clean(value) || "—";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(number)) return clean(value) || "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(number);
}

function itemCode(item = {}) {
  return clean(item.codigo || item.artigo || item.codigoArtigo || item.sku || "");
}

function itemDescription(item = {}) {
  return clean(item.descricao || item.description || item.titulo || "");
}

function itemBefore(item = {}) {
  return (
    item.antes ??
    item.pvp2Antes ??
    item.pvp2_antes ??
    item.pv3 ??
    item.pvp3 ??
    item.precoSemDescontoSelecionado ??
    ""
  );
}

function itemPromo(item = {}) {
  return (
    item.atual ??
    item.pvp2Atual ??
    item.pvp2_atual ??
    item.pvp2 ??
    item.precoComDescontoSelecionado ??
    ""
  );
}

function itemValidity(item = {}, year = "") {
  const start = clean(item.dataInicio || item.data_inicio || "");
  const end = clean(item.dataFim || item.data_fim || "");

  const withYear = (value) =>
    value && !/\d{4}/.test(value) && year ? `${value}/${year}` : value;

  if (!start && !end) return "—";
  return `${withYear(start) || "—"} → ${withYear(end) || "—"}`;
}

export default function CampanhaTerminada() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const data = await getEndedCampaignNotification(id);
        if (mounted) setCampaign(data);
      } catch (loadError) {
        if (mounted) {
          setError(loadError?.message || "Não foi possível carregar a campanha.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [id]);

  const items = useMemo(() => {
    const all = Array.isArray(campaign?.items) ? campaign.items : [];
    const term = clean(query).toLowerCase();

    if (!term) return all;

    return all.filter((item) =>
      [itemCode(item), itemDescription(item), clean(item.ean)]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [campaign, query]);

  async function copyCodes() {
    const codes = (Array.isArray(campaign?.items) ? campaign.items : [])
      .map(itemCode)
      .filter(Boolean)
      .join("|");

    if (!codes) return;

    try {
      await navigator.clipboard.writeText(codes);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (loading) {
    return (
      <div className="page-content campaign-ended-page">
        <div className="campaign-ended-card campaign-ended-loading">
          <div className="campaign-ended-kicker">PromoPilot</div>
          <h1>A carregar campanha…</h1>
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="page-content campaign-ended-page">
        <div className="campaign-ended-card">
          <div className="campaign-ended-kicker">Campanha terminada</div>
          <h1>Não foi possível abrir esta campanha</h1>
          <p>{error || "Campanha não encontrada."}</p>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/Homepage")}>
            Voltar à Homepage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content campaign-ended-page">
      <section className="campaign-ended-hero">
        <div>
          <div className="campaign-ended-status">Campanha concluída</div>
          <div className="campaign-ended-kicker">Operações · Loja da Praia</div>
          <h1>{campaign.title}</h1>
          <p>
            A campanha terminou em <strong>{formatDate(campaign.endDate)}</strong>.
            Esta página mantém o snapshot operacional mesmo depois de sair do histórico curto.
          </p>
        </div>

        <div className="campaign-ended-actions">
          <button className="btn btn-secondary" type="button" onClick={() => navigate("/Homepage")}>
            Homepage
          </button>
          <button className="btn btn-primary" type="button" onClick={copyCodes}>
            {copied ? "Códigos copiados" : "Copiar códigos"}
          </button>
        </div>
      </section>

      <section className="campaign-ended-metrics">
        <article>
          <span>Artigos</span>
          <strong>{campaign.totalItems}</strong>
        </article>
        <article>
          <span>Loja</span>
          <strong>{campaign.store || "Praia"}</strong>
        </article>
        <article>
          <span>Origem</span>
          <strong>{campaign.sourceType === "automatic" ? "Automática" : "Manual"}</strong>
        </article>
        <article>
          <span>Fim</span>
          <strong>{formatDate(campaign.endDate)}</strong>
        </article>
      </section>

      <section className="campaign-ended-card">
        <div className="campaign-ended-section-head">
          <div>
            <div className="campaign-ended-kicker">Snapshot final</div>
            <h2>Artigos da campanha</h2>
          </div>

          <input
            className="campaign-ended-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar código, descrição ou EAN"
          />
        </div>

        <div className="campaign-ended-table-wrap">
          <table className="campaign-ended-table">
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
              {items.map((item, index) => (
                <tr key={item.id || `${itemCode(item)}-${index}`}>
                  <td><strong>{itemCode(item) || "—"}</strong></td>
                  <td>{itemDescription(item) || "Sem descrição"}</td>
                  <td>{formatMoney(itemBefore(item))}</td>
                  <td><strong>{formatMoney(itemPromo(item))}</strong></td>
                  <td>{itemValidity(item, campaign.campaignYear)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!items.length && (
          <div className="campaign-ended-empty">Nenhum artigo corresponde à pesquisa.</div>
        )}
      </section>

      <section className="campaign-ended-next-step">
        <div>
          <span>Fecho operacional</span>
          <strong>Retirar comunicação promocional e validar preços</strong>
        </div>
        <p>
          Confirma a retirada das etiquetas/material da campanha e a reposição dos preços
          aplicáveis em loja.
        </p>
      </section>
    </div>
  );
}
