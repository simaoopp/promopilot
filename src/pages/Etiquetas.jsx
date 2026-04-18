import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { createWorker } from "tesseract.js";
import { loadAllArtigos } from "../services/artigosService";
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

function extrairMelhorTextoOCR(texto) {
  const linhas = String(texto || "")
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);

  const candidatos = [];

  for (const linha of linhas) {
    const limpo = linha.replace(/\s+/g, " ").trim();

    if (!limpo) continue;

    const matches = limpo.match(/[A-Z0-9][A-Z0-9./-]{4,}/gi);
    if (matches) {
      candidatos.push(...matches);
    }
  }

  const unicos = [...new Set(candidatos)].filter((item) => item.length >= 5);

  const comLetrasENumeros = unicos.filter(
    (item) => /[A-Z]/i.test(item) && /\d/.test(item),
  );

  if (comLetrasENumeros.length > 0) {
    return comLetrasENumeros[0];
  }

  if (unicos.length > 0) {
    return unicos[0];
  }

  return linhas[0] || "";
}

export default function EtiquetasCampanhaExcelPage() {
  const [modoPesquisa, setModoPesquisa] = useState("manual");
  const [pesquisa, setPesquisa] = useState("");
  const [pesquisaDebounced, setPesquisaDebounced] = useState("");
  const [selecionados, setSelecionados] = useState({});
  const [mensagem, setMensagem] = useState("");
  const [artigos, setArtigos] = useState([]);
  const [artigosLoading, setArtigosLoading] = useState(true);

  const [menuScanAberto, setMenuScanAberto] = useState(false);
  const [scannerAberto, setScannerAberto] = useState(false);
  const [aLerOCR, setALerOCR] = useState(false);

  const [resultadoScan, setResultadoScan] = useState(null);
  const [codigoLidoPopup, setCodigoLidoPopup] = useState("");

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const ocrWorkerRef = useRef(null);


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
    let ativo = true;

    async function syncArtigos() {
      try {
        const data = await loadAllArtigos({ pageSize: 500 });

        if (ativo) {
          setArtigos(data.items || []);
        }
      } catch (error) {
        console.error("Não foi possível carregar artigos.", error);

        if (ativo) {
          setMensagem("Não foi possível carregar o catálogo de artigos.");
        }
      } finally {
        if (ativo) {
          setArtigosLoading(false);
        }
      }
    }

    syncArtigos();

    return () => {
      ativo = false;
    };
  }, []);

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

  function pararScanner() {
    try {
      if (controlsRef.current?.stop) {
        controlsRef.current.stop();
      }
    } catch (error) {
      console.error("Erro ao parar scanner:", error);
    } finally {
      controlsRef.current = null;
    }

    try {
      if (readerRef.current?.reset) {
        readerRef.current.reset();
      }
    } catch (error) {
      console.error("Erro ao fazer reset do reader:", error);
    }
  }

  function abrirResultado(codigoOuTexto, itemEncontrado) {
    setCodigoLidoPopup(codigoOuTexto);

    if (itemEncontrado) {
      setResultadoScan({
        encontrado: true,
        item: itemEncontrado,
      });
    } else {
      setResultadoScan({
        encontrado: false,
        item: null,
      });
    }
  }

  const procurarArtigoPorCodigoBarras = useCallback(
    (codigo) => {
      const codigoNormalizado = normalizarPesquisaLivre(codigo);

      const encontrado = artigosPreparados.find(
        (item) => item.codigoBarrasTexto === codigoNormalizado,
      );

      abrirResultado(codigo, encontrado || null);
    },
    [artigosPreparados]
  );

  function procurarArtigoPorTextoOCR(texto) {
    const termoNormalizado = normalizarTexto(texto);
    const termoLivre = normalizarPesquisaLivre(texto);

    const encontrado = artigosPreparados.find(
      (item) =>
        item.descricaoPesquisaLivre.includes(termoLivre) ||
        item.descricaoNormalizada.includes(termoNormalizado),
    );

    abrirResultado(texto, encontrado || null);
  }

  useEffect(() => {
    if (!scannerAberto || !videoRef.current) return;

    let ativo = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

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
          ) || devices[devices.length - 1];

        const controls = await reader.decodeFromVideoDevice(
          traseira.deviceId,
          videoRef.current,
          (result, error) => {
            if (!ativo) return;

            if (result) {
              const codigo = String(result.getText() || "")
                .replace(/\s+/g, "")
                .trim();

              setModoPesquisa("scan");
              setPesquisa(codigo);
              setMensagem(`Código lido: ${codigo}`);

              procurarArtigoPorCodigoBarras(codigo);

              pararScanner();
              setScannerAberto(false);
              return;
            }

            if (error && error.name !== "NotFoundException") {
              console.error("Erro do scanner:", error);
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
      pararScanner();
    };
  }, [scannerAberto, artigosPreparados, procurarArtigoPorCodigoBarras]);

  const resultados = useMemo(() => {
    const termo = pesquisaDebounced.trim();

    if (termo.length < 2) return [];

    const termoLower = termo.toLowerCase();
    const termoNormalizado = normalizarTexto(termo);
    const termoLivre = normalizarPesquisaLivre(termo);
    const palavras = termoNormalizado.split(/\s+/).filter(Boolean);

    return artigosPreparados.filter((item) => {
      if (modoPesquisa === "scan") {
        const matchCodigoBarrasExato =
          termoLivre &&
          item.codigoBarrasTexto &&
          item.codigoBarrasTexto === termoLivre;

        if (matchCodigoBarrasExato) return true;

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

  const resultadosVisiveis = useMemo(
    () => resultados.slice(0, LIMITE_RESULTADOS),
    [resultados],
  );

  const artigosSelecionados = useMemo(
    () => artigosPreparados.filter((item) => selecionados[item._id]),
    [artigosPreparados, selecionados],
  );

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
      await navigator.clipboard.writeText(texto);
      setMensagem("Códigos copiados com sucesso.");
    } catch {
      setMensagem("Não foi possível copiar os códigos.");
    }
  }

  function abrirScannerCodigoBarras() {
    setMenuScanAberto(false);
    setModoPesquisa("scan");
    setScannerAberto(true);
    setMensagem("A abrir câmara...");
  }

  function abrirOCR() {
    setMenuScanAberto(false);
    fileInputRef.current?.click();
  }

  function fecharScanner() {
    pararScanner();
    setScannerAberto(false);
  }

  function fecharResultadoScan() {
    setResultadoScan(null);
    setCodigoLidoPopup("");
  }

  function selecionarArtigoDoScan() {
    if (!resultadoScan?.item?._id) return;

    setSelecionados((prev) => ({
      ...prev,
      [resultadoScan.item._id]: true,
    }));

    setMensagem("Artigo selecionado com sucesso.");
    fecharResultadoScan();
  }

  async function handleImagemOCR(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setALerOCR(true);
      setModoPesquisa("scan");
      setMensagem("A ler texto da imagem...");

      if (!ocrWorkerRef.current) {
        ocrWorkerRef.current = await createWorker("eng");
      }

      const {
        data: { text },
      } = await ocrWorkerRef.current.recognize(file);

      const melhorTexto = extrairMelhorTextoOCR(text);

      if (!melhorTexto) {
        setMensagem("Não foi possível ler texto da imagem.");
        abrirResultado("Sem texto legível", null);
        return;
      }

      setPesquisa(melhorTexto);
      setMensagem(`Modelo lido: ${melhorTexto}`);
      procurarArtigoPorTextoOCR(melhorTexto);
    } catch (error) {
      console.error(error);
      setMensagem("Erro ao ler a imagem.");
      abrirResultado("Erro OCR", null);
    } finally {
      setALerOCR(false);
      event.target.value = "";
    }
  }

  useEffect(() => {
    return () => {
      pararScanner();

      async function terminarOCR() {
        try {
          if (ocrWorkerRef.current) {
            await ocrWorkerRef.current.terminate();
            ocrWorkerRef.current = null;
          }
        } catch (error) {
          console.error("Erro ao terminar OCR:", error);
        }
      }

      terminarOCR();
    };
  }, []);

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
                onClick={() => setMenuScanAberto(true)}
                aria-label="Abrir opções de scan"
                title="Abrir opções de scan"
              >
                <span role="img" aria-hidden="true">
                  📷
                </span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImagemOCR}
              style={{ display: "none" }}
            />
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
              {artigosLoading ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    A carregar catálogo de artigos...
                  </td>
                </tr>
              ) : pesquisaDebounced.trim().length < 2 ? (
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

      {menuScanAberto && (
        <div className="popup-overlay">
          <div className="popup-card scan-options-card">
            <div className="popup-header">
              <h2>Escolher tipo de leitura</h2>
              <button
                type="button"
                className="popup-close"
                onClick={() => setMenuScanAberto(false)}
              >
                ×
              </button>
            </div>

            <div className="popup-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={abrirScannerCodigoBarras}
              >
                Ler código de barras
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={abrirOCR}
              >
                Ler texto / descrição
              </button>
            </div>
          </div>
        </div>
      )}

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

      {aLerOCR && (
        <div className="popup-overlay">
          <div className="popup-card scan-options-card">
            <div className="popup-header">
              <h2>A ler imagem</h2>
            </div>

            <div className="scanner-result-body">
              <p className="popup-text">
                A analisar texto da imagem. Aguarde um momento.
              </p>
            </div>
          </div>
        </div>
      )}

      {resultadoScan && (
        <div className="popup-overlay">
          <div className="popup-card">
            <div className="popup-header">
              <h2>Resultado do scan</h2>
              <button
                type="button"
                className="popup-close"
                onClick={fecharResultadoScan}
              >
                ×
              </button>
            </div>

            <div className="scanner-result-body">
              <p className="popup-text">
                <strong>Lido:</strong> {codigoLidoPopup}
              </p>

              {resultadoScan.encontrado ? (
                <>
                  <p className="popup-text">
                    <strong>Artigo encontrado com sucesso.</strong>
                  </p>

                  <div className="scan-result-card">
                    <p>
                      <strong>Artigo:</strong> {resultadoScan.item.artigo}
                    </p>
                    <p>
                      <strong>Descrição:</strong> {resultadoScan.item.descricao}
                    </p>
                    <p>
                      <strong>Código de barras:</strong>{" "}
                      {resultadoScan.item.codigoBarras}
                    </p>
                    <p>
                      <strong>PVP2:</strong> {resultadoScan.item.pvp2}
                    </p>
                    <p>
                      <strong>Armazém:</strong> {resultadoScan.item.armazem}
                    </p>
                    <p>
                      <strong>Stock:</strong> {resultadoScan.item.stock}
                    </p>
                  </div>

                  <div className="popup-actions">
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={selecionarArtigoDoScan}
                    >
                      Selecionar artigo
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={fecharResultadoScan}
                    >
                      Fechar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="popup-text">
                    Não foi encontrado nenhum artigo para o valor lido.
                  </p>

                  <div className="popup-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={fecharResultadoScan}
                    >
                      Fechar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
