import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import artigosData from "../data/artigos.json";
import "../styles/styles.css";

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasUsefulTechData(item) {
  return !!(
    item?.caracteristicas_tecnicas &&
    typeof item.caracteristicas_tecnicas === "object" &&
    Object.keys(item.caracteristicas_tecnicas).length > 0
  );
}

function mapArtigoToAiResultado(item) {
  return {
    titulo: item.titulo_oficial || item.descricao || item.artigo || "",
    categoria: item.categoria || "",
    marca: item.marca || "",
    modelo: item.modelo || "",
    caracteristicas_tecnicas: item.caracteristicas_tecnicas || {},
    resumo_vendedor: item.resumo_vendedor || "",
    observacoes: item.observacoes_ia || "",
    fontes: item.fonte_oficial ? [item.fonte_oficial] : [],
  };
}

export default function HomePage() {
  const navigate = useNavigate();

  const [pesquisa, setPesquisa] = useState("");
  const [artigoSelecionado, setArtigoSelecionado] = useState(null);
  const [aiAberta, setAiAberta] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErro, setAiErro] = useState("");
  const [aiResultado, setAiResultado] = useState(null);

  const artigos = artigosData?.artigos || [];

  const sugestoes = useMemo(() => {
    const termo = normalizarTexto(pesquisa);
    if (termo.length < 2) return [];

    return artigos
      .filter((item) => {
        const artigo = normalizarTexto(item.artigo);
        const descricao = normalizarTexto(item.descricao);
        const codigoBarras = normalizarTexto(item.codigoBarras);

        return (
          artigo.includes(termo) ||
          descricao.includes(termo) ||
          codigoBarras.includes(termo)
        );
      })
      .slice(0, 5);
  }, [pesquisa, artigos]);

  function abrirPesquisaCompleta() {
    if (!pesquisa.trim()) {
      navigate("/Etiquetas");
      return;
    }

    navigate(`/Etiquetas?search=${encodeURIComponent(pesquisa.trim())}`);
  }

  function abrirPopupArtigo(item) {
    setArtigoSelecionado(item);
    setAiAberta(false);
    setAiErro("");
    setAiResultado(null);
    setAiLoading(false);
  }

  function fecharPopupArtigo() {
    setArtigoSelecionado(null);
    setAiAberta(false);
    setAiErro("");
    setAiResultado(null);
    setAiLoading(false);
  }

  async function abrirPopupAI() {
    if (!artigoSelecionado) return;

    setAiAberta(true);
    setAiErro("");
    setAiResultado(null);

    // Se já existem características no JSON, mostrar logo sem chamar backend
    if (hasUsefulTechData(artigoSelecionado)) {
      setAiResultado(mapArtigoToAiResultado(artigoSelecionado));
      return;
    }

    setAiLoading(true);

    try {
      const response = await fetch("http://localhost:3001/api/ai-produto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          artigoInterno: artigoSelecionado.artigo || "",
          descricao: artigoSelecionado.descricao || "",
          codigoBarras: artigoSelecionado.codigoBarras || "",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.detalhe || "Erro no servidor.");
      }

      if (!data?.ok) {
        throw new Error(data?.error || "Resposta inválida da AI.");
      }

      setAiResultado(data.resultado || null);

      // Atualiza o artigo em memória para evitar nova chamada nesta sessão
      setArtigoSelecionado((prev) =>
        prev
          ? {
              ...prev,
              fonte_oficial:
                data?.artigoAtualizado?.fonte_oficial || prev.fonte_oficial,
              raw_hash: data?.artigoAtualizado?.raw_hash || prev.raw_hash,
              ultima_atualizacao:
                data?.artigoAtualizado?.ultima_atualizacao ||
                prev.ultima_atualizacao,
              titulo_oficial:
                data?.artigoAtualizado?.titulo_oficial || prev.titulo_oficial,
              descricao_oficial:
                data?.artigoAtualizado?.descricao_oficial ||
                prev.descricao_oficial,
              caracteristicas_tecnicas:
                data?.artigoAtualizado?.caracteristicas_tecnicas ||
                prev.caracteristicas_tecnicas,
              resumo_vendedor:
                data?.artigoAtualizado?.resumo_vendedor || prev.resumo_vendedor,
              observacoes_ia:
                data?.artigoAtualizado?.observacoes_ia || prev.observacoes_ia,
            }
          : prev,
      );
    } catch (error) {
      console.error("Erro completo AI:");
      console.error("message:", error?.message);
      console.error("name:", error?.name);
      console.error("status:", error?.status);
      console.error("code:", error?.code);
      console.error("stack:", error?.stack);

      if (error?.cause) {
        console.error("cause:", error.cause);
      }

      if (error?.response) {
        console.error("response:", JSON.stringify(error.response, null, 2));
      }

      if (error?.errorDetails) {
        console.error(
          "errorDetails:",
          JSON.stringify(error.errorDetails, null, 2),
        );
      }

      setAiErro(error?.message || "Erro ao obter dados do artigo.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="page-content">
      <div className="home-hero">
        <div className="home-hero-content">
          <h1 className="page-title">Expert Admin</h1>
          <p className="page-subtitle">
            Pesquisa artigos, cria etiquetas e faz scan rápido num só lugar.
          </p>

          <div className="home-search-wrap">
            <input
              type="text"
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              placeholder="Pesquisar artigo, descrição ou código de barras"
              className="home-search-input"
              onKeyDown={(e) => {
                if (e.key === "Enter") abrirPesquisaCompleta();
              }}
            />

            <button
              type="button"
              className="btn btn-primary home-search-btn"
              onClick={abrirPesquisaCompleta}
            >
              Pesquisar
            </button>
          </div>

          {sugestoes.length > 0 && (
            <div className="home-search-suggestions">
              {sugestoes.map((item, index) => (
                <button
                  key={`${item.artigo}-${index}`}
                  type="button"
                  className="home-suggestion-item"
                  onClick={() => abrirPopupArtigo(item)}
                >
                  <strong>{item.artigo}</strong>
                  <span>{item.descricao}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="home-grid">
        <button
          type="button"
          className="home-card home-card-primary"
          onClick={() => navigate("/EtiquetasCampanha")}
        >
          <div className="home-card-icon">🏷️</div>
          <div className="home-card-text">
            <h2>Etiquetas</h2>
            <p>Criar e imprimir etiquetas de campanha.</p>
          </div>
        </button>

        <button
          type="button"
          className="home-card"
          onClick={() => navigate("/Etiquetas")}
        >
          <div className="home-card-icon">📦</div>
          <div className="home-card-text">
            <h2>Artigos</h2>
            <p>Pesquisar, selecionar e copiar artigos.</p>
          </div>
        </button>

        <button
          type="button"
          className="home-card"
          onClick={() => navigate("/Etiquetas")}
        >
          <div className="home-card-icon">📷</div>
          <div className="home-card-text">
            <h2>Scan rápido</h2>
            <p>Ler código de barras ou modelo.</p>
          </div>
        </button>
      </div>

      <div className="home-section">
        <div className="table-card-header">
          <h2>Resumo</h2>
        </div>

        <div className="resumo-cards">
          <div className="resumo-card">
            <span className="resumo-label">Artigos carregados</span>
            <strong>{artigos.length}</strong>
          </div>

          <div className="resumo-card">
            <span className="resumo-label">Área principal</span>
            <strong>Etiquetas</strong>
          </div>

          <div className="resumo-card">
            <span className="resumo-label">Modo ideal</span>
            <strong>Mobile + Desktop</strong>
          </div>
        </div>
      </div>

      {artigoSelecionado && (
        <div className="popup-overlay">
          <div className="popup-card ai-popup-card">
            <div className="popup-header">
              <h2>Detalhes do artigo</h2>
              <button
                type="button"
                className="popup-close"
                onClick={fecharPopupArtigo}
              >
                ×
              </button>
            </div>

            <div className="ai-popup-body">
              <div className="ai-popup-section">
                <h3>Dados do artigo</h3>
                <p>
                  <strong>Artigo:</strong> {artigoSelecionado.artigo}
                </p>
                <p>
                  <strong>Descrição:</strong> {artigoSelecionado.descricao}
                </p>
                <p>
                  <strong>PVP2:</strong> {artigoSelecionado.pvp2}
                </p>
                <p>
                  <strong>Código de barras:</strong>{" "}
                  {artigoSelecionado.codigoBarras}
                </p>
                <p>
                  <strong>Armazém:</strong> {artigoSelecionado.armazem}
                </p>
                <p>
                  <strong>Stock:</strong> {artigoSelecionado.stock}
                </p>
              </div>

              <div className="popup-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={abrirPopupAI}
                  disabled={aiLoading}
                >
                  {aiLoading ? "A analisar..." : "Ver com AI (incompleto)"}
                </button>


                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={fecharPopupArtigo}
                >
                  Fechar
                </button>
              </div>

              {aiAberta && (
                <div className="ai-popup-section ai-summary-box">
                  <h3>Resposta AI</h3>

                  {aiLoading && (
                    <p>A AI está a procurar características reais na web...</p>
                  )}

                  {!aiLoading && aiErro && <p className="ai-error">{aiErro}</p>}

                  {!aiLoading && !aiErro && aiResultado && (
                    <div className="ai-result-grid">
                      <p>
                        <strong>Título:</strong>{" "}
                        {aiResultado.titulo || "Não confirmado"}
                      </p>

                      <p>
                        <strong>Categoria:</strong>{" "}
                        {aiResultado.categoria || "Não confirmado"}
                      </p>

                      <p>
                        <strong>Marca:</strong>{" "}
                        {aiResultado.marca || "Não confirmado"}
                      </p>

                      <p>
                        <strong>Modelo:</strong>{" "}
                        {aiResultado.modelo || "Não confirmado"}
                      </p>

                      {aiResultado?.caracteristicas_tecnicas &&
                        Object.keys(aiResultado.caracteristicas_tecnicas)
                          .length > 0 && (
                          <div>
                            <strong>Características técnicas:</strong>
                            <ul className="ai-list">
                              {Object.entries(
                                aiResultado.caracteristicas_tecnicas,
                              ).map(([key, value]) => (
                                <li key={key}>
                                  <strong>{key}:</strong> {value}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      <p>
                        <strong>Resumo vendedor:</strong>{" "}
                        {aiResultado.resumo_vendedor || "Não disponível"}
                      </p>

                      <p>
                        <strong>Observações:</strong>{" "}
                        {aiResultado.observacoes || "Sem observações"}
                      </p>

                      {Array.isArray(aiResultado.fontes) &&
                        aiResultado.fontes.length > 0 && (
                          <div>
                            <strong>Fontes:</strong>
                            <ul className="ai-list">
                              {aiResultado.fontes.map((fonte, index) => (
                                <li key={index}>
                                  <a
                                    href={fonte}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {fonte}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
