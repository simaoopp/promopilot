import React from "react";
export default function HomeQuickActions({ onOpenCampaign, onOpenArticles, onOpenScan, onOpenExcel }) {
  return <div className="home-grid">
    <button type="button" className="home-card home-card-primary" onClick={onOpenCampaign}><div className="home-card-icon">🏷️</div><div className="home-card-text"><h2>Etiquetas</h2><p>Criar e imprimir etiquetas de campanha.</p></div></button>
    <button type="button" className="home-card" onClick={onOpenArticles}><div className="home-card-icon">📦</div><div className="home-card-text"><h2>Artigos</h2><p>Pesquisar, selecionar e copiar artigos.</p></div></button>
    <button type="button" className="home-card" onClick={onOpenScan}><div className="home-card-icon">📷</div><div className="home-card-text"><h2>Scan rápido</h2><p>Abre logo o menu de scan na página de artigos.</p></div></button>
    <button type="button" className="home-card" onClick={onOpenExcel}><div className="home-card-icon">📊</div><div className="home-card-text"><h2>Etiquetas Excel</h2><p>Importar e imprimir campanhas a partir de ficheiro.</p></div></button>
  </div>;
}
