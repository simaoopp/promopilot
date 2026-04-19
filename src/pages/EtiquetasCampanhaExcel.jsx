import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { printDocument } from "../utils/print";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import logo from "../logo.png";
import Barcode from "../components/Barcode";
import FilterMenu from "../components/FilterMenu";
import "../styles/styles.css";

import { formatarEuro, parseNumero } from "../utils/formatters";
import { useAutoFontSize } from "../utils/useAutoFontSize";
import {
  addCampaignToHistory,
  createCampaignSnapshot,
} from "../utils/campaignHistory";
import {
  aplicarFiltroTexto,
  compararNumero,
  dividirEmPaginas,
} from "../utils/filters";
import { TABLE_COLUMNS } from "../data/tableColumns";

/* =========================================================
   AUTO TEXT
   ========================================================= */
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

/* =========================================================
   HELPERS
   ========================================================= */
function normalizarCabecalho(texto) {
  return String(texto || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/_/g, " ");
}

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obterValor(normalizado, chaves = [], fallback = "") {
  for (const chave of chaves) {
    if (normalizado[chave] !== undefined && normalizado[chave] !== null) {
      return normalizado[chave];
    }
  }
  return fallback;
}

function formatarDataDiaMes(data) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

function mapearLinhaExcel(row, index) {
  const normalizado = {};

  Object.keys(row || {}).forEach((key) => {
    normalizado[normalizarCabecalho(key)] = row[key];
  });

  return {
    id: `excel-${index}`,
    codigo: obterValor(normalizado, ["CODIGO", "CÓDIGO", "ARTIGO"], ""),
    descricao: obterValor(
      normalizado,
      ["DESCRICAO", "DESCRIÇÃO", "DESIGNACAO", "DESIGNAÇÃO"],
      "",
    ),
    pn: obterValor(normalizado, ["PN", "PART NUMBER"], ""),
    ean: obterValor(normalizado, ["EAN", "CODIGO BARRAS", "CÓDIGO BARRAS"], ""),
    antes: parseNumero(
      obterValor(
        normalizado,
        ["PVP2 ANTES", "ANTES", "PRECO ANTES", "PREÇO ANTES"],
        0,
      ),
    ),
    atual: parseNumero(
      obterValor(
        normalizado,
        ["PVP2 ATUAL", "ATUAL", "PRECO ATUAL", "PREÇO ATUAL"],
        0,
      ),
    ),
    pv3: obterValor(normalizado, ["PV3"], ""),
    estado: obterValor(normalizado, ["ESTADO"], ""),
    ae: obterValor(normalizado, ["AE"], ""),
    aea: obterValor(normalizado, ["AEA"], ""),
    aev: obterValor(normalizado, ["AEV"], ""),
    a10: obterValor(normalizado, ["A10"], ""),
    a1e: obterValor(normalizado, ["A1E"], ""),
    data: obterValor(normalizado, ["DATA"], ""),
    dataInicio: obterValor(
      normalizado,
      ["DATA INICIO", "DATA INÍCIO", "DATA_INICIO"],
      "",
    ),
    dataFim: obterValor(normalizado, ["DATA FIM", "DATA_FIM"], ""),
    alterado: obterValor(normalizado, ["ALTERADO PRIMAVERA", "ALTERADO"], ""),
    info: obterValor(normalizado, ["INFORMAÇÃO", "INFORMACAO", "INFO"], ""),
    selecionado: false,
  };
}

function obterFormatoAutomaticoEtiqueta(descricao = "") {
  const texto = normalizarTexto(descricao);

  const palavrasA5 = [
    "maquina de lavar",
    "máquina de lavar",
    "maquina de secar",
    "máquina de secar",
    "lavar e secar",
    "maquina lavar e secar",
    "máquina lavar e secar",
    "maquina de lavar loica",
    "máquina de lavar loiça",
    "maquina de lavar louca",
    "televisao",
    "televisão",
    "tv ",
    " tv",
    "monitor",
    "frigorifico",
    "frigorífico",
    "frigo",
    "cadeira",
    "mesa",
    "fogao",
    "fogão",
    "arca",
    "chamine",
    "chaminé",
    "exaustor",
    "cave de vinho",
    "caves de vinho",
  ];

  const isA5 = palavrasA5.some((palavra) => texto.includes(palavra));
  return isA5 ? "a5" : "a6";
}

