import React from "react";
import { PROMOPILOT_BRAND } from "../../brand/promopilot";

export default function HomeHero({
  pesquisa,
  onPesquisaChange,
  onPesquisaFocus,
  onKeyDown,
  loading,
  erro,
  sugestoes,
  highlightedIndex,
  onSuggestionHover,
  onSuggestionClick,
}) {
  return (
    <section className="home-hero pp-home-hero">
      <div className="pp-home-hero-copy">
        <span className="pp-kicker">Bom trabalho</span>
        <h1 className="page-title">{PROMOPILOT_BRAND.appName}</h1>
        <p className="page-subtitle">
          Escolha o que precisa fazer: criar etiquetas, pesquisar um artigo,
          preparar uma campanha ou montar uma proposta para o cliente.
        </p>

        <div className="pp-hero-metrics" aria-label="Atalhos de trabalho">
          <span><strong>Campanhas</strong> com preço antes e preço atual</span>
          <span><strong>Artigos</strong> por código, EAN ou descrição</span>
          <span><strong>Dossiers</strong> para apresentar orçamentos</span>
        </div>
      </div>

      <div className="pp-home-command-card">
        <div className="pp-command-header">
          <span>Pesquisar artigo</span>
          {loading && <small>A carregar...</small>}
        </div>

        {erro && <p className="ai-error">{erro}</p>}

        <div className="home-search-wrap pp-search-wrap">
          <input
            id="home-search-input"
            type="text"
            value={pesquisa}
            onChange={(e) => onPesquisaChange(e.target.value)}
            onFocus={onPesquisaFocus}
            onKeyDown={onKeyDown}
            placeholder="Código, EAN, marca, modelo ou descrição"
            className="home-search-input pp-command-input"
            autoComplete="off"
            aria-label="Pesquisar artigos"
            aria-autocomplete="list"
            aria-controls="home-search-suggestions"
            aria-activedescendant={highlightedIndex >= 0 ? `home-suggestion-${highlightedIndex}` : undefined}
          />
        </div>

        <p className="pp-command-hint">
          Escreva ou leia o código de barras. Enter abre a pesquisa completa.
        </p>

        {sugestoes.length > 0 && (
          <div id="home-search-suggestions" className="home-search-suggestions pp-search-suggestions" role="listbox">
            {sugestoes.map((item, index) => (
              <button
                key={`${item.artigo}-${index}`}
                id={`home-suggestion-${index}`}
                type="button"
                role="option"
                aria-selected={highlightedIndex === index}
                className={`home-suggestion-item ${highlightedIndex === index ? "is-active" : ""}`}
                onMouseEnter={() => onSuggestionHover(index)}
                onClick={() => onSuggestionClick(item)}
              >
                <strong>{item.artigo}</strong>
                <span>{item.descricao}</span>
                {item.codigoBarras && <small>EAN: {item.codigoBarras}</small>}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
