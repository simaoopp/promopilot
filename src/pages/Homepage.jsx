import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import HomeHero from "../components/home/HomeHero";
import HomeQuickActions from "../components/home/HomeQuickActions";
import HomeHistorySection from "../components/home/HomeHistorySection";
import HomeAutomaticCampaignHistorySection from "../components/home/HomeAutomaticCampaignHistorySection";
import HomeSummarySection from "../components/home/HomeSummarySection";
import ArticleDetailsModal from "../components/home/ArticleDetailsModal";
import CampaignDetailsModal from "../components/home/CampaignDetailsModal";
import AutomaticCampaignDetailsModal from "../components/home/AutomaticCampaignDetailsModal";
import ConfirmDeleteModal from "../components/home/ConfirmDeleteModal";
import {
  enrichArtigoWithAi,
  mergeArtigoData,
  mergeArtigosIntoList,
  syncUpdatedArtigoToCache,
} from "../services/artigosService";
import {
  getCatalogoPesquisaSnapshot,
  pesquisarNoCatalogoRemoto,
  syncUpdatedArtigoToCatalogoPesquisa,
} from "../services/catalogoPesquisaService";
import { normalizeArticleCompact } from "../utils/articleSearch";
import { loadCampaignHistory, removeCampaignFromHistory } from "../utils/campaignHistory";
import {
  loadAutomaticCampaignHistory,
  removeAutomaticCampaignFromHistory,
} from "../utils/automaticCampaignHistory";
import {
  formatarAutorCampanha,
  formatarDataHistorico,
  hasUsefulTechData,
  mapArtigoToAiResultado,
  normalizeAiResultado,
} from "../utils/homepageAi";
import "../styles/styles.css";

const HOME_SUGGESTIONS_LIMIT = 8;

