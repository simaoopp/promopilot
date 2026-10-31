import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TextEncoder } from "util";
import Dialog from "./CampaignPriceImportDialog";
import { createImportApi } from "./importApi";
import { extractInWorker } from "./extractInWorker";

jest.mock("./importApi", () => ({ createImportApi: jest.fn() }));
jest.mock("./extractInWorker", () => ({ extractInWorker: jest.fn() }));
const sheet={name:"Supplier",rows:[[{text:"Code"},{text:"Cost"},{text:"Promo"}],[{text:"001"},{text:"50"},{text:"299,99"}]]};
const rows=[
 {id:"r1",line:2,code:"001",rawCode:"001",rawPrice:"299,99",description:"Catalogue name",beforeCents:34999,currentCents:29999},
 {id:"r2",line:3,code:"002",rawCode:"002",rawPrice:"199,99",description:"Same price",beforeCents:19999,currentCents:19999},
 {id:"r3",line:4,code:"003",rawCode:"003",rawPrice:"169,99",description:"Increase",beforeCents:14999,currentCents:16999},
 {id:"r4",line:5,code:"unknown",problem:"not_found",beforeCents:null,currentCents:999,rawPrice:"9,99"},
];
const batch={id:"batch",store:"Praia",capturedAt:"2026-10-31T12:00:00Z",rows};
const items=[{codigo:"001",antes:349.99,atual:299.99,campaignPriceImport:{kind:"catalog-pvp2-v1",beforeCents:34999,afterCents:29999}}];
let root,host,rpc,onApply,onClose;
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;global.TextEncoder=TextEncoder;jest.clearAllMocks();
 Object.defineProperty(global,"crypto",{configurable:true,value:{subtle:{digest:async()=>new Uint8Array(32)},randomUUID:()=>"00000000-0000-4000-8000-000000000001"}});
 extractInWorker.mockResolvedValue([sheet]);
 rpc=jest.fn(async(action)=>action==="models"?{models:[]}:action==="prepare"?batch:{...batch,status:"confirmed",items});
 createImportApi.mockResolvedValue(rpc);onApply=jest.fn().mockResolvedValue();onClose=jest.fn();
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(mode="manual",extra={}){await act(async()=>root.render(<Dialog mode={mode} store="Praia" items={[]} onApply={onApply} onClose={onClose} {...extra}/>));}
async function change(element,value){await act(async()=>{
 const proto=element.tagName==="SELECT"?HTMLSelectElement.prototype:element.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(proto,"value").set.call(element,value);
 element.dispatchEvent(new Event(element.tagName==="SELECT"?"change":"input",{bubbles:true}));
});}
async function click(element){await act(async()=>element.click());}
const button=text=>[...host.querySelectorAll("button")].find(el=>el.textContent.includes(text));
const select=label=>[...host.querySelectorAll("label")].find(el=>el.textContent.startsWith(label)).querySelector("select");
async function source(){await change(host.querySelector("textarea"),"Code\tCost\tPromo\n001\t50\t299,99");await click(button("Ler tabela"));}
async function mapping(){await change(select("Código do artigo"),"0");await change(select("PVP2 Atual"),"2");await click(host.querySelector('.price-import-confirm-column input'));}
async function review(){await source();await mapping();await click(button("Consultar PVP2"));}

test.each(["manual","excel"])("%s complete flow requires price mapping, shows catalogue snapshot and saves selected rows",async mode=>{
 await mount(mode);await source();expect(button("Consultar PVP2").disabled).toBe(true);
 await mapping();await click(button("Consultar PVP2"));
 expect(rpc.mock.calls.find(([action])=>action==="prepare")[1]).toEqual(expect.objectContaining({mode,rows:[expect.objectContaining({code:"001",cents:29999})]}));
 expect(host.textContent).toContain("349,99");expect(host.textContent).toContain("Sem alteração");expect(host.textContent).toContain("Aumento");
 expect(host.querySelector('input[aria-label="Incluir 001"]').checked).toBe(true);
 expect(host.querySelector('input[aria-label="Incluir 002"]').checked).toBe(false);
 expect(host.querySelector('input[aria-label="Incluir 003"]').checked).toBe(false);
 expect(host.querySelector('input[aria-label="Incluir unknown"]').disabled).toBe(true);
 await click(button("Aplicar e guardar"));expect(onApply).toHaveBeenCalledWith(items,expect.objectContaining({status:"confirmed"}));expect(onClose).toHaveBeenCalled();
 expect(rpc.mock.calls.find(([action])=>action==="confirm")[1].selected).toEqual([{id:"r1",cents:29999,reviewed:false}]);
});
test("manual price correction requires selecting the line again; Before has no edit control",async()=>{
 await mount();await review();
 await change(host.querySelector('input[aria-label="PVP2 Atual de 001"]'),"289,99");
 expect(host.querySelector('input[aria-label="Incluir 001"]').checked).toBe(false);expect(host.querySelector('input[aria-label^="PVP2 Antes"]')).toBeNull();
 await click(host.querySelector('input[aria-label="Incluir 001"]'));await click(host.querySelector('input[aria-label="Incluir 003"]'));
 await click(button("Aplicar e guardar"));expect(rpc.mock.calls.find(([a])=>a==="confirm")[1].selected).toEqual([{id:"r1",cents:28999,reviewed:false},{id:"r3",cents:16999,reviewed:false}]);
});
test("cancelling review makes no campaign write; existing article remains excluded",async()=>{
 await mount("manual",{items:[{codigo:"001"}]});await review();
 expect(host.querySelector('input[aria-label="Incluir 001"]').disabled).toBe(true);await click(button("Cancelar"));
 expect(onApply).not.toHaveBeenCalled();expect(rpc.mock.calls.some(([a])=>a==="confirm")).toBe(false);
});
test("a failed campaign save retries the same immutable confirmation without losing preview",async()=>{
 onApply.mockRejectedValueOnce(new Error("Connection interrupted"));await mount();await review();await click(button("Aplicar e guardar"));
 expect(host.textContent).toContain("Connection interrupted");expect(host.querySelector('input[aria-label="PVP2 Atual de 001"]').disabled).toBe(true);
 await click(button("Repetir confirmação"));expect(onApply).toHaveBeenCalledTimes(2);
 const confirmations=rpc.mock.calls.filter(([a])=>a==="confirm");expect(confirmations[0][1]).toEqual(confirmations[1][1]);
});
test("changing tenant closes review; late preparation never applies a campaign",async()=>{
 await mount();await review();await act(async()=>window.dispatchEvent(new Event("promopilot:access-changed")));
 expect(onClose).toHaveBeenCalled();expect(onApply).not.toHaveBeenCalled();
});
