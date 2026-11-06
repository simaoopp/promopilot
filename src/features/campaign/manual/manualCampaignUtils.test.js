import { construirPaginasImpressao, obterTextoValidade } from "./manualCampaignUtils";

describe("construirPaginasImpressao", () => {
  test("agrupa duas etiquetas A5 por folha em modo automático", () => {
    const paginas = construirPaginasImpressao(
      [
        { id: "1", descricao: "Frigorífico" },
        { id: "2", descricao: "Frigorífico" },
        { id: "3", descricao: "Frigorífico" },
      ],
      true,
      "a6",
    );

    expect(paginas.map(page => ({ layout: page.layout, ids: page.items.map(item => item.id) }))).toEqual([
      { layout: "a5", ids: ["1", "2"] }, { layout: "a5", ids: ["3"] },
    ]);
  });

  test("mantém quatro etiquetas A6 por folha em modo automático", () => {
    const itens = Array.from({ length: 5 }, (_, index) => ({ id: String(index), descricao: "Aspirador" }));
    const paginas = construirPaginasImpressao(itens, true, "a6");

    expect(paginas).toHaveLength(2);
    expect(paginas[0].layout).toBe("a6");
    expect(paginas[0].items).toHaveLength(4);
    expect(paginas[1].items).toHaveLength(1);
  });
  test("em modo automático imprime todas as A6 antes das A5", () => {
    const paginas = construirPaginasImpressao(
      [
        { id: "1", descricao: "Aspirador" },
        { id: "2", descricao: "Frigorífico" },
        { id: "3", descricao: "Aspirador" },
        { id: "4", descricao: "Frigorífico" },
        { id: "5", descricao: "Aspirador" },
      ],
      true,
      "a6",
    );

    expect(paginas.map((pagina) => pagina.layout)).toEqual(["a6", "a5"]);
    expect(paginas[0].items.map((item) => item.id)).toEqual(["1", "3", "5"]);
    expect(paginas[1].items.map((item) => item.id)).toEqual(["2", "4"]);
  });

});

test("datas completas importadas preservam anos diferentes sem acrescentar outro ano", () => {
 expect(obterTextoValidade({dataInicio:"15/12/2026",dataFim:"15/01/2027"},2026,"PROMO")).toBe("VÁLIDO DE 15/12/2026 A 15/01/2027");
 expect(obterTextoValidade({dataInicio:"01/11",dataFim:"15/11"},2026,"PROMO")).toBe("VÁLIDO DE 01/11/2026 A 15/11/2026");
});

test("campanhas Excel antigas mantêm dados e formatos ao voltar a imprimir", () => {
 const old=Object.freeze({id:"old-excel",origem:"excel",anoValidade:2026,formatoEtiqueta:"a5",dados:Object.freeze([
   Object.freeze({id:"old-row",codigo:"00001",descricao:"Frigorífico",antes:350,atual:300,dataInicio:"01/11",dataFim:"15/11"}),
 ])});
 const pages=construirPaginasImpressao(old.dados,false,old.formatoEtiqueta);
 expect(pages[0].layout).toBe("a5");expect(pages[0].items[0]).toEqual(old.dados[0]);
 expect(obterTextoValidade(pages[0].items[0],old.anoValidade,"PROMO")).toBe("VÁLIDO DE 01/11/2026 A 15/11/2026");
 expect(old.origem).toBe("excel");
});
