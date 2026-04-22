import {
  buildPreparedArticlesIndex,
  filterAndRankPreparedArticles,
  findPreparedArticleByExactLookup,
  prepareArticlesForSearch,
} from "./articleSearch";

describe("articleSearch", () => {
  const prepared = prepareArticlesForSearch([
    {
      artigo: "TV-001",
      descricao: "Televisão OLED 55 polegadas",
      codigoBarras: "5601234567890",
      marca: "LG",
      modelo: "OLED55",
    },
    {
      artigo: "CABO-10",
      descricao: "Cabo HDMI 2.1",
      codigoBarras: "5609999999999",
      marca: "Expert",
      modelo: "HDMI21",
    },
  ]);

  test("encontra artigo por EAN exato", () => {
    const index = buildPreparedArticlesIndex(prepared);
    const result = findPreparedArticleByExactLookup(index, "5601234567890");

    expect(result?.artigo).toBe("TV-001");
  });

  test("prioriza correspondência exata por código de artigo", () => {
    const [result] = filterAndRankPreparedArticles(prepared, "TV-001", { limit: 1 });

    expect(result?.artigo).toBe("TV-001");
  });

  test("pesquisa por descrição continua a devolver resultados", () => {
    const results = filterAndRankPreparedArticles(prepared, "oled 55", { limit: 5 });

    expect(results.map((item) => item.artigo)).toContain("TV-001");
  });
});
