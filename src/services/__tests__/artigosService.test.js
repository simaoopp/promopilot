import {
    __clearArtigosCacheForTests,
    normalizeArtigosApiResponse,
  } from "../artigosService";
  
  describe("normalizeArtigosApiResponse", () => {
    afterEach(() => {
      __clearArtigosCacheForTests();
    });
  
    it("normaliza resposta em formato array legado", () => {
      const data = [{ artigo: "A1" }, { artigo: "A2" }];
      const result = normalizeArtigosApiResponse(data, 100, 0);
  
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });
  
    it("normaliza resposta paginada moderna", () => {
      const result = normalizeArtigosApiResponse(
        {
          ok: true,
          items: [{ artigo: "A1" }],
          total: 10,
          limit: 1,
          offset: 0,
          hasMore: true,
          q: "arroz",
        },
        100,
        0,
      );
  
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(10);
      expect(result.limit).toBe(1);
      expect(result.hasMore).toBe(true);
      expect(result.q).toBe("arroz");
    });
  });
  