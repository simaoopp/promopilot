import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {MemoryRouter} from "react-router-dom";
import Homepage from "./Homepage";
import {loadCampaignHistory} from "../utils/campaignHistory";
import {useAuth} from "../context/AuthContext";
jest.mock("../context/AuthContext",()=>({useAuth:jest.fn()}));
jest.mock("../context/PermissionContext",()=>({usePermissions:()=>({context:{organizationId:"qa"},can:key=>key==="campaigns.read"})}));
jest.mock("../components/ToastProvider",()=>({useToast:()=>({})}));
jest.mock("../services/artigosService",()=>({warmupApi:jest.fn()}));
jest.mock("../services/catalogoPesquisaService",()=>({getCatalogoPesquisaSnapshot:()=>({total:0})}));
jest.mock("../utils/campaignHistory",()=>({loadCampaignHistory:jest.fn(),removeCampaignFromHistory:jest.fn()}));
jest.mock("../utils/automaticCampaignHistory",()=>({loadAutomaticCampaignHistory:jest.fn(),removeAutomaticCampaignFromHistory:jest.fn()}));
jest.mock("../components/home/HomeHero",()=>()=>null);
jest.mock("../components/home/HomeQuickActions",()=>()=>"Ações da homepage");
jest.mock("../components/home/HomeHistorySection",()=>()=>"Histórico carregado");
jest.mock("../components/home/HomeAutomaticCampaignHistorySection",()=>()=>null);
jest.mock("../components/home/HomeSummarySection",()=>()=>null);
jest.mock("../components/home/ArticleDetailsModal",()=>()=>null);
jest.mock("../components/home/CampaignDetailsModal",()=>()=>null);
jest.mock("../components/home/AutomaticCampaignDetailsModal",()=>()=>null);
jest.mock("../components/home/ConfirmDeleteModal",()=>()=>null);
let host,root,signOut;
beforeEach(()=>{
 jest.clearAllMocks();jest.useFakeTimers();global.IS_REACT_ACT_ENVIRONMENT=true;
 jest.spyOn(console,"warn").mockImplementation(()=>{});signOut=jest.fn();
 useAuth.mockReturnValue({user:{id:"a"},profile:{store:"QA"},signOut});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.useRealTimers();jest.restoreAllMocks();});
async function mount(){await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Homepage/></MemoryRouter>));}
test("a secondary API failure keeps homepage actions and authentication, with a retry",async()=>{
 loadCampaignHistory.mockRejectedValueOnce(new TypeError("fetch failed secret-token"));await mount();
 expect(host.textContent).toContain("Ações da homepage");expect(host.textContent).toContain("Não foi possível carregar alguns resumos");expect(signOut).not.toHaveBeenCalled();
 expect(JSON.stringify(console.warn.mock.calls)).not.toContain("secret-token");
 loadCampaignHistory.mockResolvedValue([]);await act(async()=>host.querySelector("button").click());
 expect(host.textContent).toContain("Histórico carregado");expect(host.textContent).not.toContain("Não foi possível carregar alguns resumos");
});
test("a hung secondary API stops loading after its deadline",async()=>{
 loadCampaignHistory.mockReturnValue(new Promise(()=>{}));await mount();expect(host.textContent).toContain("A carregar os resumos");
 await act(async()=>jest.advanceTimersByTime(20000));expect(host.textContent).toContain("Não foi possível carregar alguns resumos");
 expect(host.textContent).not.toContain("A carregar os resumos");expect(signOut).not.toHaveBeenCalled();
});
