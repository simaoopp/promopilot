import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import artigosData from "../data/artigos.json";
import "../styles/styles.css";

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
  const [modoPesquisa, setModoPesquisa] = useState("manual");
  const [pesquisa, setPesquisa] = useState("");
  const [pesquisaDebounced, setPesquisaDebounced] = useState("");
  const [selecionados, setSelecionados] = useState({});
  const [mensagem, setMensagem] = useState("");
  const [scannerAberto, setScannerAberto] = useState(false);

  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);

  const artigos = artigosData?.artigos || [];

  useEffect(() => {
    const timer = setTimeout(() => {
      setPesquisaDebounced(pesquisa);
    }, 250);

    return () => clearTimeout(timer);
  }, [pesquisa]);

  useEffect(() => {
    if (!mensagem) return;

    const timer = setTimeout(() => {
      setMensagem("");
    }, 2500);

    return () => clearTimeout(timer);
  }, [mensagem]);

  useEffect(() => {
    if (!scannerAberto || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    let ativo = true;

    async function iniciarScanner() {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();

        if (!devices.length) {
          setMensagem("Nenhuma câmara encontrada.");
          setScannerAberto(false);
          return;
        }

        const traseira =
          devices.find((d) =>
            /back|rear|environment|traseira/i.test(d.label || ""),
          ) || devices[0];

        const controls = await reader.decodeFromVideoDevice(
          traseira.deviceId,
          videoRef.current,
          (result, error) => {
            if (!ativo) return;

            if (result) {
              const codigo = result.getText();

              setModoPesquisa("scan");
              setPesquisa(codigo);
              setMensagem(`Código lido: ${codigo}`);

              if (controlsRef.current) {
                controlsRef.current.stop();
                controlsRef.current = null;
              }

              setScannerAberto(false);
            }
          },
        );

        controlsRef.current = controls;
      } catch (error) {
        console.error(error);
        setMensagem("Não foi possível aceder à câmara.");
        setScannerAberto(false);
      }
    }

    iniciarScanner();

    return () => {
      ativo = false;

      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }

      if (readerRef.current?.reset) {
        readerRef.current.reset();
      }
    };
  }, [scannerAberto]);

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
      if (modoPesquisa === "scan") {
        const matchDireto =
          item.descricaoLower.includes(termoLower) ||
          item.descricaoNormalizada.includes(termoNormalizado) ||
          item.descricaoPesquisaLivre.includes(termoLivre) ||
          item.codigoBarrasTexto.includes(termoLivre);

        if (matchDireto) return true;

        if (palavras.length > 1) {
          return palavras.every(
            (palavra) =>
              item.descricaoNormalizada.includes(palavra) ||
              item.codigoBarrasTexto.includes(normalizarPesquisaLivre(palavra)),
          );
        }

        return false;
      }

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
            item.codigoBarrasTexto.includes(normalizarPesquisaLivre(palavra)),
        );
      }

      return false;
    });
  }, [pesquisaDebounced, artigosPreparados, modoPesquisa]);

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
    if (resultadosVisiveis.length === 0) {
      setMensagem("Não há resultados visíveis para selecionar.");
      return;
    }

    setSelecionados((prev) => {
      const next = { ...prev };

      resultadosVisiveis.forEach((item) => {
        next[item._id] = true;
      });

      return next;
    });

    setMensagem("Resultados visíveis selecionados.");
  }

  function limparSelecao() {
    setSelecionados({});
    setMensagem("Seleção limpa.");
  }

  async function copiarSelecionados() {
    if (artigosSelecionados.length === 0) {
      setMensagem("Seleciona pelo menos um artigo.");
      return;
    }

    const texto = [
      ...new Set(
        artigosSelecionados
          .map((item) => String(item.artigo || "").trim())
          .filter(Boolean),
      ),
    ].join("|");

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API não suportada.");
      }

      await navigator.clipboard.writeText(texto);
      setMensagem("Códigos copiados com sucesso.");
    } catch {
      setMensagem("Não foi possível copiar os códigos.");
    }
  }

  function abrirScanner() {
    setModoPesquisa("scan");
    setScannerAberto(true);
    setMensagem("A abrir câmara...");
  }

  function fecharScanner() {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }

    if (readerRef.current?.reset) {
      readerRef.current.reset();
    }

    setScannerAberto(false);
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
          <label
            className="input-group"
            htmlFor="pesquisa-artigo"
            style={{ gridColumn: "1 / -1" }}
          >
            <span>Pesquisar artigo</span>

            <div className="input-com-icon">
              <input
                id="pesquisa-artigo"
                type="text"
                value={pesquisa}
                onChange={(e) => {
                  setModoPesquisa("manual");
                  setPesquisa(e.target.value);
                }}
                placeholder="Ex: samsung microondas, máquina lavar, 5601234567890"
              />

              <button
                type="button"
                className="btn-camera"
                onClick={abrirScanner}
                aria-label="Abrir scanner"
                title="Abrir scanner"
              >
                <span role="img" aria-hidden="true">
                  📷
                </span>
              </button>
            </div>
          </label>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={selecionarTodosVisiveis}
          >
            Selecionar visíveis
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={limparSelecao}
          >
            Limpar seleção
          </button>

          <button
            type="button"
            className="btn btn-success"
            onClick={copiarSelecionados}
          >
            Copiar selecionados
          </button>
        </div>

        {mensagem && <p className="feedback-message">{mensagem}</p>}

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
                <th scope="col">Selecionar</th>
                <th scope="col">Artigo</th>
                <th scope="col">Descrição</th>
                <th scope="col">PVP2</th>
                <th scope="col">Cód. Barras</th>
                <th scope="col">Armazém</th>
                <th scope="col">Stock</th>
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
                        aria-label={`Selecionar artigo ${item.artigo}`}
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
          <div className="table-limit-warning">
            A mostrar apenas os primeiros {LIMITE_RESULTADOS} resultados. Refina
            a pesquisa para ver menos artigos.
          </div>
        )}
      </div>

      {scannerAberto && (
        <div className="popup-overlay">
          <div className="popup-card scanner-card">
            <div className="popup-header">
              <h2>Scanner de código de barras</h2>
              <button
                type="button"
                className="popup-close"
                onClick={fecharScanner}
              >
                ×
              </button>
            </div>

            <div className="scanner-body">
              <video ref={videoRef} className="scanner-video" />
              <p className="popup-text">
                Aponte a câmara para o código de barras do produto.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