function obterTextoValidade(item, anoValidade) {
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
      hoje,
    )}/${hoje.getFullYear()} A ${formatarDataDiaMes(fim)}/${fim.getFullYear()}`;
  }

  return `VÁLIDO DE ${dataInicio || "-"}${
    dataInicio ? `/${anoValidade}` : ""
  } A ${dataFim || "-"}${dataFim ? `/${anoValidade}` : ""}`;
}

function obterFormatoFinalEtiqueta(
  item,
  formatoAutomaticoAtivo,
  formatoManual,
) {
  if (!formatoAutomaticoAtivo) return formatoManual;
  return obterFormatoAutomaticoEtiqueta(item.descricao);
}

/* =========================================================
   COMPONENTE
   ========================================================= */
export default function EtiquetasExcelPage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [titulo, setTitulo] = useState("PROMO");
  const [anoValidade, setAnoValidade] = useState(new Date().getFullYear());
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nomeFicheiro, setNomeFicheiro] = useState("");
  const [formatoEtiqueta, setFormatoEtiqueta] = useState("a6");
  const [formatoAutomaticoAtivo, setFormatoAutomaticoAtivo] = useState(true);

  const [popupArtigosInvalidosAberto, setPopupArtigosInvalidosAberto] =
    useState(false);
  const [artigosInvalidosPopup, setArtigosInvalidosPopup] = useState([]);

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

  const ordenarLista = useCallback(
  (lista) => {
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
  },
  [ordenacao],
);

  async function carregarExcel(event) {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setNomeFicheiro(file.name);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);

      const nomeSheet =
        workbook.SheetNames.find(
          (name) => normalizarCabecalho(name) === "RELATORIO DIARIO ALTERACOES",
        ) || workbook.SheetNames[0];

      const sheet = workbook.Sheets[nomeSheet];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const linhas = rows
        .map((row, index) => mapearLinhaExcel(row, index))
        .filter((item) => item.codigo || item.descricao || item.ean);

      if (!linhas.length) {
        throw new Error("Sem linhas válidas");
      }

      setDados(linhas);
    } catch (error) {
      console.error("Erro ao ler Excel:", error);
      toast.error("Não foi possível ler o ficheiro Excel.");
    } finally {
      setLoading(false);
      event.target.value = "";
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
}, [dados, filtros, ordenarLista]);

  const selecionados = useMemo(
    () => dados.filter((item) => item.selecionado),
    [dados],
  );

  const selecionadosComFormato = useMemo(() => {
    return selecionados.map((item) => ({
      ...item,
      formato_final: obterFormatoFinalEtiqueta(
        item,
        formatoAutomaticoAtivo,
        formatoEtiqueta,
      ),
    }));
  }, [selecionados, formatoAutomaticoAtivo, formatoEtiqueta]);

  const selecionadosA5 = useMemo(
    () => selecionadosComFormato.filter((item) => item.formato_final === "a5"),
    [selecionadosComFormato],
  );

  const selecionadosA6 = useMemo(
    () => selecionadosComFormato.filter((item) => item.formato_final === "a6"),
    [selecionadosComFormato],
  );

  const paginasA5 = useMemo(
    () => dividirEmPaginas(selecionadosA5, 2),
    [selecionadosA5],
  );

  const paginasA6 = useMemo(
    () => dividirEmPaginas(selecionadosA6, 4),
    [selecionadosA6],
  );

  function alternarSelecionado(id) {
    setDados((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selecionado: !item.selecionado } : item,
      ),
    );
  }

  function selecionarTodosFiltrados() {
    const ids = new Set(dadosFiltrados.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        ids.has(item.id) ? { ...item, selecionado: true } : item,
      ),
    );
  }

  function desmarcarTodosFiltrados() {
    const ids = new Set(dadosFiltrados.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        ids.has(item.id) ? { ...item, selecionado: false } : item,
      ),
    );
  }

  function limparSelecao() {
    setDados((prev) => prev.map((item) => ({ ...item, selecionado: false })));
  }

  function removerInvalidosDaSelecao() {
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        idsInvalidos.has(item.id) ? { ...item, selecionado: false } : item,
      ),
    );
  }

  async function guardarCampanhaNoHistorico(origem = "manual") {
    const itensSelecionados = dados.filter((item) => item.selecionado);

    if (!itensSelecionados.length) return false;

    const store = String(profile?.store || "").trim();

    if (!store || !user?.id) {
      console.warn(
        "Sem utilizador autenticado ou loja associada; campanha não foi guardada.",
      );
      return false;
    }

    const nomeCompleto =
      `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

    const snapshot = createCampaignSnapshot({
      titulo,
      dados: itensSelecionados,
      anoValidade,
      formatoEtiqueta,
      origem,
      createdBy: nomeCompleto || "Utilizador",
      createdByEmail: user?.email || "",
      store,
      userId: user.id,
    });

    try {
      await addCampaignToHistory(snapshot);
      return true;
    } catch (error) {
      console.error("Não foi possível guardar a campanha no histórico.", error);
      toast.error("Não foi possível guardar a campanha no histórico.");
      return false;
    }
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
      (item) => !idsInvalidos.has(item.id),
    );

    removerInvalidosDaSelecao();
    setPopupArtigosInvalidosAberto(false);

    if (restantesValidos.length === 0) {
      toast.warning("Não existem etiquetas válidas para imprimir.");
      return;
    }

    await guardarCampanhaNoHistorico("impressao");

    await printDocument();
  }

  async function fecharPopupEProsseguir() {
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));
    const restantesValidos = selecionados.filter(
      (item) => !idsInvalidos.has(item.id),
    );

    removerInvalidosDaSelecao();
    setPopupArtigosInvalidosAberto(false);

    if (restantesValidos.length === 0) {
      toast.warning("Não existem etiquetas válidas para imprimir.");
      return;
    }

    await guardarCampanhaNoHistorico("impressao");

    await printDocument();
  }
  async function imprimirSelecionados() {
    if (selecionados.length === 0) {
      toast.warning("Seleciona pelo menos um artigo.");
      return;
    }

    const invalidos = selecionados.filter(
      (item) =>
        Number(item.antes) > 0 &&
        Number(item.atual) > 0 &&
        Number(item.antes) <= Number(item.atual),
    );

    if (invalidos.length > 0) {
      setArtigosInvalidosPopup(invalidos);
      setPopupArtigosInvalidosAberto(true);
      return;
    }

    await guardarCampanhaNoHistorico("impressao");
    await printDocument();
  }

  function renderEtiqueta(item, formatoAtual) {
    const desconto = Math.max(0, item.antes - item.atual);
    const textoValidade = obterTextoValidade(item, anoValidade);

    return (
      <div
        key={item.id}
        className={`label ${formatoAtual === "a5" ? "label-a5" : "label-a6"}`}
      >
        {formatoAtual === "a5" ? (
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
                    formatoEtiqueta={formatoAtual}
                  />
                </div>

                <div className="precos">
                  <div className="linha-preco">
                    <PrecoAntesAuto
                      valor={item.antes}
                      formatoEtiqueta={formatoAtual}
                    />
                  </div>

                  <div className="linha-preco desconto-linha">
                    <DescontoAuto
                      valor={desconto}
                      formatoEtiqueta={formatoAtual}
                    />
                  </div>

                  <div className="linha-preco">
                    <PrecoAtualAuto
                      valor={item.atual}
                      formatoEtiqueta={formatoAtual}
                    />
                  </div>
                </div>

                <div className="rodape">
                  <Barcode value={item.ean} />

                  <div className="validade">{textoValidade}</div>

                  <div className="nota">
                    VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock existente e
                    não acumulável com outras promoções.
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
                  formatoEtiqueta={formatoAtual}
                />
              </div>

              <div className="precos">
                <div className="linha-preco">
                  <PrecoAntesAuto
                    valor={item.antes}
                    formatoEtiqueta={formatoAtual}
                  />
                </div>

                <div className="linha-preco desconto-linha">
                  <DescontoAuto
                    valor={desconto}
                    formatoEtiqueta={formatoAtual}
                  />
                </div>

                <div className="linha-preco">
                  <PrecoAtualAuto
                    valor={item.atual}
                    formatoEtiqueta={formatoAtual}
                  />
                </div>
              </div>

              <div className="rodape">
                <Barcode value={item.ean} />

                <div className="validade">{textoValidade}</div>

                <div className="nota">
                  VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock existente e
                  não acumulável com outras promoções.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="page-content no-print">
        <div className="page-header">
          <div>
            <h1 className="page-title">Etiquetas de Campanha em Excel</h1>
            <p className="page-subtitle">
              Importa um ficheiro Excel, filtra os artigos e imprime apenas as
              etiquetas selecionadas.
            </p>
          </div>
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
              <div className="ano-formato-row ano-formato-row-advanced">
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
                  disabled={formatoAutomaticoAtivo}
                >
                  Formato manual: {formatoEtiqueta.toUpperCase()}
                </button>

                <button
                  type="button"
                  className={`btn ${
                    formatoAutomaticoAtivo ? "btn-primary" : "btn-secondary"
                  } formato-btn`}
                  onClick={() => setFormatoAutomaticoAtivo((prev) => !prev)}
                >
                  Automático: {formatoAutomaticoAtivo ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>

          <div className="input-group">
            <span>Importar ficheiro Excel</span>
            <input
              type="file"
              accept=".xlsx,.xls,.xlsb,.csv,.ods"
              onChange={carregarExcel}
            />
            {nomeFicheiro ? <small>Ficheiro: {nomeFicheiro}</small> : null}
            {loading ? <small>A carregar Excel...</small> : null}
          </div>

          <div className="toolbar-actions">
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

            <div className="resumo-card">
              <span className="resumo-label">Modo formato</span>
              <strong>
                {formatoAutomaticoAtivo ? "Automático" : "Manual"}
              </strong>
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
                                filtroAberto === col.key ? null : col.key,
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
                      Importa um ficheiro Excel para carregar os artigos.
                    </td>
                  </tr>
                ) : (
                  dadosFiltrados.map((item) => {
                    const formatoPrevisto = obterFormatoFinalEtiqueta(
                      item,
                      formatoAutomaticoAtivo,
                      formatoEtiqueta,
                    );

                    return (
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
                        <td>{`${item.info}${item.info ? " · " : ""}${formatoPrevisto.toUpperCase()}`}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {popupArtigosInvalidosAberto && (
        <div className="popup-overlay">
          <div className="popup-card">
            <div className="popup-header">
              <h2>Artigos com preço inválido</h2>
            </div>

            <p className="popup-text">
              Os artigos abaixo foram selecionados para impressão, mas têm o
              PVP2 atual maior ou igual ao PVP2 antes.
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

      <div className="print-area">
        {paginasA5.map((pagina, pageIndex) => (
          <div key={`a5-${pageIndex}`} className="sheet sheet-a5">
            {pagina.map((item) => renderEtiqueta(item, "a5"))}

            {pagina.length === 1 ? (
              <div className="label label-a5 label-vazia">
                <div className="label-inner"></div>
              </div>
            ) : null}
          </div>
        ))}

        {paginasA6.map((pagina, pageIndex) => (
          <div key={`a6-${pageIndex}`} className="sheet sheet-a6">
            {pagina.map((item) => renderEtiqueta(item, "a6"))}
          </div>
        ))}
      </div>
    </>
  );
}
