import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { printDocument } from "../utils/print";

import Barcode from "../components/Barcode";
import FilterMenu from "../components/FilterMenu";
import { loadAllArtigos } from "../services/artigosService";
import { PRIMARY_TABLE_COLUMNS, TABLE_COLUMNS } from "../data/tableColumns";
import SyncedHorizontalScroll from "../components/SyncedHorizontalScroll";
import logo from "../logo.png";
import "../styles/styles.css";
import {
  addCampaignToHistory,
  createCampaignSnapshot,
} from "../utils/campaignHistory";
import {
  aplicarFiltroTexto,
  compararNumero,
  dividirEmPaginas,
} from "../utils/filters";
import { formatarEuro } from "../utils/formatters";
import { parseTabelaColada } from "../utils/parsers";
import { useAutoFontSize } from "../utils/useAutoFontSize";

const CAMPANHA_TITULO_DEFAULT = "PROMO";
const NOTA_PROMOCAO =
  "VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock existente e não acumulável com outras promoções.";

const FILTROS_INICIAIS = {
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
};

function AutoText({ texto, className, min, max, style = {} }) {
  const autoFont = useAutoFontSize(texto, min, max);

  return (
    <div
      ref={autoFont.ref}
      className={className}
      style={{
        width: "100%",
        fontSize: `${autoFont.fontSize}px`,
        ...style,
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

function ResumoCard({ label, value }) {
  return (
    <div className="resumo-card">
      <span className="resumo-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function renderCampaignTableCell(item, columnKey) {
  switch (columnKey) {
    case "antes":
    case "atual":
      return `${formatarEuro(item[columnKey])}€`;
    default:
      return item[columnKey] ?? "";
  }
}


function EtiquetaConteudo({ item, formatoAtual, titulo, textoValidade }) {
  const desconto = Math.max(0, Number(item.antes) - Number(item.atual));

  return (
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
            <PrecoAntesAuto valor={item.antes} formatoEtiqueta={formatoAtual} />
          </div>

          <div className="linha-preco desconto-linha">
            <DescontoAuto valor={desconto} formatoEtiqueta={formatoAtual} />
          </div>

          <div className="linha-preco">
            <PrecoAtualAuto valor={item.atual} formatoEtiqueta={formatoAtual} />
          </div>
        </div>

        <div className="rodape">
          <Barcode value={item.ean} />
          <div className="validade">{textoValidade}</div>
          <div className="nota">{NOTA_PROMOCAO}</div>
        </div>
      </div>
    </div>
  );
}

function renderEtiqueta(item, formatoAtual, titulo, textoValidade) {
  const etiquetaClassName = `label ${
    formatoAtual === "a5" ? "label-a5" : "label-a6"
  }`;

  if (formatoAtual === "a5") {
    return (
      <div key={item.id} className={etiquetaClassName}>
        <div className="label-a5-rotator">
          <EtiquetaConteudo
            item={item}
            formatoAtual={formatoAtual}
            titulo={titulo}
            textoValidade={textoValidade}
          />
        </div>
      </div>
    );
  }

  return (
    <div key={item.id} className={etiquetaClassName}>
      <EtiquetaConteudo
        item={item}
        formatoAtual={formatoAtual}
        titulo={titulo}
        textoValidade={textoValidade}
      />
    </div>
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

function formatarDataInputParaDiaMes(dataIso = "") {
  if (!dataIso) return "";

  const [ano, mes, dia] = String(dataIso).split("-");
  if (!ano || !mes || !dia) return "";

  return `${dia}/${mes}`;
}

function somarDias(data, dias) {
  const novaData = new Date(data);
  novaData.setDate(novaData.getDate() + dias);
  return novaData;
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
    const fim = somarDias(hoje, 30);

    return `VÁLIDO DE ${formatarDataDiaMes(
      hoje,
    )}/${hoje.getFullYear()} A ${formatarDataDiaMes(fim)}/${fim.getFullYear()}`;
  }

  return `VÁLIDO DE ${dataInicio || "-"}${
    dataInicio ? `/${anoValidadeAtual}` : ""
  } A ${dataFim || "-"}${dataFim ? `/${anoValidadeAtual}` : ""}`;
}

function obterFormatoAutomaticoEtiqueta(descricao = "") {
  const texto = normalizarTexto(descricao);

   const categoriasA5 = [
    "Máq. Lavar Loiça",
    "Máq. Lavar Louça",
    "Máq. Secar Roupa",
    "Máq. Secar",
    "Máq. Lavar Roupa",
    "Máq. Lavar",
    "maquina de lavar",
    "maquinas de lavar",
    "máquina de lavar",
    "máquinas de lavar",
    "maquina de secar",
    "maquinas de secar",
    "máquina de secar",
    "máquinas de secar",
    "lavar e secar",
    "maquina de lavar e secar",
    "maquinas de lavar e secar",
    "máquina de lavar e secar",
    "máquinas de lavar e secar",
    "maquina de lavar loica",
    "maquinas de lavar loica",
    "máquina de lavar loiça",
    "máquinas de lavar loiça",
    "lava loica",
    "lava loiça",
    "televisao",
    "televisoes",
    "televisão",
    "televisões",
    "tv",
    "smart tv",
    "qled",
    "oled",
    "monitor",
    "monitores",
    "frigorifico",
    "frigorificos",
    "frigorífico",
    "frigoríficos",
    "combinado",
    "combinados",
    "cadeira",
    "cadeiras",
    "mesa",
    "mesas",
    "fogao",
    "fogoes",
    "fogão",
    "fogões",
    "arca",
    "arcas",
    "chamine",
    "chamines",
    "chaminé",
    "chaminés",
    "exaustor",
    "exaustores",
    "cave de vinho",
    "caves de vinho",
    "cave vinho",
    "garrafeira",
    "garrafeiras",
  ];

  return categoriasA5.some((palavra) =>
    texto.includes(normalizarTexto(palavra)),
  )
    ? "a5"
    : "a6";
}

function obterFormatoEtiquetaItem(item, modoAutomatico, formatoManual) {
  if (!modoAutomatico) return formatoManual;
  return obterFormatoAutomaticoEtiqueta(item?.descricao || "");
}

function construirPaginasImpressao(itens, modoAutomatico, formatoManual) {
  if (!modoAutomatico) {
    const etiquetasPorPagina = formatoManual === "a5" ? 2 : 4;

    return dividirEmPaginas(itens, etiquetasPorPagina).map((items) => ({
      layout: formatoManual,
      items,
    }));
  }

  const itensA5 = itens.filter((item) => item._formato === "a5");
  const itensA6 = itens.filter((item) => item._formato !== "a5");

  return [
    ...dividirEmPaginas(itensA5, 2).map((items) => ({
      layout: "a5",
      items,
    })),
    ...dividirEmPaginas(itensA6, 4).map((items) => ({
      layout: "a6",
      items,
    })),
  ];
}

function dataCampanhaInvalida(data) {
  const texto = String(data || "").trim();

  if (!texto || texto === "-") return false;

  const formatoMesTexto = /^\d{1,2}\/[a-z]{3}\.?$/i;
  const formatoMesNumero = /^\d{1,2}\/\d{2}$/;

  return !formatoMesTexto.test(texto) && !formatoMesNumero.test(texto);
}

function itemTabelaInvalido(item) {
  const nomeInvalido = !item.descricao || item.descricao.length < 3;
  const precoAntesInvalido = !item.antes || Number(item.antes) <= 0;
  const precoAtualInvalido = !item.atual || Number(item.atual) <= 0;
  const eanInvalido =
    !item.ean || String(item.ean).replace(/\D/g, "").length < 8;

  return (
    nomeInvalido ||
    precoAntesInvalido ||
    precoAtualInvalido ||
    eanInvalido ||
    dataCampanhaInvalida(item.dataInicio) ||
    dataCampanhaInvalida(item.dataFim)
  );
}

export default function EtiquetasPage() {
  const location = useLocation();
  const { user, profile } = useAuth();
  const toast = useToast();

  const [titulo, setTitulo] = useState(CAMPANHA_TITULO_DEFAULT);
  const [textoColado, setTextoColado] = useState("");
  const [anoValidade, setAnoValidade] = useState(new Date().getFullYear());
  const [dados, setDados] = useState([]);
  const [formatoEtiqueta, setFormatoEtiqueta] = useState("a6");
  const [modoFormatoAutomatico, setModoFormatoAutomatico] = useState(true);

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
  const [campanhaValida30Dias, setCampanhaValida30Dias] = useState(true);
  const [campanhaDataInicio, setCampanhaDataInicio] = useState("");
  const [campanhaDataFim, setCampanhaDataFim] = useState("");
  const [erroCampanha, setErroCampanha] = useState("");
  const [catalogoArtigos, setCatalogoArtigos] = useState([]);
  const [catalogoLoading, setCatalogoLoading] = useState(true);
  const [catalogoErro, setCatalogoErro] = useState("");

  const [filtroAberto, setFiltroAberto] = useState(null);
  const [ordenacao, setOrdenacao] = useState({ coluna: "", direcao: "" });
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [mostrarTabelaCompleta, setMostrarTabelaCompleta] = useState(false);


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
    const handleClickOutside = (event) => {
      const clicouDentroDeFiltro = event.target.closest(".filter-th");
      if (!clicouDentroDeFiltro) {
        setFiltroAberto(null);
      }
    };

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


  useEffect(() => {
    let ativo = true;

    async function syncCatalogo() {
      try {
        const data = await loadAllArtigos({ pageSize: 500 });

        if (ativo) {
          setCatalogoArtigos(data.items || []);
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

  const sugestoesCampanha = useMemo(() => {
    const termo = normalizarTexto(pesquisaCampanha);
    if (termo.length < 2) return [];

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


  useEffect(() => {
    let ativo = true;

    async function syncCatalogo() {
      try {
        const data = await loadAllArtigos({ pageSize: 500 });

        if (ativo) {
          setCatalogoArtigos(data.items || []);
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

  function carregarTextoColado() {
    try {
      if (!textoColado.trim()) {
        throw new Error("Sem conteúdo");
      }

      const linhas = parseTabelaColada(textoColado);
      if (!linhas.length) {
        throw new Error("Sem linhas válidas");
      }

      if (linhas.some(itemTabelaInvalido)) {
        throw new Error("Dados inválidos");
      }

      setDados(linhas);
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

  function removerInvalidosDaSelecao() {
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));

    setDados((prev) =>
      prev.map((item) =>
        idsInvalidos.has(item.id) ? { ...item, selecionado: false } : item,
      ),
    );
  }

  async function imprimirComValidosRestantes(restantesValidos) {
    removerInvalidosDaSelecao();
    setPopupArtigosInvalidosAberto(false);

    if (restantesValidos.length === 0) {
      toast.warning("Não existem etiquetas válidas para imprimir.");
      return;
    }

    await guardarCampanhaNoHistorico("impressao");

    await printDocument();
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

    await imprimirComValidosRestantes(restantesValidos);
  }

  async function fecharPopupEProsseguir() {
    const idsInvalidos = new Set(artigosInvalidosPopup.map((item) => item.id));
    const restantesValidos = selecionados.filter(
      (item) => !idsInvalidos.has(item.id),
    );

    await imprimirComValidosRestantes(restantesValidos);
  }

  async function imprimirSelecionados() {
    if (!selecionados.length) {
      toast.warning("Seleciona pelo menos um artigo.");
      return;
    }

    const invalidos = selecionados.filter(
      (item) => Number(item.antes) <= Number(item.atual),
    );

    if (invalidos.length > 0) {
      setArtigosInvalidosPopup(invalidos);
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

    if (!campanhaValida30Dias && (!campanhaDataInicio || !campanhaDataFim)) {
      setErroCampanha("Preenche a data de início e a data de fim da campanha.");
      return;
    }

    if (!campanhaValida30Dias && campanhaDataInicio > campanhaDataFim) {
      setErroCampanha("A data de início não pode ser superior à data de fim.");
      return;
    }

    setErroCampanha("");

    const descricao = artigoCampanhaSelecionado.descricao || "";
    const formatoAuto = obterFormatoAutomaticoEtiqueta(descricao);

    let dataInicioFinal = "";
    let dataFimFinal = "";

    if (campanhaValida30Dias) {
      const hoje = new Date();
      const fim = somarDias(hoje, 30);
      dataInicioFinal = formatarDataDiaMes(hoje);
      dataFimFinal = formatarDataDiaMes(fim);
    } else {
      dataInicioFinal = formatarDataInputParaDiaMes(campanhaDataInicio);
      dataFimFinal = formatarDataInputParaDiaMes(campanhaDataFim);
    }

    const novoItem = {
      id: `${artigoCampanhaSelecionado.artigo}-${Date.now()}`,
      codigo: artigoCampanhaSelecionado.artigo || "",
      descricao,
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

  function renderPagina(pagina, pageIndex) {
    return (
      <div
        key={pageIndex}
        className={`sheet ${pagina.layout === "a5" ? "sheet-a5" : "sheet-a6"}`}
      >
        {pagina.items.map((item) =>
          renderEtiqueta(
            item,
            pagina.layout,
            titulo,
            obterTextoValidade(item, anoValidade),
          ),
        )}

        {pagina.layout === "a5" && pagina.items.length === 1 ? (
          <div className="label label-a5 label-vazia">
            <div className="label-inner" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="page-content page-content-fluid no-print">
        <div className="page-header">
          <h1 className="page-title">Etiquetas de Campanha</h1>
          <p className="page-subtitle">
            Cola a tabela recebida por email, valida os artigos, aplica filtros
            e imprime apenas as etiquetas selecionadas.
          </p>
        </div>

        <div className="control-card control-card-fluid">
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
              <span>Ano de validade / formato</span>

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
                  disabled={modoFormatoAutomatico}
                  title={
                    modoFormatoAutomatico
                      ? "Desativa o formato automático para alterar manualmente"
                      : "Alternar formato manual"
                  }
                >
                  Manual: {formatoEtiqueta.toUpperCase()}
                </button>

                <button
                  type="button"
                  className={`btn ${
                    modoFormatoAutomatico ? "btn-primary" : "btn-secondary"
                  } formato-btn`}
                  onClick={() => setModoFormatoAutomatico((prev) => !prev)}
                >
                  Automático: {modoFormatoAutomatico ? "ON" : "OFF"}
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
            <ResumoCard label="Total artigos" value={dados.length} />
            <ResumoCard label="Filtrados" value={dadosFiltrados.length} />
            <ResumoCard label="Selecionados" value={selecionados.length} />
            <ResumoCard label="Modo de impressão" value={modoImpressaoTexto} />
          </div>
        </div>

        <div className="table-card table-card-fluid">
          <div className="table-card-header table-card-header-stack">
            <div>
              <h2>Lista de artigos</h2>
              <p className="table-card-subtitle">
                Vista rápida com as colunas principais. A tabela completa abre
                acima com todos os cabeçalhos.
              </p>
            </div>

            <button
              type="button"
              className={`btn ${mostrarTabelaCompleta ? "btn-secondary" : "btn-primary"}`}
              onClick={() => setMostrarTabelaCompleta((prev) => !prev)}
            >
              {mostrarTabelaCompleta
                ? "Fechar tabela completa"
                : "Abrir tabela completa"}
            </button>
          </div>

          {mostrarTabelaCompleta ? (
            <div className="expanded-table-section">
              <div className="expanded-table-header">
                <div>
                  <h3>Tabela completa</h3>
                  <p>Todos os cabeçalhos e colunas disponíveis.</p>
                </div>
              </div>

              <SyncedHorizontalScroll className="table-panel table-panel-complete">
                <table className="full-table full-campaign-table">
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
                        <td
                          colSpan={TABLE_COLUMNS.length + 1}
                          className="empty-cell"
                        >
                          Cola a tabela do email e carrega em “Carregar tabela”.
                        </td>
                      </tr>
                    ) : (
                      dadosFiltrados.map((item) => (
                        <tr
                          key={`full-${item.id}`}
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
                              onChange={() => alternarSelecionado(item.id)}
                            />
                          </td>

                          {TABLE_COLUMNS.map((col) => (
                            <td key={`${item.id}-${col.key}`}>
                              {renderCampaignTableCell(item, col.key)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </SyncedHorizontalScroll>
            </div>
          ) : null}

          <div className="table-panel table-panel-compact">
            <table className="compact-table compact-campaign-table compact-campaign-table--summary">
              <thead>
                <tr>
                  <th>Selecionar</th>

                  {PRIMARY_TABLE_COLUMNS.map((col) => (
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
                    <td
                      colSpan={PRIMARY_TABLE_COLUMNS.length + 1}
                      className="empty-cell"
                    >
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
                          onChange={() => alternarSelecionado(item.id)}
                        />
                      </td>

                      {PRIMARY_TABLE_COLUMNS.map((col) => (
                        <td key={`${item.id}-${col.key}`}>
                          {renderCampaignTableCell(item, col.key)}
                        </td>
                      ))}
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
          <div className="popup-card popup-card-campanha popup-card-campanha-pro">
            <div className="popup-header popup-header-campanha">
              <div>
                <div className="popup-eyebrow">Campanha manual</div>
                <h2>Criar campanha</h2>
                <p className="popup-subtitle">
                  Pesquisa um artigo do catálogo, define os preços e adiciona-o
                  diretamente à campanha.
                </p>
              </div>

              <button
                type="button"
                className="popup-close"
                onClick={fecharPopupCriarCampanha}
              >
                ×
              </button>
            </div>

            <div className="popup-campanha-scroll">
              <div className="popup-status-row">
                <span className="popup-chip">
                  {artigoCampanhaSelecionado
                    ? "Artigo selecionado"
                    : "Sem artigo selecionado"}
                </span>

                <span className="popup-chip popup-chip-ai">
                  Desconto: {formatarEuro(descontoCampanha)}€
                </span>
              </div>

              <div className="campanha-layout">
                <div className="campanha-col-main">
                  <div className="ai-card-panel">
                    <div className="section-title-row">
                      <h3>Pesquisar artigo</h3>
                    </div>

                    <div className="input-group">
                      <span>
                        Pesquisar por código interno, descrição ou EAN
                      </span>
                      <input
                        type="text"
                        value={pesquisaCampanha}
                        onChange={(e) => setPesquisaCampanha(e.target.value)}
                        placeholder="Ex: frigorífico aeg, 5601234567890..."
                      />
                    </div>

                    {catalogoLoading ? (
                      <p className="empty-state-text">A carregar catálogo de artigos...</p>
                    ) : catalogoErro ? (
                      <p className="campanha-erro">{catalogoErro}</p>
                    ) : sugestoesCampanha.length > 0 ? (
                      <div className="campanha-sugestoes">
                        {sugestoesCampanha.map((item, index) => {
                          const ativo =
                            artigoCampanhaSelecionado?.artigo === item.artigo;

                          return (
                            <button
                              key={`${item.artigo}-${index}`}
                              type="button"
                              className={`campanha-sugestao ${
                                ativo ? "ativa" : ""
                              }`}
                              onClick={() => selecionarSugestaoCampanha(item)}
                            >
                              <div className="campanha-sugestao-top">
                                <strong>{item.artigo}</strong>
                                <span className="campanha-tag">
                                  PVP2: {item.pvp2 || "-"}
                                </span>
                              </div>

                              <span>{item.descricao}</span>
                              <small>EAN: {item.codigoBarras || "-"}</small>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="empty-state-text">
                        Escreve pelo menos 2 caracteres para pesquisar artigos.
                      </p>
                    )}
                  </div>

                  <div className="campanha-stack">
                    <div className="ai-card-panel">
                      <div className="section-title-row">
                        <h3>Preços da campanha</h3>
                      </div>

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

                      {erroCampanha && (
                        <p className="campanha-erro">{erroCampanha}</p>
                      )}
                    </div>

                    <div className="ai-card-panel">
                      <div className="section-title-row">
                        <h3>Validade da campanha</h3>
                      </div>

                      <label className="campanha-check-row">
                        <input
                          type="checkbox"
                          checked={campanhaValida30Dias}
                          onChange={(e) =>
                            setCampanhaValida30Dias(e.target.checked)
                          }
                        />
                        <span>Campanha válida para 30 dias</span>
                      </label>

                      {!campanhaValida30Dias && (
                        <div className="campanha-datas-grid">
                          <label className="input-group">
                            <span>Data de início</span>
                            <input
                              type="date"
                              value={campanhaDataInicio}
                              onChange={(e) =>
                                setCampanhaDataInicio(e.target.value)
                              }
                            />
                          </label>

                          <label className="input-group">
                            <span>Data de fim</span>
                            <input
                              type="date"
                              value={campanhaDataFim}
                              onChange={(e) =>
                                setCampanhaDataFim(e.target.value)
                              }
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="campanha-col-side">
                  <div className="ai-card-panel campanha-resumo-panel">
                    <div className="section-title-row">
                      <h3>Resumo do artigo</h3>
                    </div>

                    {artigoCampanhaSelecionado ? (
                      <>
                        <div className="campanha-resumo">
                          <div className="campanha-resumo-item">
                            <span>Artigo</span>
                            <strong>{artigoCampanhaSelecionado.artigo}</strong>
                          </div>

                          <div className="campanha-resumo-item">
                            <span>EAN</span>
                            <strong>
                              {artigoCampanhaSelecionado.codigoBarras || "-"}
                            </strong>
                          </div>

                          <div className="campanha-resumo-item campanha-resumo-item-full">
                            <span>Descrição</span>
                            <strong>
                              {artigoCampanhaSelecionado.descricao}
                            </strong>
                          </div>

                          <div className="campanha-resumo-item">
                            <span>PVP2 base</span>
                            <strong>
                              {artigoCampanhaSelecionado.pvp2 || "-"}
                            </strong>
                          </div>

                          <div className="campanha-resumo-item">
                            <span>Formato auto</span>
                            <strong>
                              {obterFormatoAutomaticoEtiqueta(
                                artigoCampanhaSelecionado.descricao,
                              ).toUpperCase()}
                            </strong>
                          </div>
                        </div>

                        <div className="campanha-highlight-box">
                          <span>Validação</span>
                          <strong>{estadoValidacaoCampanha}</strong>
                        </div>
                      </>
                    ) : (
                      <p className="empty-state-text">
                        Seleciona um artigo à esquerda para veres o resumo antes
                        de o adicionares à campanha.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="popup-actions popup-actions-pro popup-actions-campanha">
              <button
                type="button"
                className="btn btn-primary"
                onClick={adicionarArtigoCampanha}
                disabled={!artigoCampanhaSelecionado || !!erroCampanha}
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

      <div
        className={`print-area ${
          modoFormatoAutomatico ? "formato-auto" : `formato-${formatoEtiqueta}`
        }`}
      >
        {paginasImpressao.map(renderPagina)}
      </div>
    </>
  );
}

function ordenarLista(lista, ordenacao) {
  if (!ordenacao.coluna || !ordenacao.direcao) return lista;

  const copia = [...lista];

  copia.sort((a, b) => {
    const valorA = a[ordenacao.coluna];
    const valorB = b[ordenacao.coluna];

    const aNum = Number(valorA);
    const bNum = Number(valorB);
    const ambosNumeros = !Number.isNaN(aNum) && !Number.isNaN(bNum);

    if (ambosNumeros) {
      return ordenacao.direcao === "asc" ? aNum - bNum : bNum - aNum;
    }

    const aText = String(valorA || "").toLowerCase();
    const bText = String(valorB || "").toLowerCase();

    return ordenacao.direcao === "asc"
      ? aText.localeCompare(bText, "pt")
      : bText.localeCompare(aText, "pt");
  });

  return copia;
}
