import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import HomeHero from "../components/home/HomeHero";
import HomeQuickActions from "../components/home/HomeQuickActions";
import HomeHistorySection from "../components/home/HomeHistorySection";
import HomeSummarySection from "../components/home/HomeSummarySection";
import ArticleDetailsModal from "../components/home/ArticleDetailsModal";
import CampaignDetailsModal from "../components/home/CampaignDetailsModal";
import ConfirmDeleteModal from "../components/home/ConfirmDeleteModal";
import {
  enrichArtigoWithAi,
  loadAllArtigos,
  mergeArtigoData,
  mergeArtigosIntoList,
  searchArtigos,
  syncUpdatedArtigoToCache,
} from "../services/artigosService";
import {
  filterAndRankPreparedArticles,
  normalizeArticleCompact,
  prepareArticlesForSearch,
} from "../utils/articleSearch";
import { loadCampaignHistory, removeCampaignFromHistory } from "../utils/campaignHistory";
import {
  formatarAutorCampanha,
  formatarDataHistorico,
  hasUsefulTechData,
  mapArtigoToAiResultado,
  normalizeAiResultado,
} from "../utils/homepageAi";
import "../styles/styles.css";

const HOME_SUGGESTIONS_LIMIT = 8;

function scheduleIdleTask(task) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(task, 700);
  return () => window.clearTimeout(id);
}

export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();

  const [pesquisa, setPesquisa] = useState("");
  const [pesquisaDebounced, setPesquisaDebounced] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [sugestoesErro, setSugestoesErro] = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [catalogoTotal, setCatalogoTotal] = useState(0);
  const [artigoSelecionado, setArtigoSelecionado] = useState(null);
  const [aiAberta, setAiAberta] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErro, setAiErro] = useState("");
  const [aiResultado, setAiResultado] = useState(null);
  const [historicoCampanhas, setHistoricoCampanhas] = useState([]);
  const [campanhaSelecionada, setCampanhaSelecionada] = useState(null);
  const [campanhaPendenteRemocao, setCampanhaPendenteRemocao] = useState(null);
  const [catalogoPesquisaPronto, setCatalogoPesquisaPronto] = useState(false);

  const catalogoPreparadoRef = useRef([]);
  const preloadPromiseRef = useRef(null);
  const suggestionsSnapshotRef = useRef([]);

  const ensureCatalogoPesquisa = useCallback(async () => {
    if (catalogoPreparadoRef.current.length > 0) {
      return catalogoPreparadoRef.current;
    }

    if (!preloadPromiseRef.current) {
      preloadPromiseRef.current = loadAllArtigos({ pageSize: 1000 })
        .then((data) => {
          const prepared = prepareArticlesForSearch(data?.items || []);
          catalogoPreparadoRef.current = prepared;
          setCatalogoTotal(Number(data?.total || prepared.length || 0));
          setCatalogoPesquisaPronto(true);
          return prepared;
        })
        .catch((error) => {
          preloadPromiseRef.current = null;
          throw error;
        });
    }

    return preloadPromiseRef.current;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setPesquisaDebounced(pesquisa), 120);
    return () => window.clearTimeout(timer);
  }, [pesquisa]);

  useEffect(() => {
    const cancelIdle = scheduleIdleTask(() => {
      ensureCatalogoPesquisa().catch((error) => {
        console.warn("Não foi possível preparar a pesquisa rápida do catálogo.", error);
      });
    });

    return cancelIdle;
  }, [ensureCatalogoPesquisa]);

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

    async function syncCatalogoResumo() {
      try {
        if (catalogoPreparadoRef.current.length > 0) {
          if (isMounted) setCatalogoTotal(catalogoPreparadoRef.current.length);
          return;
        }

        const data = await searchArtigos({ q: "", limit: 1, offset: 0 });
        if (isMounted) setCatalogoTotal(Number(data?.total || 0));
      } catch (error) {
        console.warn("Não foi possível carregar o resumo do catálogo.", error);
      }
    }

    syncHistoricoCampanhas();
    syncCatalogoResumo();

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

    let isMounted = true;
    const controller = new AbortController();

    if (catalogoPreparadoRef.current.length > 0) {
      const locais = filterAndRankPreparedArticles(
        catalogoPreparadoRef.current,
        pesquisaDebounced,
        { limit: HOME_SUGGESTIONS_LIMIT },
      );

      suggestionsSnapshotRef.current = locais;
      setSugestoes(locais);
      setHighlightedIndex(locais.length ? 0 : -1);
      setSugestoesErro("");
      setSuggestionsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const snapshot = filterAndRankPreparedArticles(
      suggestionsSnapshotRef.current,
      pesquisaDebounced,
      { limit: HOME_SUGGESTIONS_LIMIT },
    );

    if (snapshot.length > 0) {
      setSugestoes(snapshot);
      setHighlightedIndex(0);
    }

    async function syncSugestoes() {
      setSuggestionsLoading(true);
      setSugestoesErro("");

      try {
        ensureCatalogoPesquisa().catch(() => {});

        const data = await searchArtigos({
          q: pesquisaDebounced.trim(),
          limit: 20,
          offset: 0,
          signal: controller.signal,
        });

        if (!isMounted) return;

        const prepared = prepareArticlesForSearch(data?.items || []);
        const ranked = filterAndRankPreparedArticles(prepared, pesquisaDebounced, {
          limit: HOME_SUGGESTIONS_LIMIT,
        });

        suggestionsSnapshotRef.current = ranked;
        setSugestoes(ranked);
        setHighlightedIndex(ranked.length ? 0 : -1);
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

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
  }, [catalogoPesquisaPronto, ensureCatalogoPesquisa, pesquisaDebounced]);

  const historicoPreview = useMemo(
    () => (Array.isArray(historicoCampanhas) ? historicoCampanhas : []).filter(Boolean).slice(0, 4),
    [historicoCampanhas],
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
        onPesquisaFocus={() => {
          ensureCatalogoPesquisa().catch((error) => {
            console.warn("Não foi possível preparar a pesquisa rápida do catálogo.", error);
          });
        }}
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

      <HomeSummarySection
        totalArtigos={catalogoTotal}
        totalCampanhas={historicoCampanhas.length}
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

      <ConfirmDeleteModal
        campanha={campanhaPendenteRemocao}
        onCancel={() => setCampanhaPendenteRemocao(null)}
        onConfirm={apagarCampanha}
      />
    </div>
  );
}
