import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CampaignLabel } from "../../../components/campaign/CampaignLabel";
import { prepararItemPromocionalParaImpressao } from "../../../shared/campaign-label/promotionPricing";
import { aplicarComparacaoPvp3NoArtigo, artigoElegivelComparacaoPvp3 } from "../../../utils/pvp3Promotion";
import ImportReview, { reviewRow } from "./ImportReview";
import ImportMapping from "./ImportMapping";
import CampaignPriceImport from "./CampaignPriceImport";
jest.mock("../../../context/AuthContext",()=>({useAuth:()=>({user:{id:"actor"},profile:{store:"Praia"}})}));
jest.mock("../../../components/ToastProvider",()=>({useToast:()=>({success:jest.fn()})}));
jest.mock("../../../utils/campaignHistory",()=>({addCampaignToHistory:jest.fn(),createCampaignSnapshot:jest.fn()}));
jest.mock("../../../services/platformService",()=>({getAccessCacheScope:()=>"scope"}));
const item={id:"r1",codigo:"0010025",descricao:"Catalogue",antes:350,atual:300,pv3:900,campaignPriceImport:{kind:"catalog-pvp2-v1",beforeCents:35000,afterCents:30000}};
test("imported Before always uses catalogue PVP2 even when global source is PVP3",()=>{
 const printed=prepararItemPromocionalParaImpressao(item,"pvp3");expect(printed.antes).toBe(350);expect(printed.atual).toBe(300);expect(printed.precoSemPromocaoFonte).toBe("pvp2");
 expect(artigoElegivelComparacaoPvp3(item)).toBe(false);expect(aplicarComparacaoPvp3NoArtigo(item)).toEqual(item);
});
test("printed supplier prices are exact: whole euros must not become .99",()=>{
 const html=renderToStaticMarkup(<CampaignLabel item={item} formatoAtual="a6" />);
 expect(html).toContain("350€");expect(html).toContain("300€");expect(html).not.toContain("350,99");expect(html).toContain("-50€");
});
test.each([35000,40000])("equal and increasing imported prices are never rendered as discounts (%i)",afterCents=>{
 expect(renderToStaticMarkup(<CampaignLabel item={{...item,campaignPriceImport:{...item.campaignPriceImport,afterCents}}} formatoAtual="a6" />)).toBe("");
});
test("review shows fixed Before, editable After, differences, origins and pending errors",()=>{
 const row={id:"1",line:2,code:"0010025",description:"<script>supplier</script>",beforeCents:34999,rawPrice:"299,99",rawCode:"0010025"};
 const html=renderToStaticMarkup(<ImportReview batch={{rows:[row],capturedAt:"2026-10-31T12:00:00Z"}} edits={{1:{price:"299,99",selected:true}}} existingCodes={new Set()} onEdit={()=>{}} />);
 expect(html).toContain("PVP2 Atual de 0010025");expect(html).not.toContain('aria-label="PVP2 Antes');expect(html).toContain("349,99");expect(html).toContain("-50,00");expect(html).toContain("Promoção");expect(html).not.toContain("<script>");
 expect(reviewRow({...row,problem:"not_found"},{price:"299,99"},new Set()).error).toContain("não encontrado");
 expect(reviewRow(row,{price:"299,99"},new Set([row.code])).error).toContain("já está");
 expect(reviewRow({...row,warning:"Formula"},{price:"299,99"},new Set()).state).toBe("Pendente");
});
test("unknown mapping requires explicit price choice and confirmation",()=>{
 const html=renderToStaticMarkup(<ImportMapping sheets={[{name:"Data",rows:[[{text:"Code"},{text:"Cost"},{text:"Promotion"}],[{text:"001"},{text:"100"},{text:"299,99"}]]}]} sheetIndex={0} mapping={{headerRow:0,codeColumn:-1,priceColumn:-1}} confirmed={false} />);
 expect(html).toContain("Escolher coluna do novo preço");expect(html).toContain("Confirmo que a coluna escolhida");expect(html).toContain("PVP2 Antes vem sempre do catálogo");
});
test.each(["manual","excel"])("same importer is available in %s campaigns",mode=>{
 const html=renderToStaticMarkup(<CampaignPriceImport mode={mode} items={[]} onItems={()=>{}} title="Promo" year={2026} format="a6" />);
 expect(html).toContain("Importar tabela");expect(html).toContain("Importar preços de fornecedor");expect(html).not.toContain("disabled");
});
