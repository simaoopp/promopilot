import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { printDocument } from "../utils/print";
import {
  aplicarComparacaoPvp3NoArtigo,
  artigoElegivelComparacaoPvp3,
  criarIdsComparacaoPvp3,
  obterCodigosParaCopiar,
} from "../utils/pvp3Promotion";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import "../styles/styles.css";
import { parseNumero } from "../utils/formatters";
import { addCampaignToHistory, createCampaignSnapshot } from "../utils/campaignHistory";
import { aplicarFiltroTexto, compararNumero, dividirEmPaginas } from "../utils/filters";
import EditableCampaignDate from "../components/EditableCampaignDate";
import { obterDataInputCampanha } from "../utils/campaignDates";
import { campanhaSemDataDefinida, limparDatasCampanhaItem } from "../utils/campaignTitleRules";
import ExcelCampaignToolbar from "../features/campaign/excel/ExcelCampaignToolbar";
import ExcelCampaignTable from "../features/campaign/excel/ExcelCampaignTable";
import ExcelInvalidItemsModal from "../features/campaign/excel/ExcelInvalidItemsModal";
import ExcelCampaignPrintArea from "../features/campaign/excel/ExcelCampaignPrintArea";
import ShoppingPriceSelector from "../features/campaign/excel/ShoppingPriceSelector";
import {
  CAMPANHA_PRIMARY_COLUMNS,
  CAMPANHA_TABLE_COLUMNS,
  EXCEL_FORMATS,
  SHOPPING_PRIMARY_COLUMNS,
  SHOPPING_TABLE_COLUMNS,
  detetarFormatoExcel,
  formatarDataInputDiaMes,
  mapearLinhaExcel,
  normalizarCabecalho,
  obterFormatoFinalEtiqueta,
  recalcularSelecaoPrecosShopping,
  renderExcelTableCell,
} from "../features/campaign/excel/excelCampaignUtils";

