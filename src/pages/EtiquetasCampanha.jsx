import React, { useEffect, useMemo, useState } from "react";
import Barcode from "../components/Barcode";
import FilterMenu from "../components/FilterMenu";
import logo from "../logo.png";
import artigosData from "../data/artigos.json";
import "../styles/styles.css";

import { formatarEuro } from "../utils/formatters";
import { useAutoFontSize } from "../utils/useAutoFontSize";
import { parseTabelaColada } from "../utils/parsers";
import {
  aplicarFiltroTexto,
  compararNumero,
  dividirEmPaginas,
} from "../utils/filters";
import { TABLE_COLUMNS } from "../data/tableColumns";

function AutoText({ texto, className, min, max, style = {} }) {
  const autoFont = useAutoFontSize(texto, min, max);

  return (
    <div
      ref={autoFont.ref}
      className={className}
      style={{
        width: "100%",
        ...style,
        fontSize: `${autoFont.fontSize}px`,
      }}
    >
      {texto}
    </div>
  );
}

function DescricaoAuto({ texto, formatoEtiqueta }) {
  return (
    <AutoText
      texto={texto}
      className="descricao"
      min={formatoEtiqueta === "a5" ? 24 : 12}
      max={formatoEtiqueta === "a5" ? 38 : 18}
    />
  );
}

function PrecoAntesAuto({ valor, formatoEtiqueta }) {
  return (
    <AutoText
      texto={`${formatarEuro(valor)}€`}
      className="antes"
      min={formatoEtiqueta === "a5" ? 44 : 38}
      max={formatoEtiqueta === "a5" ? 54 : 46}
    />
  );
}

function DescontoAuto({ valor, formatoEtiqueta }) {
  return (
    <AutoText
      texto={`-${formatarEuro(valor)}€`}
      className="desconto"
      min={formatoEtiqueta === "a5" ? 48 : 40}
      max={formatoEtiqueta === "a5" ? 60 : 50}
    />
  );
}

