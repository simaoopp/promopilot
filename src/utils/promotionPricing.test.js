import {
  PROMOTION_PRICE_SOURCES,
  ajustarPrecoPromocionalParaImpressao,
  formatarEuroPromocional,
  obterPrecoPromocaoParaImpressao,
  obterPrecoSemPromocaoParaImpressao,
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

  test("PVP3 altera apenas o preço sem promoção e mantém PVP ATUAL como preço de promoção", () => {
    const item = { antes: "1299,00", atual: "999,00", pv3: "1199,00" };
    const itemImpressao = prepararItemPromocionalParaImpressao(item, PROMOTION_PRICE_SOURCES.PVP3);

    expect(obterPrecoSemPromocaoParaImpressao(item, PROMOTION_PRICE_SOURCES.PVP3)).toBe(1199);
    expect(obterPrecoPromocaoParaImpressao(item)).toBe(999);
    expect(itemImpressao.antes).toBe(1199);
    expect(itemImpressao.atual).toBe(999);
  });

  test("PVP2 usa o campo antes como preço sem promoção", () => {
    const item = { antes: "1299,00", atual: "999,00", pv3: "1199,00" };
    const itemImpressao = prepararItemPromocionalParaImpressao(item, PROMOTION_PRICE_SOURCES.PVP2);

    expect(itemImpressao.antes).toBe(1299);
    expect(itemImpressao.atual).toBe(999);
  });

  test("faz fallback para PVP2/antes quando PVP3 não existe", () => {
    expect(obterPrecoSemPromocaoParaImpressao({ antes: "1299,00", atual: "999,00", pv3: "" }, PROMOTION_PRICE_SOURCES.PVP3)).toBe(1299);
  });
});
