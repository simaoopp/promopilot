import React from "react";
export default function HomeSummarySection({ totalArtigos, totalCampanhas }) {
  return <div className="home-section"><div className="table-card-header"><h2>Resumo</h2></div><div className="resumo-cards"><div className="resumo-card"><span className="resumo-label">Artigos em catálogo</span><strong>{totalArtigos}</strong></div><div className="resumo-card"><span className="resumo-label">Campanhas recentes</span><strong>{totalCampanhas}</strong></div><div className="resumo-card"><span className="resumo-label">Entrada mais rápida</span><strong>Pesquisa e detalhes</strong></div></div></div>;
}
