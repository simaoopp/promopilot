import {
  filterAndRankPreparedArticles,
  findPreparedArticleByExactLookup,
  prepareArticlesForSearch,
  buildPreparedArticlesIndex,
} from "../utils/articleSearch";
import { loadAllArtigos, refreshAllArtigosInBackground } from "./artigosService";

const DEFAULT_PAGE_SIZE = 1000;

const catalogoPesquisaState = {
  ready: false,
  total: 0,
  items: [],
  index: null,
  promise: null,
};

function hydrateCatalogoPesquisa(items = []) {
  const preparedItems = prepareArticlesForSearch(items);

  catalogoPesquisaState.ready = preparedItems.length > 0;
  catalogoPesquisaState.total = preparedItems.length;
  catalogoPesquisaState.items = preparedItems;
  catalogoPesquisaState.index = buildPreparedArticlesIndex(preparedItems);

  return getCatalogoPesquisaSnapshot();
}

export function getCatalogoPesquisaSnapshot() {
  return {
    ready: catalogoPesquisaState.ready,
    total: catalogoPesquisaState.total,
    items: catalogoPesquisaState.items,
    index: catalogoPesquisaState.index,
  };
}

export async function ensureCatalogoPesquisaPronto({ forceRefresh = false, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (!forceRefresh && catalogoPesquisaState.ready && catalogoPesquisaState.items.length > 0) {
    return getCatalogoPesquisaSnapshot();
  }

  if (!forceRefresh && catalogoPesquisaState.promise) {
    return catalogoPesquisaState.promise;
  }

  const request = loadAllArtigos({ forceRefresh, pageSize })
    .then((data) => {
      const snapshot = hydrateCatalogoPesquisa(data?.items || []);

      if (!forceRefresh && data?.source === "indexeddb") {
        refreshAllArtigosInBackground({ pageSize })
          .then((freshData) => {
            if (freshData?.items?.length) {
              hydrateCatalogoPesquisa(freshData.items);
            }
          })
          .catch((error) => {
            console.warn("Não foi possível atualizar a pesquisa do catálogo em segundo plano.", error);
          });
      }

      return snapshot;
    })
    .finally(() => {
      if (catalogoPesquisaState.promise === request) {
        catalogoPesquisaState.promise = null;
      }
    });

  catalogoPesquisaState.promise = request;
  return request;
}

export function preloadCatalogoPesquisa(options) {
  return ensureCatalogoPesquisaPronto(options);
}

export function procurarArtigoExatoNoCatalogo(rawQuery = "") {
  if (!catalogoPesquisaState.index) {
    return null;
  }

  return findPreparedArticleByExactLookup(catalogoPesquisaState.index, rawQuery);
}

export function pesquisarNoCatalogoPreparado(rawQuery = "", { limit = Infinity } = {}) {
  const items = catalogoPesquisaState.items;

  if (!items.length) {
    return [];
  }

  const exact = procurarArtigoExatoNoCatalogo(rawQuery);
  const ranked = filterAndRankPreparedArticles(items, rawQuery, {
    limit: Number.isFinite(limit) ? limit + 1 : limit,
  });

  if (!exact) {
    return Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
  }

  const deduped = [exact, ...ranked.filter((item) => item._id !== exact._id)];
  return Number.isFinite(limit) ? deduped.slice(0, limit) : deduped;
}

export function syncUpdatedArtigoToCatalogoPesquisa(updatedArtigo = {}) {
  if (!updatedArtigo?.artigo || !catalogoPesquisaState.items.length) {
    return;
  }

  const nextItems = catalogoPesquisaState.items.map((item) =>
    item.artigo === updatedArtigo.artigo
      ? {
          ...item,
          ...updatedArtigo,
        }
      : item,
  );

  hydrateCatalogoPesquisa(nextItems);
}

export function __resetCatalogoPesquisaForTests() {
  catalogoPesquisaState.ready = false;
  catalogoPesquisaState.total = 0;
  catalogoPesquisaState.items = [];
  catalogoPesquisaState.index = null;
  catalogoPesquisaState.promise = null;
}
