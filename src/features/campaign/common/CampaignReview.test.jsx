import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CampaignReview from "./CampaignReview";
import { validarItensCampanha } from "../../../shared/campaign-label/campaignValidation";
import { preservarOrigemCampanha } from "../../../shared/campaign-label/promotionInfoRules";

const artigo = { codigo: "00123", descricao: "Produto", antes: 100, atual: 80 };

test("mostra motivos e informação original sem executar conteúdo colado", () => {
  const item = preservarOrigemCampanha({ ...artigo, info: "Reposição PVP <script>alert(1)</script>" }, { tipo: "excel", ficheiro: "campanha.xlsx", linha: 2 });
  const html = renderToStaticMarkup(<CampaignReview resultado={validarItensCampanha([item])} modal substituiTabela onCancel={() => {}} />);
  expect(html).toContain('role="dialog"');
  expect(html).toContain("Bloqueado: 1");
  expect(html).toContain("campanha.xlsx");
  expect(html).toContain("Ver informação original");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toMatch(/disabled=""[^>]*>Adicionar 0 artigo/);
  expect(html).toContain("Cancelar mantém os dados existentes");
});

test("permite adicionar apenas o total válido e desativa depois de concluir", () => {
  const resultado = validarItensCampanha([artigo, { ...artigo }, { ...artigo, codigo: "002", atual: 120 }]);
  const html = renderToStaticMarkup(<CampaignReview resultado={resultado} />);
  expect(html).toContain("Adicionar 1 artigo(s) válido(s)");
  expect(html).not.toContain('disabled=""');
  const concluido = renderToStaticMarkup(<CampaignReview resultado={resultado} concluido />);
  expect(concluido).toMatch(/disabled=""[^>]*>Artigos adicionados/);
});

test("mostra edição em bloqueios de preço, mantendo-a após correção", () => {
  const bloqueado = validarItensCampanha([{ ...artigo, atual: 120 }]);
  const html = renderToStaticMarkup(<CampaignReview resultado={bloqueado} onPriceChange={() => {}} />);
  expect(html).toContain('aria-label="Preço antes de 00123"');
  expect(html).toContain('aria-label="Preço atual de 00123"');
  const corrigido = validarItensCampanha([{ ...artigo, precosEditados: true }]);
  expect(renderToStaticMarkup(<CampaignReview resultado={corrigido} onPriceChange={() => {}} />)).toContain("Alterar preços da campanha");
  expect(renderToStaticMarkup(<CampaignReview resultado={bloqueado} />)).not.toContain("Alterar preços da campanha");
  expect(renderToStaticMarkup(<CampaignReview resultado={corrigido} concluido onPriceChange={() => {}} />)).not.toContain("Alterar preços da campanha");
});

test("não oferece edição para manutenção de PVP", () => {
  const resultado = validarItensCampanha([{ ...artigo, info: "Reposição PVP", atual: 120 }]);
  expect(renderToStaticMarkup(<CampaignReview resultado={resultado} onPriceChange={() => {}} />)).not.toContain("Alterar preços da campanha");
});
