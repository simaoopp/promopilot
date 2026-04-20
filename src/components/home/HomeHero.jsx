import React from "react";
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
    <div className="home-hero">
      <div className="home-hero-content">
        <h1 className="page-title">Expert Admin</h1>
        <p className="page-subtitle">Pesquisa artigos e abre os detalhes sem sair da homepage.</p>
        {loading && <p className="page-subtitle">A preparar pesquisa rápida...</p>}
        {erro && <p className="ai-error">{erro}</p>}
        <div className="home-search-wrap">
          <input
            id="home-search-input"
            type="text"
            value={pesquisa}
            onChange={(e) => onPesquisaChange(e.target.value)}
            onFocus={onPesquisaFocus}
            onKeyDown={onKeyDown}
            placeholder="Pesquisar por artigo, descrição, modelo, EAN ou marca"
            className="home-search-input"
            autoComplete="off"
            aria-label="Pesquisar artigos"
            aria-autocomplete="list"
            aria-controls="home-search-suggestions"
            aria-activedescendant={highlightedIndex >= 0 ? `home-suggestion-${highlightedIndex}` : undefined}
          />
        </div>
        {sugestoes.length > 0 && (
          <div id="home-search-suggestions" className="home-search-suggestions" role="listbox">
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
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