function PrecoAtualAuto({ valor, formatoEtiqueta }) {
  return (
    <AutoText
      texto={`${formatarEuro(valor)}€`}
      className="atual"
      min={formatoEtiqueta === "a5" ? 62 : 48}
      max={formatoEtiqueta === "a5" ? 88 : 68}
    />
  );
}

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function converterPreco(valor) {
  const texto = String(valor || "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

export default function EtiquetasPage() {
  const [erroCampanha, setErroCampanha] = useState("");
  const [titulo, setTitulo] = useState("PROMO");
  const [textoColado, setTextoColado] = useState("");
  const [anoValidade, setAnoValidade] = useState(new Date().getFullYear());
  const [dados, setDados] = useState([]);
  const [formatoEtiqueta, setFormatoEtiqueta] = useState("a6");

  const [popupArtigosInvalidosAberto, setPopupArtigosInvalidosAberto] =
    useState(false);
  const [artigosInvalidosPopup, setArtigosInvalidosPopup] = useState([]);

  const [popupCriarCampanhaAberto, setPopupCriarCampanhaAberto] =
    useState(false);
  const [pesquisaCampanha, setPesquisaCampanha] = useState("");
  const [artigoCampanhaSelecionado, setArtigoCampanhaSelecionado] =
    useState(null);
  const [campanhaAntes, setCampanhaAntes] = useState("");
  const [campanhaAtual, setCampanhaAtual] = useState("");

  const [filtroAberto, setFiltroAberto] = useState(null);
  const [ordenacao, setOrdenacao] = useState({
    coluna: "",
    direcao: "",
  });

  const [filtros, setFiltros] = useState({
    codigo: { contains: "", equals: "" },
    descricao: { contains: "", equals: "" },
    pn: { contains: "", equals: "" },
    estado: { contains: "", equals: "" },
    info: { contains: "", equals: "" },
    ae: { op: "", valor: "" },
    aea: { op: "", valor: "" },
    aev: { op: "", valor: "" },
    a10: { op: "", valor: "" },
    a1e: { op: "", valor: "" },
  });

  const artigosJson = artigosData?.artigos || [];

  useEffect(() => {
    function handleClickOutside(event) {
      const clicouDentroDeFiltro = event.target.closest(".filter-th");
      if (!clicouDentroDeFiltro) {
        setFiltroAberto(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const antes = converterPreco(campanhaAntes);
    const atual = converterPreco(campanhaAtual);

    if (!campanhaAntes || !campanhaAtual) {
      setErroCampanha("");
      return;
    }

    if (atual > antes) {
      setErroCampanha("Valor maior que PVP2 antes.");
      return;
    }

    setErroCampanha("");
  }, [campanhaAntes, campanhaAtual]);

  const sugestoesCampanha = useMemo(() => {
    const termo = normalizarTexto(pesquisaCampanha);

    if (termo.length < 2) return [];

    return artigosJson
      .filter((item) => {
        const artigo = normalizarTexto(item.artigo);
        const descricao = normalizarTexto(item.descricao);
        const ean = normalizarTexto(item.codigoBarras);

        return (
          artigo.includes(termo) ||
          descricao.includes(termo) ||
          ean.includes(termo)
        );
      })
      .slice(0, 10);
  }, [pesquisaCampanha, artigosJson]);

  const descontoCampanha = useMemo(() => {
    const antes = converterPreco(campanhaAntes);
    const atual = converterPreco(campanhaAtual);
    return Math.max(0, antes - atual);
  }, [campanhaAntes, campanhaAtual]);

  function abrirPopupCriarCampanha() {
    setPopupCriarCampanhaAberto(true);
    setPesquisaCampanha("");
    setArtigoCampanhaSelecionado(null);
    setCampanhaAntes("");
    setCampanhaAtual("");
    setErroCampanha("");
  }

  function fecharPopupCriarCampanha() {
    setPopupCriarCampanhaAberto(false);
    setPesquisaCampanha("");
    setArtigoCampanhaSelecionado(null);
    setCampanhaAntes("");
    setCampanhaAtual("");
    setErroCampanha("");
  }

  function adicionarArtigoCampanha() {
    if (!artigoCampanhaSelecionado) {
      alert("Seleciona um artigo.");
      return;
    }

    const antes = converterPreco(campanhaAntes);
    const atual = converterPreco(campanhaAtual);

    if (antes <= 0 || atual <= 0) {
      setErroCampanha("Preenche os valores de PVP2 antes e PVP2 atual.");
      return;
    }

    if (atual > antes) {
      setErroCampanha("Valor maior que PVP2 antes.");
      return;
    }

    setErroCampanha("");

    const novoItem = {
      id: `${artigoCampanhaSelecionado.artigo}-${Date.now()}`,
      codigo: artigoCampanhaSelecionado.artigo || "",
      descricao: artigoCampanhaSelecionado.descricao || "",
      pn: "",
      ean: artigoCampanhaSelecionado.codigoBarras || "",
      antes,
      atual,
      pv3: "",
      estado: "",
      ae: artigoCampanhaSelecionado.stock || "",
      aea: "",
      aev: "",
      a10: "",
      a1e: "",
      data: "",
      dataInicio: "",
      dataFim: "",
      alterado: "CAMPANHA",
      info: `Desconto ${formatarEuro(descontoCampanha)}€`,
      selecionado: true,
    };

    setDados((prev) => [novoItem, ...prev]);
    fecharPopupCriarCampanha();
  }

  function removerInvalidosDaSelecao() {
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        idsInvalidos.has(item.id) ? { ...item, selecionado: false } : item
      )
    );
  }

  function atualizarFiltroPopup(campo, chave, valor) {
    setFiltros((prev) => ({
      ...prev,
      [campo]: {
        ...prev[campo],
        [chave]: valor,
      },
    }));
  }

  function limparFiltro(campo, tipo = "text") {
    setFiltros((prev) => ({
      ...prev,
      [campo]:
        tipo === "text" ? { contains: "", equals: "" } : { op: "", valor: "" },
    }));
  }

  function ordenarLista(lista) {
    if (!ordenacao.coluna || !ordenacao.direcao) return lista;

    const copia = [...lista];

    copia.sort((a, b) => {
      const va = a[ordenacao.coluna];
      const vb = b[ordenacao.coluna];

      const aNum = Number(va);
      const bNum = Number(vb);
      const ambosNumeros = !Number.isNaN(aNum) && !Number.isNaN(bNum);

      if (ambosNumeros) {
        return ordenacao.direcao === "asc" ? aNum - bNum : bNum - aNum;
      }

      const aText = String(va || "").toLowerCase();
      const bText = String(vb || "").toLowerCase();

      return ordenacao.direcao === "asc"
        ? aText.localeCompare(bText, "pt")
        : bText.localeCompare(aText, "pt");
    });

    return copia;
  }

  function carregarTextoColado() {
    try {
      if (!textoColado.trim()) {
        throw new Error("Sem conteúdo");
      }

      const linhas = parseTabelaColada(textoColado);

      if (!linhas.length) {
        throw new Error("Sem linhas válidas");
      }

      const erro = linhas.some((item) => {
        const nomeInvalido = !item.descricao || item.descricao.length < 3;
        const precoAntesInvalido = !item.antes || Number(item.antes) <= 0;
        const precoAtualInvalido = !item.atual || Number(item.atual) <= 0;
        const eanInvalido =
          !item.ean || String(item.ean).replace(/\D/g, "").length < 8;

        const dataInvalida = (data) => {
          const texto = String(data || "").trim();

          if (!texto || texto === "-") return false;

          const formatoMesTexto = /^\d{1,2}\/[a-z]{3}\.?$/i;
          const formatoMesNumero = /^\d{1,2}\/\d{2}$/;

          return !formatoMesTexto.test(texto) && !formatoMesNumero.test(texto);
        };

        const datasInvalidas =
          dataInvalida(item.dataInicio) || dataInvalida(item.dataFim);

        return (
          nomeInvalido ||
          precoAntesInvalido ||
          precoAtualInvalido ||
          eanInvalido ||
          datasInvalidas
        );
      });

      if (erro) {
        throw new Error("Dados inválidos");
      }

      setDados(linhas);
    } catch {
      alert("Verifique se os dados inseridos estão corretos.");
    }
  }

  const dadosFiltrados = useMemo(() => {
    const filtrados = dados.filter((item) => {
      const codigoOk = aplicarFiltroTexto(item.codigo, filtros.codigo);
      const descricaoOk = aplicarFiltroTexto(item.descricao, filtros.descricao);
      const pnOk = aplicarFiltroTexto(item.pn, filtros.pn);
      const estadoOk = aplicarFiltroTexto(item.estado, filtros.estado);
      const infoOk = aplicarFiltroTexto(item.info, filtros.info);

      const aeOk = compararNumero(item.ae, filtros.ae.op, filtros.ae.valor);
      const aeaOk = compararNumero(item.aea, filtros.aea.op, filtros.aea.valor);
      const aevOk = compararNumero(item.aev, filtros.aev.op, filtros.aev.valor);
      const a10Ok = compararNumero(item.a10, filtros.a10.op, filtros.a10.valor);
      const a1eOk = compararNumero(item.a1e, filtros.a1e.op, filtros.a1e.valor);

      return (
        codigoOk &&
        descricaoOk &&
        pnOk &&
        estadoOk &&
        infoOk &&
        aeOk &&
        aeaOk &&
        aevOk &&
        a10Ok &&
        a1eOk
      );
    });

    return ordenarLista(filtrados);
  }, [dados, filtros, ordenacao]);

  const selecionados = dados.filter((item) => item.selecionado);
  const etiquetasPorPagina = formatoEtiqueta === "a5" ? 2 : 4;
  const paginas = dividirEmPaginas(selecionados, etiquetasPorPagina);

  function alternarSelecionado(id) {
    setDados((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selecionado: !item.selecionado } : item
      )
    );
  }

  function selecionarTodosFiltrados() {
    const ids = new Set(dadosFiltrados.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        ids.has(item.id) ? { ...item, selecionado: true } : item
      )
    );
  }

  function desmarcarTodosFiltrados() {
    const ids = new Set(dadosFiltrados.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        ids.has(item.id) ? { ...item, selecionado: false } : item
      )
    );
  }

  function limparSelecao() {
    setDados((prev) => prev.map((item) => ({ ...item, selecionado: false })));
  }

  async function copiarCodigosInvalidosEProsseguir() {
    const texto = artigosInvalidosPopup
      .map((item) => String(item.codigo || "").trim())
      .filter(Boolean)
      .join("|");

    try {
      if (texto) {
        await navigator.clipboard.writeText(texto);
      }
    } catch (error) {
      console.error("Não foi possível copiar os códigos.", error);
    }

    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));
    const restantesValidos = selecionados.filter(
      (item) => !idsInvalidos.has(item.id)
    );

    removerInvalidosDaSelecao();
    setPopupArtigosInvalidosAberto(false);

    if (restantesValidos.length === 0) {
      alert("Não existem etiquetas válidas para imprimir.");
      return;
    }

    setTimeout(() => {
      window.print();
    }, 150);
  }

  function fecharPopupEProsseguir() {
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));
    const restantesValidos = selecionados.filter(
      (item) => !idsInvalidos.has(item.id)
    );

    removerInvalidosDaSelecao();
    setPopupArtigosInvalidosAberto(false);

    if (restantesValidos.length === 0) {
      alert("Não existem etiquetas válidas para imprimir.");
      return;
    }

    setTimeout(() => {
      window.print();
    }, 150);
  }

  function imprimirSelecionados() {
    if (selecionados.length === 0) {
      alert("Seleciona pelo menos um artigo.");
      return;
    }

    const invalidos = selecionados.filter(
      (item) => Number(item.antes) <= Number(item.atual)
    );

    if (invalidos.length > 0) {
      setArtigosInvalidosPopup(invalidos);
      setPopupArtigosInvalidosAberto(true);
      return;
    }

    window.print();
  }

  function formatarDataDiaMes(data) {
    const dia = String(data.getDate()).padStart(2, "0");
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    return `${dia}/${mes}`;
  }

  function obterTextoValidade(item, anoValidadeAtual) {
    const normalizarData = (valor) => {
      const texto = String(valor || "").trim();
      return texto && texto !== "-" ? texto : "";
    };

    const dataInicio = normalizarData(item.dataInicio);
    const dataFim = normalizarData(item.dataFim);

    if (!dataInicio && !dataFim) {
      const hoje = new Date();
      const fim = new Date();
      fim.setDate(hoje.getDate() + 30);

      return `VÁLIDO DE ${formatarDataDiaMes(
        hoje
      )}/${hoje.getFullYear()} A ${formatarDataDiaMes(
        fim
      )}/${fim.getFullYear()}`;
    }

    return `VÁLIDO DE ${dataInicio || "-"}${
      dataInicio ? `/${anoValidadeAtual}` : ""
    } A ${dataFim || "-"}${dataFim ? `/${anoValidadeAtual}` : ""}`;
  }

  return (
    <>
      <div className="page-content no-print">
        <div className="page-header">
          <h1 className="page-title">Etiquetas de Campanha</h1>
          <p className="page-subtitle">
            Cola a tabela recebida por email, valida os artigos, aplica filtros
            e imprime apenas as etiquetas selecionadas.
          </p>
        </div>

        <div className="control-card">
          <div className="toolbar-grid">
            <label className="input-group">
              <span>Título da campanha</span>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: ASUS PROMO"
              />
            </label>

            <div className="input-group">
              <span>Ano de validade</span>
              <div className="ano-formato-row">
                <input
                  type="number"
                  value={anoValidade}
                  onChange={(e) => setAnoValidade(e.target.value)}
                  placeholder="2026"
                />

                <button
                  type="button"
                  className="btn btn-secondary formato-btn"
                  onClick={() =>
                    setFormatoEtiqueta((prev) => (prev === "a6" ? "a5" : "a6"))
                  }
                >
                  Formato: {formatoEtiqueta.toUpperCase()}
                </button>
              </div>
            </div>
          </div>

          <div className="input-group">
            <span>Colar tabela recebida por email</span>
            <textarea
              className="paste-box"
              value={textoColado}
              onChange={(e) => setTextoColado(e.target.value)}
              placeholder="Cola aqui a tabela completa do email"
            />
          </div>

          <div className="toolbar-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={carregarTextoColado}
            >
              Carregar tabela
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={abrirPopupCriarCampanha}
            >
              Criar campanha
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={selecionarTodosFiltrados}
            >
              Selecionar filtrados
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={desmarcarTodosFiltrados}
            >
              Desmarcar filtrados
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
              onClick={imprimirSelecionados}
            >
              Imprimir selecionados
            </button>
          </div>

          <div className="resumo-cards">
            <div className="resumo-card">
              <span className="resumo-label">Total artigos</span>
              <strong>{dados.length}</strong>
            </div>

            <div className="resumo-card">
              <span className="resumo-label">Filtrados</span>
              <strong>{dadosFiltrados.length}</strong>
            </div>

            <div className="resumo-card">
              <span className="resumo-label">Selecionados</span>
              <strong>{selecionados.length}</strong>
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

                  {TABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={col.tipo ? "filter-th" : undefined}
                    >
                      {col.tipo ? (
                        <>
                          <button
                            type="button"
                            className="filter-button"
                            onClick={() =>
                              setFiltroAberto(
                                filtroAberto === col.key ? null : col.key
                              )
                            }
                          >
                            {col.label}
                          </button>

                          <FilterMenu
                            coluna={col.label}
                            tipo={col.tipo}
                            aberto={filtroAberto === col.key}
                            filtro={filtros[col.key]}
                            onClose={() => setFiltroAberto(null)}
                            onUpdate={(chave, valor) =>
                              atualizarFiltroPopup(col.key, chave, valor)
                            }
                            onSort={(direcao) =>
                              setOrdenacao({ coluna: col.key, direcao })
                            }
                            onClear={() => limparFiltro(col.key, col.tipo)}
                          />
                        </>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {dadosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="19" className="empty-cell">
                      Cola a tabela do email e carrega em “Carregar tabela”.
                    </td>
                  </tr>
                ) : (
                  dadosFiltrados.map((item) => (
                    <tr
                      key={item.id}
                      className={item.selecionado ? "linha-selecionada" : ""}
                      onClick={() => alternarSelecionado(item.id)}
                    >
                      <td
                        className="col-select"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={!!item.selecionado}
                          readOnly
                        />
                      </td>

                      <td>{item.codigo}</td>
                      <td>{item.descricao}</td>
                      <td>{item.pn}</td>
                      <td>{item.ean}</td>
                      <td>{formatarEuro(item.antes)}€</td>
                      <td>{formatarEuro(item.atual)}€</td>
                      <td>{item.pv3}</td>
                      <td>{item.estado}</td>
                      <td>{item.ae}</td>
                      <td>{item.aea}</td>
                      <td>{item.aev}</td>
                      <td>{item.a10}</td>
                      <td>{item.a1e}</td>
                      <td>{item.data}</td>
                      <td>{item.dataInicio}</td>
                      <td>{item.dataFim}</td>
                      <td>{item.alterado}</td>
                      <td>{item.info}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {popupCriarCampanhaAberto && (
        <div className="popup-overlay">
          <div className="popup-card popup-card-campanha">
            <div className="popup-header">
              <h2>Criar campanha</h2>

              <button
                type="button"
                className="popup-close"
                onClick={fecharPopupCriarCampanha}
              >
                ×
              </button>
            </div>

            <p className="popup-text">
              Pesquisa um artigo do catálogo, define o PVP2 antes e o PVP2
              atual, e adiciona-o diretamente à campanha.
            </p>

            <div className="campanha-form">
              <div className="input-group">
                <span>Pesquisar artigo</span>
                <input
                  type="text"
                  value={pesquisaCampanha}
                  onChange={(e) => setPesquisaCampanha(e.target.value)}
                  placeholder="Pesquisar por código interno, descrição ou EAN"
                />
              </div>

              {sugestoesCampanha.length > 0 && (
                <div className="campanha-sugestoes">
                  {sugestoesCampanha.map((item, index) => (
                    <button
                      key={`${item.artigo}-${index}`}
                      type="button"
                      className={`campanha-sugestao ${
                        artigoCampanhaSelecionado?.artigo === item.artigo
                          ? "ativa"
                          : ""
                      }`}
                      onClick={() => {
                        setArtigoCampanhaSelecionado(item);
                        setCampanhaAntes(item.pvp2 || "");
                        setCampanhaAtual(item.pvp2 || "");
                      }}
                    >
                      <strong>{item.artigo}</strong>
                      <span>{item.descricao}</span>
                      <small>EAN: {item.codigoBarras || "-"}</small>
                    </button>
                  ))}
                </div>
              )}

              {artigoCampanhaSelecionado && (
                <div className="campanha-resumo">
                  <div className="campanha-resumo-item">
                    <span>Artigo</span>
                    <strong>{artigoCampanhaSelecionado.artigo}</strong>
                  </div>

                  <div className="campanha-resumo-item campanha-resumo-item-full">
                    <span>Descrição</span>
                    <strong>{artigoCampanhaSelecionado.descricao}</strong>
                  </div>

                  <div className="campanha-resumo-item">
                    <span>EAN</span>
                    <strong>
                      {artigoCampanhaSelecionado.codigoBarras || "-"}
                    </strong>
                  </div>

                  <div className="campanha-resumo-item">
                    <span>PVP2 base</span>
                    <strong>{artigoCampanhaSelecionado.pvp2 || "-"}</strong>
                  </div>
                </div>
              )}

              <div className="campanha-precos-grid">
                <label className="input-group">
                  <span>PVP2 antes</span>
                  <input
                    type="text"
                    value={campanhaAntes}
                    onChange={(e) => setCampanhaAntes(e.target.value)}
                    placeholder="Ex: 799,99"
                  />
                </label>

                <label className="input-group">
                  <span>PVP2 atual</span>
                  <input
                    type="text"
                    value={campanhaAtual}
                    onChange={(e) => setCampanhaAtual(e.target.value)}
                    placeholder="Ex: 699,99"
                  />
                </label>

                <div className="campanha-desconto-box">
                  <span>Desconto calculado</span>
                  <strong>{formatarEuro(descontoCampanha)}€</strong>
                </div>
              </div>

              {erroCampanha && <p className="campanha-erro">{erroCampanha}</p>}
            </div>

            <div className="popup-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={adicionarArtigoCampanha}
                disabled={!!erroCampanha}
              >
                Adicionar à campanha
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={fecharPopupCriarCampanha}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {popupArtigosInvalidosAberto && (
        <div className="popup-overlay">
          <div className="popup-card">
            <div className="popup-header">
              <h2>Artigos com preço superior</h2>
            </div>

            <p className="popup-text">
              Os artigos abaixo foram selecionados para impressão, mas têm o
              PVP2 anterior menor ou igual ao PVP2 atual.
            </p>

            <div className="popup-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={copiarCodigosInvalidosEProsseguir}
              >
                Copiar código
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={fecharPopupEProsseguir}
              >
                Fechar e prosseguir
              </button>
            </div>

            <div className="popup-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Designação</th>
                    <th>PVP2 Antes</th>
                    <th>PVP2 Atual</th>
                  </tr>
                </thead>

                <tbody>
                  {artigosInvalidosPopup.map((item) => (
                    <tr key={item.id}>
                      <td>{item.codigo}</td>
                      <td>{item.descricao}</td>
                      <td>{formatarEuro(item.antes)}€</td>
                      <td>{formatarEuro(item.atual)}€</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className={`print-area formato-${formatoEtiqueta}`}>
        {paginas.map((pagina, pageIndex) => (
          <div
            key={pageIndex}
            className={`sheet ${
              formatoEtiqueta === "a5" ? "sheet-a5" : "sheet-a6"
            }`}
          >
            {pagina.map((item) => {
              const desconto = Math.max(0, item.antes - item.atual);
              const textoValidade = obterTextoValidade(item, anoValidade);

              return (
                <div
                  key={item.id}
                  className={`label ${
                    formatoEtiqueta === "a5" ? "label-a5" : "label-a6"
                  }`}
                >
                  {formatoEtiqueta === "a5" ? (
                    <div className="label-a5-rotator">
                      <div className="label-inner">
                        <div className="topbar">
                          <img src={logo} alt="Expert" className="print-logo" />
                        </div>

                        <div className="content">
                          <div className="topo">
                            <div className="codigo">{item.codigo}</div>
                            <div className="titulo">{titulo}</div>
                            <DescricaoAuto
                              texto={item.descricao}
                              formatoEtiqueta={formatoEtiqueta}
                            />
                          </div>

                          <div className="precos">
                            <div className="linha-preco">
                              <PrecoAntesAuto
                                valor={item.antes}
                                formatoEtiqueta={formatoEtiqueta}
                              />
                            </div>

                            <div className="linha-preco desconto-linha">
                              <DescontoAuto
                                valor={desconto}
                                formatoEtiqueta={formatoEtiqueta}
                              />
                            </div>

                            <div className="linha-preco">
                              <PrecoAtualAuto
                                valor={item.atual}
                                formatoEtiqueta={formatoEtiqueta}
                              />
                            </div>
                          </div>

                          <div className="rodape">
                            <Barcode value={item.ean} />

                            <div className="validade">{textoValidade}</div>

                            <div className="nota">
                              VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock
                              existente e não acumulável com outras promoções.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="label-inner">
                      <div className="topbar">
                        <img src={logo} alt="Expert" className="print-logo" />
                      </div>

                      <div className="content">
                        <div className="topo">
                          <div className="codigo">{item.codigo}</div>
                          <div className="titulo">{titulo}</div>
                          <DescricaoAuto
                            texto={item.descricao}
                            formatoEtiqueta={formatoEtiqueta}
                          />
                        </div>

                        <div className="precos">
                          <div className="linha-preco">
                            <PrecoAntesAuto
                              valor={item.antes}
                              formatoEtiqueta={formatoEtiqueta}
                            />
                          </div>

                          <div className="linha-preco desconto-linha">
                            <DescontoAuto
                              valor={desconto}
                              formatoEtiqueta={formatoEtiqueta}
                            />
                          </div>

                          <div className="linha-preco">
                            <PrecoAtualAuto
                              valor={item.atual}
                              formatoEtiqueta={formatoEtiqueta}
                            />
                          </div>
                        </div>

                        <div className="rodape">
                          <Barcode value={item.ean} />

                          <div className="validade">{textoValidade}</div>

                          <div className="nota">
                            VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock
                            existente e não acumulável com outras promoções.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {formatoEtiqueta === "a5" && pagina.length === 1 ? (
              <div className="label label-a5 label-vazia">
                <div className="label-inner"></div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
