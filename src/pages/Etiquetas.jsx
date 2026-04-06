import React, { useEffect, useMemo, useState } from "react";
import artigosData from "../data/artigos.json";

const LIMITE_RESULTADOS = 100;

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarPesquisaLivre(texto) {
  return normalizarTexto(texto).replace(/[^a-z0-9]/g, "");
}

export default function EtiquetasCampanhaExcelPage() {
  const [pesquisa, setPesquisa] = useState("");
  const [pesquisaDebounced, setPesquisaDebounced] = useState("");
  const [selecionados, setSelecionados] = useState({});

  const artigos = artigosData?.artigos || [];

  useEffect(() => {
    const timer = setTimeout(() => {
      setPesquisaDebounced(pesquisa);
    }, 250);

    return () => clearTimeout(timer);
  }, [pesquisa]);

  const artigosPreparados = useMemo(() => {
    return artigos.map((item, index) => ({
      ...item,
      _id: `${item.artigo}-${item.armazem}-${item.codigoBarras || ""}-${index}`,
      artigoLower: String(item.artigo || "").toLowerCase(),
      artigoNormalizado: normalizarPesquisaLivre(item.artigo),
      descricaoLower: String(item.descricao || "").toLowerCase(),
      descricaoNormalizada: normalizarTexto(item.descricao),
      descricaoPesquisaLivre: normalizarPesquisaLivre(item.descricao),
      codigoBarrasTexto: normalizarPesquisaLivre(item.codigoBarras || ""),
    }));
  }, [artigos]);

  const resultados = useMemo(() => {
    const termo = pesquisaDebounced.trim();

    if (termo.length < 2) return [];

    const termoLower = termo.toLowerCase();
    const termoNormalizado = normalizarTexto(termo);
    const termoLivre = normalizarPesquisaLivre(termo);
    const palavras = termoNormalizado.split(/\s+/).filter(Boolean);

    return artigosPreparados.filter((item) => {
      const matchDireto =
        item.artigoLower.includes(termoLower) ||
        item.artigoNormalizado.includes(termoLivre) ||
        item.descricaoLower.includes(termoLower) ||
        item.descricaoNormalizada.includes(termoNormalizado) ||
        item.descricaoPesquisaLivre.includes(termoLivre) ||
        item.codigoBarrasTexto.includes(termoLivre);

      if (matchDireto) return true;

      if (palavras.length > 1) {
        return palavras.every(
          (palavra) =>
            item.descricaoNormalizada.includes(palavra) ||
            item.artigoLower.includes(palavra) ||
            item.codigoBarrasTexto.includes(normalizarPesquisaLivre(palavra))
        );
      }

      return false;
    });
  }, [pesquisaDebounced, artigosPreparados]);

  const resultadosVisiveis = useMemo(() => {
    return resultados.slice(0, LIMITE_RESULTADOS);
  }, [resultados]);

  const artigosSelecionados = useMemo(() => {
    return artigosPreparados.filter((item) => selecionados[item._id]);
  }, [artigosPreparados, selecionados]);

  function alternarSelecionado(id) {
    setSelecionados((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function selecionarTodosVisiveis() {
    setSelecionados((prev) => {
      const next = { ...prev };

      resultadosVisiveis.forEach((item) => {
        next[item._id] = true;
      });

      return next;
    });
  }

  function limparSelecao() {
    setSelecionados({});
  }

  async function copiarSelecionados() {
    if (artigosSelecionados.length === 0) {
      alert("Seleciona pelo menos um artigo.");
      return;
    }

    const texto = [
      ...new Set(
        artigosSelecionados
          .map((item) => String(item.artigo || "").trim())
          .filter(Boolean)
      ),
    ].join("|");

    try {
      await navigator.clipboard.writeText(texto);
      alert("Códigos copiados com sucesso.");
    } catch {
      alert("Não foi possível copiar os códigos.");
    }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Etiquetas</h1>
        <p className="page-subtitle">
          Pesquisa por código, descrição ou código de barras.
        </p>
      </div>

      <div className="control-card">
        <div className="toolbar-grid">
          <label className="input-group" style={{ gridColumn: "1 / -1" }}>
            <span>Pesquisar artigo</span>
            <input
              type="text"
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              placeholder="Ex: SA 3052, SA-3052, samsung cabo 5m"
            />
          </label>
        </div>

        <div className="toolbar-actions">
          <button
            className="btn btn-secondary"
            onClick={selecionarTodosVisiveis}
          >
            Selecionar visíveis
          </button>

          <button className="btn btn-secondary" onClick={limparSelecao}>
            Limpar seleção
          </button>

          <button className="btn btn-success" onClick={copiarSelecionados}>
            Copiar selecionados
          </button>
        </div>

        <div className="resumo-cards">
          <div className="resumo-card">
            <span className="resumo-label">Total artigos</span>
            <strong>{artigos.length}</strong>
          </div>

          <div className="resumo-card">
            <span className="resumo-label">Resultados</span>
            <strong>{resultados.length}</strong>
          </div>

          <div className="resumo-card">
            <span className="resumo-label">A mostrar</span>
            <strong>{resultadosVisiveis.length}</strong>
          </div>

          <div className="resumo-card">
            <span className="resumo-label">Selecionados</span>
            <strong>{artigosSelecionados.length}</strong>
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <h2>Lista de artigos</h2>
        </div>

        <div className="table-panel">
          <table>
            <thead>
              <tr>
                <th>Selecionar</th>
                <th>Artigo</th>
                <th>Descrição</th>
                <th>PVP2</th>
                <th>Cód. Barras</th>
                <th>Armazém</th>
                <th>Stock</th>
              </tr>
            </thead>

            <tbody>
              {pesquisaDebounced.trim().length < 2 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    Escreve pelo menos 2 caracteres para pesquisar.
                  </td>
                </tr>
              ) : resultadosVisiveis.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    Nenhum artigo encontrado.
                  </td>
                </tr>
              ) : (
                resultadosVisiveis.map((item) => (
                  <tr
                    key={item._id}
                    className={
                      selecionados[item._id] ? "linha-selecionada" : ""
                    }
                    onClick={() => alternarSelecionado(item._id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="col-select">
                      <input
                        type="checkbox"
                        checked={!!selecionados[item._id]}
                        onChange={() => alternarSelecionado(item._id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{item.artigo}</td>
                    <td>{item.descricao}</td>
                    <td>{item.pvp2}</td>
                    <td>{item.codigoBarras}</td>
                    <td>{item.armazem}</td>
                    <td>{item.stock}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {resultados.length > LIMITE_RESULTADOS && (
          <div style={{ padding: "12px 16px" }}>
            A mostrar apenas os primeiros {LIMITE_RESULTADOS} resultados. Refina
            a pesquisa para ver menos artigos.
          </div>
        )}
      </div>
    </div>
  );
}
