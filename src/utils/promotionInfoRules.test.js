import { isPvpUpdatePromotionInfo } from "../shared/campaign-label/promotionInfoRules";
import { buildAutomaticPrintPages, buildManualCampaignPrintPages } from "../shared/campaign-label/formatRules";
import { aplicarComparacaoPvp3NoArtigo, artigoElegivelComparacaoPvp3 } from "./pvp3Promotion";
import { parseTabelaColada } from "./parsers";

test.each([
  "Atualização PVP", "ATUALIZAÇÃO DE PVP", "Actualização do P.V.P.",
  "ATULIZAÇÃO PVP", "Reposição de PVP", "REPOSIÇÃO DO PVP2",
  "REPOS. PVP", "ATUAL. PVP", "PVP: Reposição", "PVP - Atualização",
  "ATUALIZACAOPVP", "Reposição\n de\tP V P 3",
])("bloqueia manutenção: %s", (info) => {
  expect(isPvpUpdatePromotionInfo({ info })).toBe(true);
});

test.each([
  "Campanha", "Comparação PVP atual/PVP3", "Desconto 20€",
  "REPOSIÇÃO DE STOCK", "PVP atual 299,99", "Preço atual PVP2",
  "Atualização de descrição", "REPOR STOCK",
])("preserva informação sem manutenção de PVP: %s", (info) => {
  expect(isPvpUpdatePromotionInfo({ info })).toBe(false);
});

test.each(["info", "INFORMAÇÃO", "informacao_promo", "alterado", "estado", "observacoes"])(
  "reconhece o campo %s", (campo) => {
    expect(isPvpUpdatePromotionInfo({ [campo]: "Reposição de PVP" })).toBe(true);
  },
);

test("não classifica pela descrição do produto", () => {
  expect(isPvpUpdatePromotionInfo({ descricao: "Atualização PVP", info: "Campanha" })).toBe(false);
});

test.each(["a5", "a6", "automatico"])("exclui manutenção da impressão %s mesmo com desconto", (formato) => {
  const bloqueado = { codigo: "123", info: "Reposição do PVP2", antes: 100, atual: 50, pv3: 150 };
  const valido = { codigo: "456", info: "Comparação PVP atual/PVP3", antes: 100, atual: 50 };
  const items = [bloqueado, valido];
  expect(buildAutomaticPrintPages(items, formato).flatMap((page) => page.items)).toEqual([expect.objectContaining(valido)]);
  expect(buildManualCampaignPrintPages(items, formato === "automatico", formato).flatMap((page) => page.items)).toEqual([expect.objectContaining(valido)]);
  expect(buildAutomaticPrintPages([bloqueado], formato)).toEqual([]);
  expect(artigoElegivelComparacaoPvp3(bloqueado)).toBe(false);
  expect(aplicarComparacaoPvp3NoArtigo(bloqueado)).toEqual({ ...bloqueado, selecionado: false });
});

test("preserva informação repartida em várias colunas ao colar", () => {
  const colunas = ["123", "Produto", "PN", "5601234567890", "100", "50", "150", "", "1", "2", "3", "4", "5", "", "", "", "", "Atualização", "de PVP"];
  const [item] = parseTabelaColada(colunas.join("\t"));
  expect(item.info).toBe("Atualização de PVP");
  expect(isPvpUpdatePromotionInfo(item)).toBe(true);
});
