import {
  __clearArtigosCacheForTests,
  buildArtigosCatalogoPath,
  isFullCatalogoResponse,
  mergeArtigoData,
  mergeArtigosIntoList,
  normalizeArtigosApiResponse,
} from "../artigosService";

describe("artigosService", () => {
  afterEach(() => {
    __clearArtigosCacheForTests();
  });

  test("normaliza resposta paginada da API", () => {
    const result = normalizeArtigosApiResponse(
      {
        ok: true,
        items: [{ artigo: "A1" }],
        total: 1,
        limit: 25,
        offset: 0,
        hasMore: false,
        q: "tv",
      },
      100,
      0,
    );

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.limit).toBe(25);
    expect(result.q).toBe("tv");
  });

  test("usa a rota canónica de artigos para pedir catálogo completo", () => {
    expect(buildArtigosCatalogoPath()).toBe(
      "/api/artigos?catalogo=1&includeCount=0&pageSize=1000",
    );

    expect(buildArtigosCatalogoPath({ forceRefresh: true, pageSize: 2500 })).toBe(
      "/api/artigos?catalogo=1&includeCount=0&pageSize=2500&refresh=1",
    );
  });

  test("distingue catálogo completo de resposta paginada", () => {
    expect(
      isFullCatalogoResponse({
        ok: true,
        items: [{ artigo: "A1" }, { artigo: "A2" }],
        total: 2,
        hasMore: false,
      }),
    ).toBe(true);

    expect(
      isFullCatalogoResponse({
        ok: true,
        items: [{ artigo: "A1" }],
        total: 2,
        hasMore: true,
      }),
    ).toBe(false);
  });

  test("mistura campos enriquecidos sem perder coleções", () => {
    const merged = mergeArtigoData(
      {
        artigo: "A1",
        descricao: "Base",
        caracteristicas_tecnicas: { potencia: "1000W" },
        documentos_oficiais: ["https://example.com/base"],
      },
      {
        artigo: "A1",
        titulo_oficial: "Título",
        documentos_oficiais: ["https://example.com/novo"],
      },
    );

    expect(merged.titulo_oficial).toBe("Título");
    expect(merged.caracteristicas_tecnicas).toEqual({ potencia: "1000W" });
    expect(merged.documentos_oficiais).toEqual(["https://example.com/novo"]);
  });

  test("atualiza apenas o artigo enriquecido na lista", () => {
    const updated = mergeArtigosIntoList(
      [
        { artigo: "A1", descricao: "Base 1" },
        { artigo: "A2", descricao: "Base 2" },
      ],
      { artigo: "A2", titulo_oficial: "Novo título" },
    );

    expect(updated[0]).toEqual({ artigo: "A1", descricao: "Base 1" });
    expect(updated[1]).toEqual({
      artigo: "A2",
      descricao: "Base 2",
      titulo_oficial: "Novo título",
      caracteristicas_tecnicas: {},
      documentos_oficiais: [],
      texto_grounding: "",
      observacoes_ia: "",
      resumo_vendedor: "",
    });
  });
});
