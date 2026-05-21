import {
  filterAndRankPreparedArticles,
  findPreparedArticleByExactLookup,
  prepareArticlesForSearch,
  buildPreparedArticlesIndex,
} from "../utils/articleSearch";
import { searchArtigos } from "./artigosService";

const catalogoPesquisaState = {
  ready: true,
  total: 0,
  items: [],
  index: null,
  promise: null,
};

function hydrateCatalogoPesquisa(items = []) {
  const preparedItems = prepareArticlesForSearch(items);

  catalogoPesquisaState.ready = true;
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

export async function ensureCatalogoPesquisaPronto() {
  // Desde que o catálogo passou para ~250k artigos, o comportamento sénior é não
  // carregar tudo para memória/browser. As páginas devem usar pesquisa remota.
  return getCatalogoPesquisaSnapshot();
}

export function preloadCatalogoPesquisa() {
  return Promise.resolve(getCatalogoPesquisaSnapshot());
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

export async function pesquisarNoCatalogoRemoto(rawQuery = "", { limit = 20, offset = 0, signal } = {}) {
  const termo = String(rawQuery || "").trim();

  if (termo.length < 2) {
    return [];
  }

  const result = await searchArtigos({ q: termo, limit, offset, signal });
  const prepared = prepareArticlesForSearch(result?.items || []);

  // Mantemos uma pequena cache de resultados recentes apenas para seleção/scan,
  // nunca o catálogo completo.
  hydrateCatalogoPesquisa(prepared);
  return prepared;
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
  catalogoPesquisaState.ready = true;
  catalogoPesquisaState.total = 0;
  catalogoPesquisaState.items = [];
  catalogoPesquisaState.index = null;
  catalogoPesquisaState.promise = null;
}
