import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "./App";
import HomeQuickActions from "./components/home/HomeQuickActions";
let mockManualAllowed = true;
jest.mock("./context/AuthContext", () => ({ useAuth: () => ({ user: { id: "qa" }, authStatus: "authenticated" }) }));
jest.mock("./context/PermissionContext", () => ({ PermissionProvider: ({ children }) => children, usePermissions: () => ({ context: { organizationId: "qa" }, can: () => false, hasPage: key => key === "manual" && mockManualAllowed }) }));
jest.mock("./context/CampaignLabelRulesContext", () => ({ CampaignLabelRulesProvider: ({ children }) => children }));
jest.mock("./components/Sidebar", () => () => null);
jest.mock("./components/ProtectedRoute", () => ({ children }) => children);
jest.mock("./components/GlobalSellerAssistant", () => () => null);
jest.mock("./pages/EtiquetasCampanha", () => () => <h1>Campanhas Manuais</h1>);
let host, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockManualAllowed = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const Location = () => { const location = useLocation(); return <output>{location.pathname}{location.search}{location.hash}</output>; };
const mount = () => act(async () => root.render(<MemoryRouter initialEntries={["/EtiquetasCampanhaExcel?origem=antiga#campanha"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /><Location /></MemoryRouter>));
test("old Excel link redirects to manual creation, retaining query/hash", async () => {
 await mount(); expect(host.querySelector("h1").textContent).toBe("Campanhas Manuais");
 expect(host.querySelector("output").textContent).toBe("/EtiquetasCampanha?origem=antiga#campanha");
});
test("legacy redirect does not grant permission to manual campaigns", async () => {
 mockManualAllowed = false; await mount(); expect(host.textContent).toContain("Esta área não está disponível");
 expect(host.querySelector("h1").textContent).not.toBe("Campanhas Manuais");
});
test("one creation action includes imports without the redundant Excel action", async () => {
 const open = jest.fn(); await act(async () => root.render(<HomeQuickActions onOpenCampaign={open} />));
 expect(host.textContent).toContain("Criar campanha"); expect(host.textContent).toContain("Excel/ODS"); expect(host.textContent).not.toContain("Importação Excel");
 await act(async () => host.querySelector("button").click()); expect(open).toHaveBeenCalledTimes(1);
});
