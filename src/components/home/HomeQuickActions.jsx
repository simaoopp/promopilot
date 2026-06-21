import React from "react";

const ACTIONS = [
  {
    key: "campaign",
    title: "Criar campanha",
    subtitle: "Montar etiquetas de campanha com PVP3 antes e PVP2 atual.",
    icon: "🏷",
    tone: "primary",
    action: "onOpenCampaign",
  },
  {
    key: "articles",
    title: "Catálogo de artigos",
    subtitle: "Pesquisar, confirmar preços, EAN e descrições.",
    icon: "📦",
    tone: "blue",
    action: "onOpenArticles",
  },
  {
    key: "scan",
    title: "Scan em loja",
    subtitle: "Ler códigos de barras e encontrar artigos rapidamente.",
    icon: "▣",
    tone: "green",
    action: "onOpenScan",
  },
  {
    key: "dossiers",
    title: "Dossiers de orçamento",
    subtitle: "Transformar ORCs em PDFs comerciais com imagem e resumo.",
    icon: "↗",
    tone: "violet",
    action: "onOpenDossiers",
  },
  {
    key: "excel",
    title: "Importação Excel",
    subtitle: "Produção em lote para campanhas preparadas externamente.",
    icon: "📊",
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
        <h2>O que queres fazer agora?</h2>
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
              <span className="home-card-icon pp-action-icon">{item.icon}</span>
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
