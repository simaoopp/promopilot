import { construirPaginasImpressao } from "./manualCampaignUtils";

describe("construirPaginasImpressao", () => {
  test("agrupa duas etiquetas A5 por folha em modo automático", () => {
    const paginas = construirPaginasImpressao(
      [
        { id: "1", _formato: "a5" },
        { id: "2", _formato: "a5" },
        { id: "3", _formato: "a5" },
      ],
      true,
      "a6",
    );

    expect(paginas).toEqual([
      { layout: "a5", items: [{ id: "1", _formato: "a5" }, { id: "2", _formato: "a5" }] },
      { layout: "a5", items: [{ id: "3", _formato: "a5" }] },
    ]);
  });

  test("mantém quatro etiquetas A6 por folha em modo automático", () => {
    const itens = Array.from({ length: 5 }, (_, index) => ({ id: String(index), _formato: "a6" }));
    const paginas = construirPaginasImpressao(itens, true, "a6");

    expect(paginas).toHaveLength(2);
    expect(paginas[0].layout).toBe("a6");
    expect(paginas[0].items).toHaveLength(4);
    expect(paginas[1].items).toHaveLength(1);
  });
});