export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();

  const initialCatalogo = getCatalogoPesquisaSnapshot();

  const [pesquisa, setPesquisa] = useState("");
  const [pesquisaDebounced, setPesquisaDebounced] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [sugestoesErro, setSugestoesErro] = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [catalogoTotal] = useState(initialCatalogo.total || 0);
  const [artigoSelecionado, setArtigoSelecionado] = useState(null);
  const [aiAberta, setAiAberta] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErro, setAiErro] = useState("");
  const [aiResultado, setAiResultado] = useState(null);
  const [historicoCampanhas, setHistoricoCampanhas] = useState([]);
  const [historicoCampanhasAutomaticas, setHistoricoCampanhasAutomaticas] = useState([]);
  const [campanhaSelecionada, setCampanhaSelecionada] = useState(null);
  const [campanhaAutomaticaSelecionada, setCampanhaAutomaticaSelecionada] = useState(null);
  const [campanhaPendenteRemocao, setCampanhaPendenteRemocao] = useState(null);
  const [campanhaAutomaticaPendenteRemocao, setCampanhaAutomaticaPendenteRemocao] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setPesquisaDebounced(pesquisa), 120);
    return () => window.clearTimeout(timer);
  }, [pesquisa]);

  useEffect(() => {
    let isMounted = true;

    async function syncHistoricoCampanhas() {
      try {
        const campanhas = await loadCampaignHistory(profile?.store);
        if (isMounted) setHistoricoCampanhas(campanhas);
      } catch (error) {
        console.warn("Não foi possível carregar o histórico de campanhas.", error);
        if (isMounted) setHistoricoCampanhas([]);
      }
    }

    syncHistoricoCampanhas();

    return () => {
      isMounted = false;
    };
  }, [profile?.store]);

  useEffect(() => {
    let isMounted = true;

    async function syncHistoricoCampanhasAutomaticas() {
      try {
        const campanhas = await loadAutomaticCampaignHistory(profile?.store);
        if (isMounted) setHistoricoCampanhasAutomaticas(campanhas);
      } catch (error) {
        console.warn("Não foi possível carregar o histórico de campanhas automático.", error);
        if (isMounted) setHistoricoCampanhasAutomaticas([]);
      }
    }

    syncHistoricoCampanhasAutomaticas();

    return () => {
      isMounted = false;
    };
  }, [profile?.store]);

  useEffect(() => {
    const termoCompacto = normalizeArticleCompact(pesquisaDebounced);

    if (termoCompacto.length < 2) {
      setSugestoes([]);
      setHighlightedIndex(-1);
      setSugestoesErro("");
      setSuggestionsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let isMounted = true;

    async function syncSugestoes() {
      setSuggestionsLoading(true);
      setSugestoesErro("");

      try {
        const ranked = await pesquisarNoCatalogoRemoto(pesquisaDebounced, {
          limit: HOME_SUGGESTIONS_LIMIT,
          signal: controller.signal,
        });

        if (!isMounted) return;

        setSugestoes(ranked);
        setHighlightedIndex(ranked.length ? 0 : -1);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Erro ao carregar sugestões da homepage.", error);

        if (isMounted) {
          setSugestoes([]);
          setHighlightedIndex(-1);
          setSugestoesErro("Não foi possível carregar sugestões neste momento.");
        }
      } finally {
        if (isMounted) setSuggestionsLoading(false);
      }
    }

    syncSugestoes();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [pesquisaDebounced]);

  const historicoPreview = useMemo(
    () => (Array.isArray(historicoCampanhas) ? historicoCampanhas : []).filter(Boolean).slice(0, 4),
    [historicoCampanhas],
  );

  const historicoAutomaticoPreview = useMemo(
    () =>
      (Array.isArray(historicoCampanhasAutomaticas) ? historicoCampanhasAutomaticas : [])
        .filter(Boolean)
        .slice(0, 4),
    [historicoCampanhasAutomaticas],
  );

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

  function abrirPopupCampanha(campanha) {
    setCampanhaSelecionada(campanha);
  }

  function fecharPopupCampanha() {
    setCampanhaSelecionada(null);
  }

  function abrirPopupCampanhaAutomatica(campanha) {
    setCampanhaAutomaticaSelecionada(campanha);
  }

  function fecharPopupCampanhaAutomatica() {
    setCampanhaAutomaticaSelecionada(null);
  }

  async function apagarCampanha(id) {
    try {
      const atualizado = await removeCampaignFromHistory(id, profile?.store);
      setHistoricoCampanhas(atualizado);
      setCampanhaPendenteRemocao(null);

      if (campanhaSelecionada?.id === id) {
        setCampanhaSelecionada(null);
      }
    } catch (error) {
      console.error("Não foi possível apagar a campanha.", error);
      toast.error("Não foi possível apagar a campanha.");
    }
  }

  async function apagarCampanhaAutomatica(id) {
    try {
      const atualizado = await removeAutomaticCampaignFromHistory(id, profile?.store);
      setHistoricoCampanhasAutomaticas(atualizado);
      setCampanhaAutomaticaPendenteRemocao(null);

      if (campanhaAutomaticaSelecionada?.id === id) {
        setCampanhaAutomaticaSelecionada(null);
      }
    } catch (error) {
      console.error("Não foi possível apagar a campanha automática.", error);
      toast.error("Não foi possível apagar a campanha automática.");
    }
  }

  function duplicarCampanha(campanha) {
    navigate("/EtiquetasCampanha", { state: { campanhaDuplicada: campanha } });
  }

  async function abrirPopupAI() {
    if (!artigoSelecionado) return;

    setAiAberta(true);
    setAiErro("");
    setAiResultado(null);

    if (hasUsefulTechData(artigoSelecionado)) {
      setAiResultado(mapArtigoToAiResultado(artigoSelecionado));
      return;
    }

    setAiLoading(true);

    try {
      const payload = {
        artigoInterno: artigoSelecionado.artigo || "",
        descricao: artigoSelecionado.descricao || "",
        codigoBarras: artigoSelecionado.codigoBarras || "",
      };

      const data = await enrichArtigoWithAi(payload);
      const artigoAtualizado = mergeArtigoData(artigoSelecionado, data?.artigoAtualizado);
      const resultadoNormalizado = normalizeAiResultado(data?.resultado, artigoAtualizado);

      setAiResultado(resultadoNormalizado);
      setArtigoSelecionado(artigoAtualizado);
      setSugestoes((prev) => mergeArtigosIntoList(prev, artigoAtualizado));
      syncUpdatedArtigoToCache(artigoAtualizado);
      syncUpdatedArtigoToCatalogoPesquisa(artigoAtualizado);
    } catch (error) {
      console.error("Erro completo AI:", error);
      setAiErro(error?.message || "Erro ao obter dados do artigo.");
    } finally {
      setAiLoading(false);
    }
  }

  function abrirPrimeiraSugestao() {
    if (!sugestoes.length) return;
    abrirPopupArtigo(sugestoes[highlightedIndex >= 0 ? highlightedIndex : 0]);
  }

  function handleSearchKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) =>
        !sugestoes.length ? -1 : prev >= sugestoes.length - 1 ? 0 : prev + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) =>
        !sugestoes.length ? -1 : prev <= 0 ? sugestoes.length - 1 : prev - 1,
      );
      return;
    }

    if (event.key === "Escape") {
      setHighlightedIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      abrirPrimeiraSugestao();
    }
  }

  return (
    <div className="page-content">
      <HomeHero
        pesquisa={pesquisa}
        onPesquisaChange={setPesquisa}
        onPesquisaFocus={() => {}}
        onKeyDown={handleSearchKeyDown}
        loading={suggestionsLoading}
        erro={sugestoesErro}
        sugestoes={sugestoes}
        highlightedIndex={highlightedIndex}
        onSuggestionHover={setHighlightedIndex}
        onSuggestionClick={abrirPopupArtigo}
      />

      <HomeQuickActions
        onOpenCampaign={() => navigate("/EtiquetasCampanha")}
        onOpenArticles={() => navigate("/Etiquetas")}
        onOpenScan={() => navigate("/Etiquetas?mode=scan")}
        onOpenExcel={() => navigate("/EtiquetasCampanhaExcel")}
      />

      <HomeHistorySection
        historicoPreview={historicoPreview}
        onOpenCampaign={abrirPopupCampanha}
        formatarDataHistorico={formatarDataHistorico}
        formatarAutorCampanha={formatarAutorCampanha}
      />

      <HomeAutomaticCampaignHistorySection
        historicoPreview={historicoAutomaticoPreview}
        onOpenCampaign={abrirPopupCampanhaAutomatica}
        formatarDataHistorico={formatarDataHistorico}
      />

      <HomeSummarySection
        totalArtigos={catalogoTotal}
        totalCampanhas={historicoCampanhas.length + historicoCampanhasAutomaticas.length}
      />

      <ArticleDetailsModal
        artigo={artigoSelecionado}
        aiAberta={aiAberta}
        aiLoading={aiLoading}
        aiErro={aiErro}
        aiResultado={aiResultado}
        onClose={fecharPopupArtigo}
        onOpenAi={abrirPopupAI}
      />

      <CampaignDetailsModal
        campanha={campanhaSelecionada}
        onClose={fecharPopupCampanha}
        onDuplicate={duplicarCampanha}
        onRequestDelete={setCampanhaPendenteRemocao}
        formatarDataHistorico={formatarDataHistorico}
      />

      <AutomaticCampaignDetailsModal
        campanha={campanhaAutomaticaSelecionada}
        onClose={fecharPopupCampanhaAutomatica}
        onDuplicate={duplicarCampanha}
        onRequestDelete={setCampanhaAutomaticaPendenteRemocao}
        formatarDataHistorico={formatarDataHistorico}
      />

      <ConfirmDeleteModal
        campanha={campanhaPendenteRemocao}
        onCancel={() => setCampanhaPendenteRemocao(null)}
        onConfirm={apagarCampanha}
      />

      <ConfirmDeleteModal
        campanha={campanhaAutomaticaPendenteRemocao}
        onCancel={() => setCampanhaAutomaticaPendenteRemocao(null)}
        onConfirm={apagarCampanhaAutomatica}
      />
    </div>
  );
}
