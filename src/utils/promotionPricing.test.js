import {
  PROMOTION_PRICE_SOURCES,
  ajustarPrecoPromocionalParaImpressao,
  formatarEuroPromocional,
  obterPrecoAtualPromocional,
  prepararItemPromocionalParaImpressao,
} from "./promotionPricing";

describe("promotionPricing", () => {
  test("converte valores inteiros para terminação .99 apenas na impressão", () => {
    expect(ajustarPrecoPromocionalParaImpressao("1299,00")).toBe(1299.99);
    expect(ajustarPrecoPromocionalParaImpressao(899)).toBe(899.99);
    expect(ajustarPrecoPromocionalParaImpressao("1299,50")).toBe(1299.5);
  });

  test("formata preço promocional com centimos comerciais", () => {
    expect(formatarEuroPromocional("1299,00")).toMatch(/1\s?299,99|1299,99/);
  });

  test("usa PVP3 para o preço atual quando disponível", () => {
    const item = { atual: "999,00", pv3: "899,00" };

    expect(obterPrecoAtualPromocional(item, PROMOTION_PRICE_SOURCES.PVP3)).toBe(899);
    expect(prepararItemPromocionalParaImpressao(item, PROMOTION_PRICE_SOURCES.PVP3).atual).toBe(899);
  });

  test("faz fallback para PVP2 quando PVP3 não existe", () => {
    expect(obterPrecoAtualPromocional({ atual: "999,00", pv3: "" }, PROMOTION_PRICE_SOURCES.PVP3)).toBe(999);
  });
});
