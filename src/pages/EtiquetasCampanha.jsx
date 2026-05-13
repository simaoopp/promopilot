import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { printDocument } from "../utils/print";
import {
  aplicarComparacaoPvp3NoArtigo,
  artigoElegivelComparacaoPvp3,
  criarIdsComparacaoPvp3,
  obterCodigosParaCopiar,
} from "../utils/pvp3Promotion";
import {
  ensureCatalogoPesquisaPronto,
  getCatalogoPesquisaSnapshot,
  pesquisarNoCatalogoPreparado,
} from "../services/catalogoPesquisaService";
import EditableCampaignDate from "../components/EditableCampaignDate";
import { obterDataInputCampanha } from "../utils/campaignDates";
import { campanhaSemDataDefinida, limparDatasCampanhaItem } from "../utils/campaignTitleRules";
import "../styles/styles.css";
import {
  addCampaignToHistory,
  createCampaignSnapshot,
} from "../utils/campaignHistory";
import { aplicarFiltroTexto, compararNumero } from "../utils/filters";
import { formatarEuro, parseNumero } from "../utils/formatters";
import { PROMOTION_PRICE_SOURCES } from "../utils/promotionPricing";
import { parseTabelaColada } from "../utils/parsers";
import ManualCampaignToolbar from "../features/campaign/manual/ManualCampaignToolbar";
import ManualCampaignTable from "../features/campaign/manual/ManualCampaignTable";
import ManualCreateCampaignModal from "../features/campaign/manual/ManualCreateCampaignModal";
import InvalidCampaignItemsModal from "../features/campaign/manual/InvalidCampaignItemsModal";
import ManualCampaignPrintArea from "../features/campaign/manual/ManualCampaignPrintArea";
import {
  CAMPANHA_TITULO_DEFAULT,
  FILTROS_INICIAIS,
  construirPaginasImpressao,
  converterPreco,
  formatarDataDiaMes,
  formatarDataInputParaDiaMes,
  itemTabelaInvalido,
  normalizarTexto,
  obterFormatoAutomaticoEtiqueta,
  obterFormatoEtiquetaItem,
  ordenarLista,
  renderCampaignTableCell,
  somarDias,
} from "../features/campaign/manual/manualCampaignUtils";

