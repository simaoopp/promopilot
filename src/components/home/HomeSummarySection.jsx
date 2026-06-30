import React from "react";

export default function HomeSummarySection() {
  const cards = [
    {
      label: "Criar uma campanha",
      text: "Escolha os artigos, confirme os preços e imprima as etiquetas.",
    },
    {
      label: "Confirmar um artigo",
      text: "Pesquise por código, EAN, marca ou descrição antes de avançar.",
    },
    {
      label: "Preparar uma proposta",
      text: "Use os dossiers para apresentar melhor os orçamentos ao cliente.",
    },
  ];

  return (
    <section className="home-section pp-summary-section">
      <div className="table-card-header pp-card-header">
        <div>
          <span className="pp-kicker">Atalhos úteis</span>
          <h2>Comece por aqui</h2>
        </div>
      </div>

      <div className="resumo-cards pp-summary-grid">
        {cards.map((card) => (
          <article key={card.label} className="resumo-card pp-summary-card">
            <span className="resumo-label">{card.label}</span>
            <p>{card.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
