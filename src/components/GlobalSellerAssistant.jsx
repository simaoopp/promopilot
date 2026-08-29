import React, { useEffect, useMemo, useRef, useState } from "react";
import { askSellerAssistant, searchArtigos } from "../services/artigosService";

const QUICK_QUESTIONS = [
  "Explica-me este produto de forma simples.",
  "Que argumentos devo usar para vender isto?",
  "Quais são os principais pontos fortes deste produto?",
  "Para que tipo de cliente é mais indicado?",
  "Este produto é bom para gaming?",
];

function getArticleLabel(article) {
  const safeArticle = article || {};

  return (
    safeArticle.titulo_oficial ||
    safeArticle.descricao ||
    safeArticle.modelo ||
    safeArticle.artigo ||
    "Artigo"
  );
}

function Message({ message }) {
  return (
    <div
      className={`global-seller-ai-message ${
        message.role === "user"
          ? "global-seller-ai-message-user"
          : "global-seller-ai-message-assistant"
      }`}
    >
      <div className="global-seller-ai-message-label">
        {message.role === "user" ? "Tu" : "✨ Assistente"}
      </div>
      <div className="global-seller-ai-message-content">{message.content}</div>
    </div>
  );
}

export default function GlobalSellerAssistant() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState("");

  const conversationRef = useRef(null);
  const requestIdRef = useRef(0);

  const selectedArticleLabel = useMemo(
    () => getArticleLabel(selectedArticle),
    [selectedArticle],
  );

  useEffect(() => {
    if (!conversationRef.current) return;
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, answerLoading]);

  async function runSearch() {
    const query = String(searchTerm || "").trim();

    if (query.length < 2 || searchLoading) {
      if (query.length < 2) {
        setSearchError("Escreve pelo menos 2 caracteres.");
      }
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setSearchLoading(true);
    setSearchError("");

    try {
      const data = await searchArtigos({
        q: query,
        limit: 8,
        offset: 0,
      });

      if (requestId !== requestIdRef.current) return;

      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.artigos)
          ? data.artigos
          : [];

      setSearchResults(items);

      if (!items.length) {
        setSearchError("Não encontrei artigos com essa pesquisa.");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      console.error("Erro a pesquisar artigo para assistente:", error);
      setSearchResults([]);
      setSearchError(error?.message || "Não foi possível pesquisar artigos.");
    } finally {
      if (requestId === requestIdRef.current) {
        setSearchLoading(false);
      }
    }
  }

  function selectArticle(article) {
    setSelectedArticle(article);
    setSearchResults([]);
    setSearchError("");
    setQuestion("");
    setMessages([]);
    setAnswerError("");
  }

  function changeArticle() {
    setSelectedArticle(null);
    setQuestion("");
    setMessages([]);
    setAnswerError("");
    setSearchResults([]);
    setTimeout(() => {
      const input = document.getElementById("global-seller-ai-search");
      input?.focus();
    }, 0);
  }

  async function ask(rawQuestion = question) {
    const pergunta = String(rawQuestion || "").trim();

    if (!selectedArticle || !pergunta || answerLoading) return;

    const history = messages.slice(-8);

    setQuestion("");
    setAnswerError("");
    setMessages((current) => [
      ...current,
      { role: "user", content: pergunta },
    ]);
    setAnswerLoading(true);

    try {
      const data = await askSellerAssistant({
        artigoInterno: selectedArticle.artigo || "",
        codigoBarras:
          selectedArticle.codigoBarras ||
          selectedArticle.codigo_barras ||
          "",
        pergunta,
        historico: history,
      });

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data?.resposta || "Não foi possível gerar uma resposta.",
        },
      ]);
    } catch (error) {
      console.error("Erro no assistente do vendedor:", error);
      setAnswerError(
        error?.message ||
          "Não foi possível obter uma resposta do assistente.",
      );
    } finally {
      setAnswerLoading(false);
    }
  }

  function handleSearchKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  }

  function handleQuestionKeyDown(event) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      ask();
    }
  }

  return (
    <div className={`global-seller-ai ${open ? "is-open" : ""}`}>
      {open && (
        <section
          className="global-seller-ai-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Assistente do vendedor"
        >
          <header className="global-seller-ai-header">
            <div>
              <span className="global-seller-ai-eyebrow">PromoPilot · Assistente IA</span>
              <h2>✨ Assistente do vendedor</h2>
              <p>Respostas com base na ficha dos artigos.</p>
            </div>

            <button
              type="button"
              className="global-seller-ai-close"
              onClick={() => setOpen(false)}
              aria-label="Minimizar assistente"
            >
              ×
            </button>
          </header>

          <div className="global-seller-ai-body">
            {!selectedArticle ? (
              <div className="global-seller-ai-search-step">
                <div className="global-seller-ai-intro">
                  <strong>Primeiro escolhe um artigo</strong>
                  <span>
                    Pesquisa por código, EAN, modelo ou descrição.
                  </span>
                </div>

                <div className="global-seller-ai-search-row">
                  <input
                    id="global-seller-ai-search"
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Ex.: 01.673..., OLED55..., 8806..."
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={runSearch}
                    disabled={searchLoading || searchTerm.trim().length < 2}
                  >
                    {searchLoading ? "..." : "Pesquisar"}
                  </button>
                </div>

                {searchError && (
                  <p className="global-seller-ai-error">{searchError}</p>
                )}

                {searchResults.length > 0 && (
                  <div className="global-seller-ai-results">
                    {searchResults.map((article, index) => (
                      <button
                        type="button"
                        className="global-seller-ai-result"
                        key={`${article.artigo || "article"}-${index}`}
                        onClick={() => selectArticle(article)}
                      >
                        <span className="global-seller-ai-result-main">
                          <strong>{getArticleLabel(article)}</strong>
                          <small>
                            {article.artigo || "Sem código"}
                            {article.modelo ? ` · ${article.modelo}` : ""}
                          </small>
                        </span>
                        <span className="global-seller-ai-result-arrow">›</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="global-seller-ai-selected">
                  <div>
                    <span>Artigo selecionado</span>
                    <strong>{selectedArticleLabel}</strong>
                    <small>
                      {selectedArticle.artigo || "Sem código"}
                      {selectedArticle.modelo
                        ? ` · ${selectedArticle.modelo}`
                        : ""}
                    </small>
                  </div>

                  <button
                    type="button"
                    className="global-seller-ai-change"
                    onClick={changeArticle}
                  >
                    Trocar
                  </button>
                </div>

                {messages.length === 0 && (
                  <div className="global-seller-ai-quick-list">
                    {QUICK_QUESTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => ask(item)}
                        disabled={answerLoading}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}

                {messages.length > 0 && (
                  <div
                    ref={conversationRef}
                    className="global-seller-ai-conversation"
                    aria-live="polite"
                  >
                    {messages.map((message, index) => (
                      <Message
                        key={`${message.role}-${index}-${message.content.slice(0, 24)}`}
                        message={message}
                      />
                    ))}

                    {answerLoading && (
                      <div className="global-seller-ai-message global-seller-ai-message-assistant">
                        <div className="global-seller-ai-message-label">
                          ✨ Assistente
                        </div>
                        <div className="global-seller-ai-thinking">
                          A preparar uma resposta a partir da ficha…
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {answerError && (
                  <p className="global-seller-ai-error">{answerError}</p>
                )}

                <div className="global-seller-ai-composer">
                  <textarea
                    rows={3}
                    maxLength={900}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={handleQuestionKeyDown}
                    disabled={answerLoading}
                    placeholder='Ex.: "Que argumentos devo usar para vender este produto?"'
                  />

                  <div className="global-seller-ai-composer-footer">
                    <small>Ctrl/Cmd + Enter</small>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => ask()}
                      disabled={answerLoading || !question.trim()}
                    >
                      {answerLoading ? "A responder…" : "Perguntar"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <button
        type="button"
        className="global-seller-ai-launcher no-print"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Minimizar assistente" : "Abrir assistente do vendedor"}
      >
        <span className="global-seller-ai-launcher-icon">✨</span>
        <span className="global-seller-ai-launcher-copy">
          <strong>Assistente IA</strong>
          <small>Vendas</small>
        </span>
      </button>
    </div>
  );
}
