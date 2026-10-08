import { validarItensCampanha } from "../shared/campaign-label/campaignValidation";
import { preservarOrigemCampanha, isPvpUpdatePromotionInfo } from "../shared/campaign-label/promotionInfoRules";
import { mapearLinhaExcel, EXCEL_FORMATS } from "../features/campaign/excel/excelCampaignUtils";
import { parseTabelaColada } from "./parsers";

const artigo = { codigo: "00123", descricao: "Produto", antes: 100, atual: 80, pv3: 120 };

test("separa artigos válidos, bloqueados e duplicados sem alterar a origem", () => {
  const bloqueado = preservarOrigemCampanha({ ...artigo, codigo: "002", info: "Actulizações dos PVPs" }, { tipo: "email", linha: 3 });
  const alterado = { ...bloqueado, info: "Desconto 20€" };
  const resultado = validarItensCampanha([artigo, { ...artigo }, alterado, { ...artigo, codigo: "003", atual: 0 }]);
  expect(resultado.totais).toEqual({ valido: 1, bloqueado: 2, duplicado: 1, naoEncontrado: 0, erro: 0 });
  expect(resultado.validos).toEqual([artigo]);
  expect(isPvpUpdatePromotionInfo(alterado)).toBe(true);
  expect(preservarOrigemCampanha(alterado, { tipo: "catalogo" }).origemDados).toEqual(bloqueado.origemDados);
  expect(isPvpUpdatePromotionInfo(JSON.parse(JSON.stringify(alterado)))).toBe(true);
});

test("uma linha duplicada com manutenção bloqueia também a outra linha do mesmo artigo", () => {
  const resultado = validarItensCampanha([artigo, { ...artigo, info: "Reposições de PVPs" }]);
  expect(resultado.validos).toEqual([]);
  expect(resultado.totais.bloqueado).toBe(2);
});

test("preserva códigos com zeros e identifica artigos já existentes", () => {
  expect(validarItensCampanha([artigo], { existentes: ["00123"] }).totais.duplicado).toBe(1);
  expect(validarItensCampanha([artigo], { existentes: ["123"] }).validos).toEqual([artigo]);
});

test("mantém a opção explícita de comparação PVP3 apenas para artigos sem manutenção", () => {
  const semDesconto = { ...artigo, antes: 80, atual: 80 };
  expect(validarItensCampanha([semDesconto]).totais.bloqueado).toBe(1);
  expect(validarItensCampanha([semDesconto], { permitirComparacaoPvp3: true }).validos).toEqual([semDesconto]);
  expect(validarItensCampanha([{ ...semDesconto, info: "Reposição PVP" }], { permitirComparacaoPvp3: true }).validos).toEqual([]);
});

test.each([EXCEL_FORMATS.CAMPANHA, EXCEL_FORMATS.SHOPPING, EXCEL_FORMATS.PRECOS_PROMOCIONAIS])(
  "o formato Excel %s mantém informação original mesmo quando gera outro texto", (formato) => {
    const row = { CODIGO: "00123", DESCRICAO: "Produto", "INFORMAÇÃO": "Atualizações de PVPs", "PVP2": 100, "PVP2P": 80 };
    const item = mapearLinhaExcel(row, 2, formato);
    expect(item.origemDados).toEqual(expect.objectContaining({ tipo: "excel", linha: 4, informacao: "Atualizações de PVPs" }));
    expect(isPvpUpdatePromotionInfo(item)).toBe(true);
    expect(validarItensCampanha([item], { validarPrecos: false }).validos).toEqual([]);
  },
);

test("regista informação repartida e não desloca colunas com código vazio", () => {
  const columns = ["", "Produto", "PN", "5601234567890", "100", "80", "120", "", "1", "2", "3", "4", "5", "", "", "", "", "Reposição", "de PVP"];
  const [item] = parseTabelaColada(columns.join("\t"));
  expect(item.codigo).toBe("");
  expect(item.descricao).toBe("Produto");
  expect(item.origemDados.informacao).toBe("Reposição de PVP");
  expect(isPvpUpdatePromotionInfo(item)).toBe(true);
  expect(validarItensCampanha(parseTabelaColada("linha inválida")).totais.bloqueado).toBe(1);
});