export default function EtiquetasExcelPage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [titulo, setTitulo] = useState("PROMO");
  const [anoValidade, setAnoValidade] = useState(new Date().getFullYear());
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nomeFicheiro, setNomeFicheiro] = useState("");
  const [formatoEtiqueta, setFormatoEtiqueta] = useState("a6");
  const [formatoAutomaticoAtivo, setFormatoAutomaticoAtivo] = useState(false);
  const [modeloImportado, setModeloImportado] = useState(EXCEL_FORMATS.CAMPANHA);
  const [dataInicioShopping, setDataInicioShopping] = useState("");
  const [dataFimShopping, setDataFimShopping] = useState("");
  const [dataInicioCampanhaGeral, setDataInicioCampanhaGeral] = useState("");
  const [dataFimCampanhaGeral, setDataFimCampanhaGeral] = useState("");

  const [popupArtigosInvalidosAberto, setPopupArtigosInvalidosAberto] =
    useState(false);
  const [artigosInvalidosPopup, setArtigosInvalidosPopup] = useState([]);
  const [idsComparacaoPvp3Popup, setIdsComparacaoPvp3Popup] = useState(
    () => new Set(),
  );

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
    comparacao: { contains: "", equals: "" },
    ae: { op: "", valor: "" },
    aea: { op: "", valor: "" },
    aev: { op: "", valor: "" },
    a10: { op: "", valor: "" },
    a1e: { op: "", valor: "" },
    antes: { op: "", valor: "" },
    atual: { op: "", valor: "" },
    nossoPreco: { op: "", valor: "" },
    worten: { op: "", valor: "" },
    radioPopular: { op: "", valor: "" },
    menorConcorrente: { op: "", valor: "" },
  });
  const [mostrarTabelaCompleta, setMostrarTabelaCompleta] = useState(false);
  const filterButtonRefs = useRef({});

  const colunasTabelaAtivas = useMemo(
    () =>
      modeloImportado === EXCEL_FORMATS.SHOPPING
        ? SHOPPING_TABLE_COLUMNS
        : CAMPANHA_TABLE_COLUMNS,
    [modeloImportado],
  );

  const colunasResumoAtivas = useMemo(
    () =>
      modeloImportado === EXCEL_FORMATS.SHOPPING
        ? SHOPPING_PRIMARY_COLUMNS
        : CAMPANHA_PRIMARY_COLUMNS,
    [modeloImportado],
  );

  const campanhaSemDatas = useMemo(
    () => campanhaSemDataDefinida(titulo),
    [titulo],
  );

  useEffect(() => {
    if (!campanhaSemDatas) return;

    setDataInicioCampanhaGeral("");
    setDataFimCampanhaGeral("");
    setDataInicioShopping("");
    setDataFimShopping("");
    setDados((prev) => prev.map(limparDatasCampanhaItem));
  }, [campanhaSemDatas]);

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

  const ordenarLista = useCallback(
    (lista) => {
      if (!ordenacao.coluna || !ordenacao.direcao) return lista;

      const copia = [...lista];

      copia.sort((a, b) => {
        const va = a[ordenacao.coluna];
        const vb = b[ordenacao.coluna];

        const aNum = parseNumero(va);
        const bNum = parseNumero(vb);
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

  function extrairPrimeiraDataCampanha(linhas, campo) {
    const itemComData = linhas.find(
      (item) =>
        item.tipo_registo === EXCEL_FORMATS.CAMPANHA &&
        String(item?.[campo] || "").trim(),
    );

    return itemComData ? obterDataInputCampanha(itemComData[campo], anoValidade) : "";
  }

  function aplicarDatasGeraisCampanha(linhas, dataInicioIso, dataFimIso) {
    const dataInicioFormatada = formatarDataInputDiaMes(dataInicioIso);
    const dataFimFormatada = formatarDataInputDiaMes(dataFimIso);

    return linhas.map((item) => {
      if (item.tipo_registo !== EXCEL_FORMATS.CAMPANHA) return item;

      return {
        ...item,
        dataInicio: dataInicioFormatada || item.dataInicio || "",
        dataFim: dataFimFormatada || item.dataFim || "",
      };
    });
  }

  function atualizarDataGeralCampanha(campo, valor) {
    if (campanhaSemDatas) return;

    const valorFormatado = formatarDataInputDiaMes(valor);

    if (campo === "dataInicio") {
      setDataInicioCampanhaGeral(valor);
    } else {
      setDataFimCampanhaGeral(valor);
    }

    setDados((prev) =>
      prev.map((item) =>
        item.tipo_registo === EXCEL_FORMATS.CAMPANHA
          ? { ...item, [campo]: valorFormatado }
          : item,
      ),
    );
  }

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
      const formatoExcel = detetarFormatoExcel(rows);

      const linhas = rows
        .map((row, index) => mapearLinhaExcel(row, index, formatoExcel))
        .filter((item) => item.codigo || item.descricao || item.ean);

      if (!linhas.length) {
        throw new Error("Sem linhas válidas");
      }

      const linhasNormalizadas = campanhaSemDatas
        ? linhas.map(limparDatasCampanhaItem)
        : linhas;
      const dataInicioCapturada =
        !campanhaSemDatas && formatoExcel === EXCEL_FORMATS.CAMPANHA
          ? extrairPrimeiraDataCampanha(linhasNormalizadas, "dataInicio")
          : "";
      const dataFimCapturada =
        !campanhaSemDatas && formatoExcel === EXCEL_FORMATS.CAMPANHA
          ? extrairPrimeiraDataCampanha(linhasNormalizadas, "dataFim")
          : "";
      const dataInicioBase = dataInicioCapturada || dataInicioCampanhaGeral;
      const dataFimBase = dataFimCapturada || dataFimCampanhaGeral;

      setModeloImportado(formatoExcel);
      setDataInicioShopping("");
      setDataFimShopping("");
      setDataInicioCampanhaGeral(campanhaSemDatas ? "" : dataInicioBase);
      setDataFimCampanhaGeral(campanhaSemDatas ? "" : dataFimBase);
      setMostrarTabelaCompleta(false);
      setOrdenacao({ coluna: "", direcao: "" });
      setFiltroAberto(null);
      setDados(
        !campanhaSemDatas && formatoExcel === EXCEL_FORMATS.CAMPANHA
          ? aplicarDatasGeraisCampanha(linhasNormalizadas, dataInicioBase, dataFimBase)
          : linhasNormalizadas,
      );

      toast.success(
        formatoExcel === EXCEL_FORMATS.SHOPPING
          ? "Excel Shopping importado com sucesso."
          : "Excel de campanha importado com sucesso.",
      );
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

      if (modeloImportado === EXCEL_FORMATS.SHOPPING) {
        const comparacaoOk = aplicarFiltroTexto(
          item.comparacao,
          filtros.comparacao,
        );
        const nossoPrecoOk = compararNumero(
          item.nossoPreco,
          filtros.nossoPreco.op,
          filtros.nossoPreco.valor,
        );
        const wortenOk = compararNumero(
          item.worten,
          filtros.worten.op,
          filtros.worten.valor,
        );
        const radioPopularOk = compararNumero(
          item.radioPopular,
          filtros.radioPopular.op,
          filtros.radioPopular.valor,
        );
        const menorConcorrenteOk = compararNumero(
          item.menorConcorrente,
          filtros.menorConcorrente.op,
          filtros.menorConcorrente.valor,
        );

        return (
          codigoOk &&
          descricaoOk &&
          comparacaoOk &&
          nossoPrecoOk &&
          wortenOk &&
          radioPopularOk &&
          menorConcorrenteOk
        );
      }

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
  }, [dados, filtros, modeloImportado, ordenarLista]);

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

  function atualizarPrecoShopping(id, atualizacoes) {
    setDados((prev) =>
      prev.map((item) => {
        if (item.id !== id || item.tipo_registo !== EXCEL_FORMATS.SHOPPING) {
          return item;
        }

        return recalcularSelecaoPrecosShopping({
          ...item,
          ...atualizacoes,
        });
      }),
    );
  }

  function atualizarDatasShopping(campo, valor) {
    if (campanhaSemDatas) return;

    const dataFormatada = formatarDataInputDiaMes(valor);

    if (campo === "dataInicio") {
      setDataInicioShopping(valor);
    } else {
      setDataFimShopping(valor);
    }

    setDados((prev) =>
      prev.map((item) =>
        item.tipo_registo === EXCEL_FORMATS.SHOPPING
          ? { ...item, [campo]: dataFormatada }
          : item,
      ),
    );
  }

  function atualizarDataCampanha(id, campo, valor) {
    if (campanhaSemDatas) return;

    setDados((prev) =>
      prev.map((item) => {
        if (item.id !== id || item.tipo_registo === EXCEL_FORMATS.SHOPPING) {
          return item;
        }

        return { ...item, [campo]: valor };
      }),
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

  function alternarComparacaoPvp3Popup(item) {
    if (!artigoElegivelComparacaoPvp3(item)) return;

    setIdsComparacaoPvp3Popup((prev) => {
      const next = new Set(prev);

      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }

      return next;
    });
  }

  function selecionarTodosComparacaoPvp3Popup() {
    setIdsComparacaoPvp3Popup(
      new Set(
        artigosInvalidosPopup
          .filter(artigoElegivelComparacaoPvp3)
          .map((item) => item.id),
      ),
    );
  }

  function desmarcarTodosComparacaoPvp3Popup() {
    setIdsComparacaoPvp3Popup(new Set());
  }

  async function resolverPopupArtigosInvalidos({ copiarCodigos }) {
    const comparacaoPvp3Ativa = modeloImportado === EXCEL_FORMATS.CAMPANHA;
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));
    const idsComparacaoPvp3 = comparacaoPvp3Ativa
      ? criarIdsComparacaoPvp3(artigosInvalidosPopup, idsComparacaoPvp3Popup)
      : new Set();

    if (copiarCodigos) {
      const texto = comparacaoPvp3Ativa
        ? obterCodigosParaCopiar(artigosInvalidosPopup, idsComparacaoPvp3)
        : artigosInvalidosPopup
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
    }

    const restantesValidos = selecionados.filter(
      (item) => !idsInvalidos.has(item.id) || idsComparacaoPvp3.has(item.id),
    );

    setDados((prev) =>
      prev.map((item) => {
        if (!idsInvalidos.has(item.id)) return item;

        if (idsComparacaoPvp3.has(item.id)) {
          return aplicarComparacaoPvp3NoArtigo(item);
        }

        return { ...item, selecionado: false };
      }),
    );
    setPopupArtigosInvalidosAberto(false);
    setIdsComparacaoPvp3Popup(new Set());

    if (restantesValidos.length === 0) {
      toast.warning("Não existem etiquetas válidas para imprimir.");
      return;
    }

    await guardarCampanhaNoHistorico("impressao");
    await printDocument();
  }

  async function copiarCodigosInvalidosEProsseguir() {
    await resolverPopupArtigosInvalidos({ copiarCodigos: true });
  }

  async function fecharPopupEProsseguir() {
    await resolverPopupArtigosInvalidos({ copiarCodigos: false });
  }

  async function imprimirSelecionados() {
    if (selecionados.length === 0) {
      toast.warning("Seleciona pelo menos um artigo.");
      return;
    }

    const invalidos = selecionados.filter((item) => {
      if (item.tipo_registo === EXCEL_FORMATS.SHOPPING) {
        return (
          parseNumero(item.antes) > 0 &&
          parseNumero(item.atual) > 0 &&
          parseNumero(item.antes) <= parseNumero(item.atual)
        );
      }

      return (
        parseNumero(item.antes) > 0 &&
        parseNumero(item.atual) > 0 &&
        parseNumero(item.antes) <= parseNumero(item.atual)
      );
    });

    if (invalidos.length > 0) {
      setArtigosInvalidosPopup(invalidos);
      setIdsComparacaoPvp3Popup(new Set());
      setPopupArtigosInvalidosAberto(true);
      return;
    }

    await guardarCampanhaNoHistorico("impressao");
    await printDocument();
  }

  function renderTableCell(item, col, formatoPrevisto = "") {
    if (
      item.tipo_registo === EXCEL_FORMATS.SHOPPING &&
      col.key === "precoSemDescontoSelecionado"
    ) {
      return (
        <ShoppingPriceSelector
          item={item}
          tipo="semDesconto"
          atualizarPrecoShopping={atualizarPrecoShopping}
        />
      );
    }

    if (
      item.tipo_registo === EXCEL_FORMATS.SHOPPING &&
      col.key === "precoComDescontoSelecionado"
    ) {
      return (
        <ShoppingPriceSelector
          item={item}
          tipo="comDesconto"
          atualizarPrecoShopping={atualizarPrecoShopping}
        />
      );
    }

    if (
      item.tipo_registo === EXCEL_FORMATS.CAMPANHA &&
      (col.key === "dataInicio" || col.key === "dataFim")
    ) {
      if (campanhaSemDatas) return "";

      return (
        <EditableCampaignDate
          item={item}
          field={col.key}
          label={col.label}
          anoValidade={anoValidade}
          onChange={atualizarDataCampanha}
        />
      );
    }

    return renderExcelTableCell(item, col.key, formatoPrevisto);
  }

  return (
    <>
      <div className="page-content no-print">
        <div className="page-header">
          <div>
            <h1 className="page-title">Etiquetas de Campanha em Excel</h1>
            <p className="page-subtitle">
              Importa ficheiros Excel em formato Campanha ou Shopping, filtra os
              artigos e imprime apenas as etiquetas selecionadas.
            </p>
          </div>
        </div>

        <ExcelCampaignToolbar
          titulo={titulo}
          setTitulo={setTitulo}
          campanhaSemDatas={campanhaSemDatas}
          anoValidade={anoValidade}
          setAnoValidade={setAnoValidade}
          formatoEtiqueta={formatoEtiqueta}
          setFormatoEtiqueta={setFormatoEtiqueta}
          formatoAutomaticoAtivo={formatoAutomaticoAtivo}
          setFormatoAutomaticoAtivo={setFormatoAutomaticoAtivo}
          carregarExcel={carregarExcel}
          nomeFicheiro={nomeFicheiro}
          loading={loading}
          modeloImportado={modeloImportado}
          dadosTotal={dados.length}
          dataInicioCampanhaGeral={dataInicioCampanhaGeral}
          dataFimCampanhaGeral={dataFimCampanhaGeral}
          atualizarDataGeralCampanha={atualizarDataGeralCampanha}
          dataInicioShopping={dataInicioShopping}
          dataFimShopping={dataFimShopping}
          atualizarDatasShopping={atualizarDatasShopping}
          filtradosTotal={dadosFiltrados.length}
          selecionadosTotal={selecionados.length}
          selecionarTodosFiltrados={selecionarTodosFiltrados}
          desmarcarTodosFiltrados={desmarcarTodosFiltrados}
          limparSelecao={limparSelecao}
          imprimirSelecionados={imprimirSelecionados}
        />

        <ExcelCampaignTable
          mostrarTabelaCompleta={mostrarTabelaCompleta}
          setMostrarTabelaCompleta={setMostrarTabelaCompleta}
          colunasTabelaAtivas={colunasTabelaAtivas}
          colunasResumoAtivas={colunasResumoAtivas}
          dadosFiltrados={dadosFiltrados}
          filtroAberto={filtroAberto}
          setFiltroAberto={setFiltroAberto}
          filtros={filtros}
          filterButtonRefs={filterButtonRefs}
          atualizarFiltroPopup={atualizarFiltroPopup}
          setOrdenacao={setOrdenacao}
          limparFiltro={limparFiltro}
          alternarSelecionado={alternarSelecionado}
          renderTableCell={renderTableCell}
          formatoAutomaticoAtivo={formatoAutomaticoAtivo}
          formatoEtiqueta={formatoEtiqueta}
        />
      </div>

      <ExcelInvalidItemsModal
        aberto={popupArtigosInvalidosAberto}
        modeloImportado={modeloImportado}
        artigosInvalidosPopup={artigosInvalidosPopup}
        idsComparacaoPvp3Popup={idsComparacaoPvp3Popup}
        selecionarTodosComparacaoPvp3Popup={selecionarTodosComparacaoPvp3Popup}
        desmarcarTodosComparacaoPvp3Popup={desmarcarTodosComparacaoPvp3Popup}
        copiarCodigosInvalidosEProsseguir={copiarCodigosInvalidosEProsseguir}
        fecharPopupEProsseguir={fecharPopupEProsseguir}
        alternarComparacaoPvp3Popup={alternarComparacaoPvp3Popup}
      />

      <ExcelCampaignPrintArea
        paginasA5={paginasA5}
        paginasA6={paginasA6}
        anoValidade={anoValidade}
        titulo={titulo}
      />
    </>
  );
}
