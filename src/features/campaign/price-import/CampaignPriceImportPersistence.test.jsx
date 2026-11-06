import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CampaignPriceImport from "./CampaignPriceImport";
import { addCampaignToHistory, createCampaignSnapshot } from "../../../utils/campaignHistory";
jest.mock("../../../context/AuthContext",()=>({useAuth:()=>({user:{id:"actor",email:"actor@example.test"},profile:{first_name:"QA",store:"Praia"}})}));
jest.mock("../../../components/ToastProvider",()=>({useToast:()=>({success:jest.fn()})}));
jest.mock("../../../utils/campaignHistory",()=>({addCampaignToHistory:jest.fn(),createCampaignSnapshot:jest.fn()}));
jest.mock("../../../services/platformService",()=>({getAccessCacheScope:()=>"scope"}));
const incoming=[{codigo:"001",antes:349.99,atual:299.99,campaignPriceImport:{kind:"catalog-pvp2-v1",rowId:"row"}}];
let mockApply;
jest.mock("./CampaignPriceImportDialog",()=>function FakeDialog(props){mockApply=props.onApply;return <p>Review</p>;});
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);createCampaignSnapshot.mockImplementation(data=>({...data,id:"temporary"}));addCampaignToHistory.mockImplementation(async snapshot=>snapshot);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
test.each(["manual","excel"])("%s persists both prices before updating UI, without cleaning unrelated campaigns",async mode=>{
 const existing=[{codigo:"old",antes:20,atual:10}],onItems=jest.fn();
 const dates={dataInicio:"01/11",dataFim:"15/11"};
 const datedIncoming=incoming.map(item=>({...item,...dates}));
 await act(async()=>root.render(<CampaignPriceImport mode={mode} items={existing} onItems={onItems} title="Campaign" year={2026} format="a6" dates={dates}/>));
 await act(async()=>host.querySelector("button").click());
 await act(async()=>mockApply(incoming,{id:"batch",store:"Praia"}));
 expect(addCampaignToHistory).toHaveBeenCalledWith(expect.objectContaining({id:"camp-price-batch",dados:[...existing,...datedIncoming],store:"Praia",origem:mode}),{cleanup:false});
 expect(onItems).toHaveBeenCalledWith([...existing,...datedIncoming]);
 // Lost-response retry targets the same campaign, never a second generated id.
 await act(async()=>mockApply(incoming,{id:"batch",store:"Praia"}));
 expect(addCampaignToHistory.mock.calls[1][0].id).toBe("camp-price-batch");
});
test("failed persistence leaves existing UI campaign unchanged",async()=>{
 const onItems=jest.fn();addCampaignToHistory.mockRejectedValue(new Error("offline"));
 await act(async()=>root.render(<CampaignPriceImport mode="manual" items={[]} onItems={onItems} title="Campaign" year={2026} format="a6"/>));
 await act(async()=>host.querySelector("button").click());
 await act(async()=>expect(mockApply(incoming,{id:"batch",store:"Praia"})).rejects.toThrow("offline"));
 expect(onItems).not.toHaveBeenCalled();
});

test("row-specific imported dates survive parent defaults and old Excel campaigns remain untouched", async () => {
 const existing = [{codigo:"old",dataInicio:"01/08",dataFim:"15/08",antes:20,atual:10}], onItems=jest.fn(), onDatesDetected=jest.fn();
 const dated=incoming.map(item=>({...item,dataInicio:"15/12/2026",dataFim:"15/01/2027"}));
 await act(async()=>root.render(<CampaignPriceImport mode="manual" items={existing} onItems={onItems} onDatesDetected={onDatesDetected} title="PROMO" year={2026} format="a6" dates={{dataInicio:"01/11",dataFim:"15/11"}}/>));
 await act(async()=>host.querySelector("button").click()); await act(async()=>mockApply(dated,{id:"batch",store:"Praia"}));
 expect(addCampaignToHistory.mock.calls[0][0].dados).toEqual([...existing,...dated]);
 expect(addCampaignToHistory.mock.calls[0][1]).toEqual({cleanup:false});
 expect(onDatesDetected).toHaveBeenCalledWith({dataInicio:"2026-12-15",dataFim:"2027-01-15"});
});