export default function EtiquetasPage() {
  const location = useLocation();
  const { user, profile } = useAuth();
  const toast = useToast();

  const [titulo, setTitulo] = useState(CAMPANHA_TITULO_DEFAULT);
  const [textoColado, setTextoColado] = useState("");
  const [anoValidade, setAnoValidade] = useState(new Date().getFullYear());
  const [dataInicioGeral, setDataInicioGeral] = useState("");
  const [dataFimGeral, setDataFimGeral] = useState("");
  const [dados, setDados] = useState([]);
  const [formatoEtiqueta, setFormatoEtiqueta] = useState("a6");
  const [modoFormatoAutomatico, setModoFormatoAutomatico] = useState(true);
  const [promocaoFontePreco, setPromocaoFontePreco] = useState(PROMOTION_PRICE_SOURCES.PVP2);

  const [popupArtigosInvalidosAberto, setPopupArtigosInvalidosAberto] =
    useState(false);
  const [artigosInvalidosPopup, setArtigosInvalidosPopup] = useState([]);
  const [idsComparacaoPvp3Popup, setIdsComparacaoPvp3Popup] = useState(
    () => new Set(),
  );

  const [popupCriarCampanhaAberto, setPopupCriarCampanhaAberto] =
    useState(false);
  const [pesquisaCampanha, setPesquisaCampanha] = useState("");
  const [artigoCampanhaSelecionado, setArtigoCampanhaSelecionado] =
    useState(null);
  const [campanhaAntes, setCampanhaAntes] = useState("");
  const [campanhaAtual, setCampanhaAtual] = useState("");
  const [campanhaValida30Dias, setCampanhaValida30Dias] = useState(true);
  const [campanhaDataInicio, setCampanhaDataInicio] = useState("");
  const [campanhaDataFim, setCampanhaDataFim] = useState("");
  const [erroCampanha, setErroCampanha] = useState("");
  const catalogoInicial = getCatalogoPesquisaSnapshot();
  const [catalogoArtigos, setCatalogoArtigos] = useState(catalogoInicial.items || []);
  const [catalogoLoading, setCatalogoLoading] = useState(!catalogoInicial.ready);
  const [catalogoErro, setCatalogoErro] = useState("");

  const [filtroAberto, setFiltroAberto] = useState(null);
  const [ordenacao, setOrdenacao] = useState({ coluna: "", direcao: "" });
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [mostrarTabelaCompleta, setMostrarTabelaCompleta] = useState(false);
  const filterButtonRefs = useRef({});

  const campanhaSemDatas = useMemo(
    () => campanhaSemDataDefinida(titulo),
    [titulo],
  );

  useEffect(() => {
    const campanhaDuplicada = location.state?.campanhaDuplicada;
    if (!campanhaDuplicada) return;

    setTitulo(campanhaDuplicada.titulo || CAMPANHA_TITULO_DEFAULT);
    setAnoValidade(campanhaDuplicada.anoValidade || new Date().getFullYear());
    setFormatoEtiqueta(campanhaDuplicada.formatoEtiqueta || "a6");
    setDados(
      Array.isArray(campanhaDuplicada.dados)
        ? campanhaDuplicada.dados.map((item, index) => ({
            ...item,
            id: `${item.codigo || "item"}-${Date.now()}-${index}`,
            selecionado: true,
          }))
        : [],
    );
  }, [location.state]);


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

  useEffect(() => {
    let ativo = true;

    async function syncCatalogo() {
      try {
        const snapshot = await ensureCatalogoPesquisaPronto({ pageSize: 5000 });

        if (ativo) {
          setCatalogoArtigos(snapshot.items || []);
          setCatalogoErro("");
        }
      } catch (error) {
        console.error("Não foi possível carregar o catálogo da campanha.", error);

        if (ativo) {
          setCatalogoErro("Não foi possível carregar o catálogo de artigos.");
        }
      } finally {
        if (ativo) {
          setCatalogoLoading(false);
        }
      }
    }

    syncCatalogo();

    return () => {
      ativo = false;
    };
  }, []);


  useEffect(() => {
    if (!campanhaSemDatas) return;

    setDataInicioGeral("");
    setDataFimGeral("");
    setCampanhaDataInicio("");
    setCampanhaDataFim("");
    setDados((prev) => prev.map(limparDatasCampanhaItem));
  }, [campanhaSemDatas]);

  const sugestoesCampanha = useMemo(() => {
    const termo = normalizarTexto(pesquisaCampanha);
    if (termo.length < 2) return [];

    const resultadosCatalogo = pesquisarNoCatalogoPreparado(pesquisaCampanha, { limit: 10 });

    if (resultadosCatalogo.length > 0) {
      return resultadosCatalogo;
    }

    return catalogoArtigos
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
  }, [pesquisaCampanha, catalogoArtigos]);

  const descontoCampanha = useMemo(() => {
    const antes = converterPreco(campanhaAntes);
    const atual = converterPreco(campanhaAtual);
    return Math.max(0, antes - atual);
  }, [campanhaAntes, campanhaAtual]);

  const pvpBaseCampanha = useMemo(
    () => converterPreco(artigoCampanhaSelecionado?.pvp2 || ""),
    [artigoCampanhaSelecionado],
  );

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

    return ordenarLista(filtrados, ordenacao);
  }, [dados, filtros, ordenacao]);

  const selecionados = useMemo(
    () => dados.filter((item) => item.selecionado),
    [dados],
  );

  const itensParaImpressao = useMemo(
    () =>
      selecionados.map((item) => ({
        ...item,
        _formato: obterFormatoEtiquetaItem(
          item,
          modoFormatoAutomatico,
          formatoEtiqueta,
        ),
      })),
    [selecionados, modoFormatoAutomatico, formatoEtiqueta],
  );

  const paginasImpressao = useMemo(
    () =>
      construirPaginasImpressao(
        itensParaImpressao,
        modoFormatoAutomatico,
        formatoEtiqueta,
      ),
    [itensParaImpressao, modoFormatoAutomatico, formatoEtiqueta],
  );

  const modoImpressaoTexto = modoFormatoAutomatico
    ? "Automático A5/A6"
    : `Manual ${formatoEtiqueta.toUpperCase()}`;

  const estadoValidacaoCampanha = useMemo(() => {
    if (
      converterPreco(campanhaAtual) > pvpBaseCampanha &&
      pvpBaseCampanha > 0
    ) {
      return "Preço atual acima do PVP2 base";
    }

    if (erroCampanha) {
      return "Verificar valores";
    }

    return "Pronto para adicionar";
  }, [campanhaAtual, erroCampanha, pvpBaseCampanha]);

  function resetFormularioCampanha() {
    setPesquisaCampanha("");
    setArtigoCampanhaSelecionado(null);
    setCampanhaAntes("");
    setCampanhaAtual("");
    setErroCampanha("");
    setCampanhaValida30Dias(true);
    setCampanhaDataInicio("");
    setCampanhaDataFim("");
  }

  function abrirPopupCriarCampanha() {
    resetFormularioCampanha();
    setPopupCriarCampanhaAberto(true);
  }

  function fecharPopupCriarCampanha() {
    setPopupCriarCampanhaAberto(false);
    resetFormularioCampanha();
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

  function extrairPrimeiraDataCampanha(linhas, campo) {
    const itemComData = linhas.find((item) => String(item?.[campo] || "").trim());
    return itemComData ? obterDataInputCampanha(itemComData[campo], anoValidade) : "";
  }

  function aplicarDatasGeraisEmLinhas(linhas, dataInicioIso, dataFimIso) {
    const dataInicioFormatada = formatarDataInputParaDiaMes(dataInicioIso);
    const dataFimFormatada = formatarDataInputParaDiaMes(dataFimIso);

    return linhas.map((item) => ({
      ...item,
      dataInicio: dataInicioFormatada || item.dataInicio || "",
      dataFim: dataFimFormatada || item.dataFim || "",
    }));
  }

  function atualizarDataGeral(campo, valor) {
    if (campanhaSemDatas) return;

    const valorFormatado = formatarDataInputParaDiaMes(valor);

    if (campo === "dataInicio") {
      setDataInicioGeral(valor);
    } else {
      setDataFimGeral(valor);
    }

    setDados((prev) =>
      prev.map((item) => ({
        ...item,
        [campo]: valorFormatado,
      })),
    );
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

      const linhasNormalizadas = campanhaSemDatas
        ? linhas.map(limparDatasCampanhaItem)
        : linhas;

      if (linhasNormalizadas.some(itemTabelaInvalido)) {
        throw new Error("Dados inválidos");
      }

      if (campanhaSemDatas) {
        setDataInicioGeral("");
        setDataFimGeral("");
        setDados(linhasNormalizadas);
        return;
      }

      const dataInicioCapturada = extrairPrimeiraDataCampanha(linhasNormalizadas, "dataInicio");
      const dataFimCapturada = extrairPrimeiraDataCampanha(linhasNormalizadas, "dataFim");
      const dataInicioBase = dataInicioGeral || dataInicioCapturada;
      const dataFimBase = dataFimGeral || dataFimCapturada;

      if (!dataInicioGeral && dataInicioCapturada) {
        setDataInicioGeral(dataInicioCapturada);
      }

      if (!dataFimGeral && dataFimCapturada) {
        setDataFimGeral(dataFimCapturada);
      }

      setDados(aplicarDatasGeraisEmLinhas(linhasNormalizadas, dataInicioBase, dataFimBase));
    } catch {
      toast.error("Verifica se os dados inseridos estão corretos.");
    }
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

  function atualizarDataCampanha(id, campo, valor) {
    if (campanhaSemDatas) return;

    setDados((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)),
    );
  }

  function renderTabelaCampanhaCell(item, col) {
    if (col.key === "dataInicio" || col.key === "dataFim") {
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

    return renderCampaignTableCell(item, col.key);
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
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));
    const idsComparacaoPvp3 = criarIdsComparacaoPvp3(
      artigosInvalidosPopup,
      idsComparacaoPvp3Popup,
    );

    if (copiarCodigos) {
      const texto = obterCodigosParaCopiar(
        artigosInvalidosPopup,
        idsComparacaoPvp3,
      );

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
    if (!selecionados.length) {
      toast.warning("Seleciona pelo menos um artigo.");
      return;
    }

    const invalidos = selecionados.filter(
      (item) => parseNumero(item.antes) <= parseNumero(item.atual),
    );

    if (invalidos.length > 0) {
      setArtigosInvalidosPopup(invalidos);
      setIdsComparacaoPvp3Popup(new Set());
      setPopupArtigosInvalidosAberto(true);
      return;
    }

    await guardarCampanhaNoHistorico("impressao");
    await printDocument();
  }

  function adicionarArtigoCampanha() {
    if (!artigoCampanhaSelecionado) {
      toast.warning("Seleciona um artigo.");
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

    if (!campanhaSemDatas && !campanhaValida30Dias && (!campanhaDataInicio || !campanhaDataFim)) {
      setErroCampanha("Preenche a data de início e a data de fim da campanha.");
      return;
    }

    if (!campanhaSemDatas && !campanhaValida30Dias && campanhaDataInicio > campanhaDataFim) {
      setErroCampanha("A data de início não pode ser superior à data de fim.");
      return;
    }

    setErroCampanha("");

    const descricao = artigoCampanhaSelecionado.descricao || "";
    const formatoAuto = obterFormatoAutomaticoEtiqueta(descricao);

    let dataInicioFinal = "";
    let dataFimFinal = "";

    if (!campanhaSemDatas) {
      if (campanhaValida30Dias) {
        const hoje = new Date();
        const fim = somarDias(hoje, 30);
        dataInicioFinal = formatarDataDiaMes(hoje);
        dataFimFinal = formatarDataDiaMes(fim);
      } else {
        dataInicioFinal = formatarDataInputParaDiaMes(campanhaDataInicio);
        dataFimFinal = formatarDataInputParaDiaMes(campanhaDataFim);
      }
    }

    const novoItem = {
      id: `${artigoCampanhaSelecionado.artigo}-${Date.now()}`,
      codigo: artigoCampanhaSelecionado.artigo || "",
      descricao,
      pn: "",
      ean: artigoCampanhaSelecionado.codigoBarras || "",
      antes,
      atual,
      pv3: artigoCampanhaSelecionado.pvp3 || "",
      estado: "",
      ae: artigoCampanhaSelecionado.stock || "",
      aea: "",
      aev: "",
      a10: "",
      a1e: "",
      data: "",
      dataInicio: dataInicioFinal,
      dataFim: dataFimFinal,
      alterado: "CAMPANHA",
      info: `Desconto ${formatarEuro(descontoCampanha)}€`,
      selecionado: true,
      formato_auto: formatoAuto,
    };

    setDados((prev) => [novoItem, ...prev]);
    fecharPopupCriarCampanha();
  }

  function selecionarSugestaoCampanha(item) {
    setArtigoCampanhaSelecionado(item);
    setCampanhaAntes(item.pvp2 || "");
    setCampanhaAtual(item.pvp2 || "");
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

        <ManualCampaignToolbar
          titulo={titulo}
          setTitulo={setTitulo}
          campanhaSemDatas={campanhaSemDatas}
          anoValidade={anoValidade}
          setAnoValidade={setAnoValidade}
          formatoEtiqueta={formatoEtiqueta}
          setFormatoEtiqueta={setFormatoEtiqueta}
          modoFormatoAutomatico={modoFormatoAutomatico}
          setModoFormatoAutomatico={setModoFormatoAutomatico}
          textoColado={textoColado}
          setTextoColado={setTextoColado}
          dataInicioGeral={dataInicioGeral}
          dataFimGeral={dataFimGeral}
          atualizarDataGeral={atualizarDataGeral}
          carregarTextoColado={carregarTextoColado}
          abrirPopupCriarCampanha={abrirPopupCriarCampanha}
          selecionarTodosFiltrados={selecionarTodosFiltrados}
          desmarcarTodosFiltrados={desmarcarTodosFiltrados}
          limparSelecao={limparSelecao}
          imprimirSelecionados={imprimirSelecionados}
          totalArtigos={dados.length}
          totalFiltrados={dadosFiltrados.length}
          totalSelecionados={selecionados.length}
          modoImpressaoTexto={modoImpressaoTexto}
          promocaoFontePreco={promocaoFontePreco}
          setPromocaoFontePreco={setPromocaoFontePreco}
        />

        <ManualCampaignTable
          mostrarTabelaCompleta={mostrarTabelaCompleta}
          setMostrarTabelaCompleta={setMostrarTabelaCompleta}
          dadosFiltrados={dadosFiltrados}
          filtroAberto={filtroAberto}
          setFiltroAberto={setFiltroAberto}
          filtros={filtros}
          filterButtonRefs={filterButtonRefs}
          atualizarFiltroPopup={atualizarFiltroPopup}
          setOrdenacao={setOrdenacao}
          limparFiltro={limparFiltro}
          alternarSelecionado={alternarSelecionado}
          renderTabelaCampanhaCell={renderTabelaCampanhaCell}
        />
      </div>

      <ManualCreateCampaignModal
        aberto={popupCriarCampanhaAberto}
        artigoCampanhaSelecionado={artigoCampanhaSelecionado}
        fecharPopupCriarCampanha={fecharPopupCriarCampanha}
        descontoCampanha={descontoCampanha}
        pesquisaCampanha={pesquisaCampanha}
        setPesquisaCampanha={setPesquisaCampanha}
        catalogoLoading={catalogoLoading}
        catalogoErro={catalogoErro}
        sugestoesCampanha={sugestoesCampanha}
        selecionarSugestaoCampanha={selecionarSugestaoCampanha}
        campanhaAntes={campanhaAntes}
        setCampanhaAntes={setCampanhaAntes}
        campanhaAtual={campanhaAtual}
        setCampanhaAtual={setCampanhaAtual}
        erroCampanha={erroCampanha}
        campanhaSemDatas={campanhaSemDatas}
        campanhaValida30Dias={campanhaValida30Dias}
        setCampanhaValida30Dias={setCampanhaValida30Dias}
        campanhaDataInicio={campanhaDataInicio}
        setCampanhaDataInicio={setCampanhaDataInicio}
        campanhaDataFim={campanhaDataFim}
        setCampanhaDataFim={setCampanhaDataFim}
        estadoValidacaoCampanha={estadoValidacaoCampanha}
        adicionarArtigoCampanha={adicionarArtigoCampanha}
      />

      <InvalidCampaignItemsModal
        aberto={popupArtigosInvalidosAberto}
        artigosInvalidosPopup={artigosInvalidosPopup}
        idsComparacaoPvp3Popup={idsComparacaoPvp3Popup}
        selecionarTodosComparacaoPvp3Popup={selecionarTodosComparacaoPvp3Popup}
        desmarcarTodosComparacaoPvp3Popup={desmarcarTodosComparacaoPvp3Popup}
        copiarCodigosInvalidosEProsseguir={copiarCodigosInvalidosEProsseguir}
        fecharPopupEProsseguir={fecharPopupEProsseguir}
        alternarComparacaoPvp3Popup={alternarComparacaoPvp3Popup}
      />

      <ManualCampaignPrintArea
        modoFormatoAutomatico={modoFormatoAutomatico}
        formatoEtiqueta={formatoEtiqueta}
        paginasImpressao={paginasImpressao}
        titulo={titulo}
        anoValidade={anoValidade}
        promocaoFontePreco={promocaoFontePreco}
      />
    </>
  );
}
