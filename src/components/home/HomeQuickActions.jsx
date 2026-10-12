import React from "react";

function ActionIcon({ name }) {
  const paths = {
    campaign: <><path d="M3 3h8l10 10-8 8L3 11Z" /><circle cx="7.5" cy="7.5" r="1" /></>,
    articles: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" /></>,
    scan: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 8v8m4-8v8m3-8v8m3-8v8" /></>,
    dossiers: <><path d="M3 7V5h7l2 2h9v14H3V7Zm5 6h8m-8 4h5" /></>,
    excel: <><path d="M5 3h10l4 4v14H5V3Zm9 0v5h5M8 12h8m-8 4h8m-4-4v8" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const ACTIONS = [
  {
    key: "campaign",
    title: "Criar campanha",
    subtitle: "Escolher artigos, confirmar preços e preparar etiquetas.",
    tone: "primary",
    action: "onOpenCampaign",
  },
  {
    key: "articles",
    title: "Catálogo de artigos",
    subtitle: "Pesquisar, confirmar preços, EAN e descrições.",
    tone: "blue",
    action: "onOpenArticles",
  },
  {
    key: "scan",
    title: "Scan em loja",
    subtitle: "Ler códigos de barras e encontrar artigos rapidamente.",
    tone: "green",
    action: "onOpenScan",
  },
  {
    key: "dossiers",
    title: "Dossiers de orçamento",
    subtitle: "Preparar propostas com imagens, preços e resumo.",
    tone: "violet",
    action: "onOpenDossiers",
  },
  {
    key: "excel",
    title: "Importação Excel",
    subtitle: "Criar etiquetas em lote a partir de uma folha Excel.",
    tone: "slate",
    action: "onOpenExcel",
  },
];

export default function HomeQuickActions({
  onOpenCampaign,
  onOpenArticles,
  onOpenScan,
  onOpenExcel,
  onOpenDossiers,
}) {
  const handlers = {
    onOpenCampaign,
    onOpenArticles,
    onOpenScan,
    onOpenExcel,
    onOpenDossiers,
  };

  return (
    <section className="pp-quick-section" aria-label="Ações rápidas">
      <div className="pp-section-heading">
        <span className="pp-kicker">Ações rápidas</span>
        <h2>O que vamos preparar hoje?</h2>
      </div>

      <div className="home-grid pp-action-grid">
        {ACTIONS.map((item) => {
          const handler = handlers[item.action];

          return (
            <button
              key={item.key}
              type="button"
              className={`home-card pp-action-card pp-action-${item.tone}`}
              onClick={handler}
              disabled={!handler}
            >
              <span className="home-card-icon pp-action-icon"><ActionIcon name={item.key} /></span>
              <span className="home-card-text pp-action-copy">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </span>
              <span className="pp-action-arrow" aria-hidden="true">→</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
