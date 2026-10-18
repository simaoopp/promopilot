import { parseTabelaColada } from "../../../utils/parsers";
import { obterDataInputCampanha } from "../../../utils/campaignDates";
import { validarItensCampanha } from "../../../shared/campaign-label/campaignValidation";
import { dataCampanhaInvalida, itemTabelaInvalido } from "./manualCampaignUtils";

// Synthetic commercial rows: no external customer export is required by CI.
const tabelaExemplo = Array.from({ length: 23 }, (_, index) => [
  `99.000.001.${String(index + 1).padStart(5, "0")}`,
  `Artigo de teste ${index + 1}`, `MODELO-${index + 1}`,
  `990000000${String(index + 1).padStart(4, "0")}`,
  index === 3 ? "1 049,99" : "549,99",
  index === 3 ? "999,99" : "469,99",
  index === 3 ? "1 399,99" : "629,99",
  "A", "1", "0", "1", "1", "0", "15/10/2026", "15-10", "02-11",
  "SIM", "PROMO_TESTE_15102026",
].join("\t")).join("\n");

test.each(["15-10", "15/10", "1-2", "1/2", " 15-10 ", "15/out", "15/out.", "15/OUT", "15/oct"])(
  "aceita uma data válida: %s", (data) => {
    expect(dataCampanhaInvalida(data, 2026)).toBe(false);
  },
);

test.each(["", "-", null, undefined])("preserva a data opcional: %s", (data) => {
  expect(dataCampanhaInvalida(data, 2026)).toBe(false);
});

test.each([
  "31-02", "31/02", "31-04", "31/04", "00-10", "15-00", "15-13", "32-01",
  "15--10", "15/10 lixo", "15-10-2026", "2026-10-15", "31/fev", "15/xyz",
])("recusa uma data impossível ou formato incorreto: %s", (data) => {
  expect(dataCampanhaInvalida(data, 2026)).toBe(true);
});

test("valida o dia bissexto pelo ano escolhido para a campanha", () => {
  for (const data of ["29-02", "29/02", "29/fev"]) {
    expect(dataCampanhaInvalida(data, 2024)).toBe(false);
    expect(dataCampanhaInvalida(data, 2026)).toBe(true);
  }
  const [item] = parseTabelaColada(tabelaExemplo);
  const bissexto = { ...item, dataInicio: "29-02", dataFim: "01-03" };
  expect(itemTabelaInvalido(bissexto, 2024)).toBe(false);
  expect(itemTabelaInvalido(bissexto, 2026)).toBe(true);
});

test("23 linhas sintéticas passam a revisão antes de confirmar a importação", () => {
  const itens = parseTabelaColada(tabelaExemplo);
  expect(itens).toHaveLength(23);
  const revisao = validarItensCampanha(itens, { permitirComparacaoPvp3: true });
  expect(revisao.totais).toEqual({ valido: 23, bloqueado: 0, duplicado: 0, naoEncontrado: 0, erro: 0 });
  expect(revisao.validos.filter((item) => itemTabelaInvalido(item, 2026))).toEqual([]);
  for (const item of itens) {
    expect(item.dataInicio).toBe("15/10");
    expect(item.dataFim).toBe("02/11");
    expect(obterDataInputCampanha(item.dataInicio, 2026)).toBe("2026-10-15");
    expect(obterDataInputCampanha(item.dataFim, 2026)).toBe("2026-11-02");
    expect(item.data).toBe("15/10/2026");
    expect(item.info).toBe("PROMO_TESTE_15102026");
    expect(item.origemDados.informacao).toContain("PROMO_TESTE_15102026");
  }
  expect(itens[0]).toEqual(expect.objectContaining({ codigo: "99.000.001.00001", ean: "9900000000001", antes: 549.99, atual: 469.99 }));
  expect(itens[3]).toEqual(expect.objectContaining({ antes: 1049.99, atual: 999.99, pv3: "1 399,99" }));
});

test("barras e hífen geram os mesmos artigos e preservam os campos de origem", () => {
  const barras = tabelaExemplo.replace(/\t15-10\t02-11\t/g, "\t15/10\t02/11\t");
  expect(parseTabelaColada(tabelaExemplo)).toEqual(parseTabelaColada(barras));
});

test("não transforma uma data inválida em vazio nem contorna o bloqueio da linha", () => {
  const [item] = parseTabelaColada(tabelaExemplo.replace("\t15-10\t", "\t31-02\t"));
  expect(item.dataInicio).toBe("31/02");
  expect(itemTabelaInvalido(item, 2026)).toBe(true);
  const [textoInvalido] = parseTabelaColada(tabelaExemplo.replace("\t15-10\t", "\tdata errada\t"));
  expect(textoInvalido.dataInicio).toBe("data errada");
  expect(itemTabelaInvalido(textoInvalido, 2026)).toBe(true);
});

test("continua a bloquear manutenção de PVP e preços sem desconto", () => {
  const [item] = parseTabelaColada(tabelaExemplo);
  const manutencao = { ...item, info: "Atualização PVP" };
  const semDesconto = { ...item, atual: 700 };
  for (const bloqueado of [manutencao, semDesconto]) {
    expect(validarItensCampanha([bloqueado], { permitirComparacaoPvp3: true }).totais.bloqueado).toBe(1);
  }
});
