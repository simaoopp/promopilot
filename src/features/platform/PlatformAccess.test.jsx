import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FeatureRoute from "../../components/FeatureRoute";
import Sidebar from "../../components/Sidebar";
import CeoAdmin from "./CeoAdmin";
import { usePermissions } from "../../context/PermissionContext";
import { ceoRead, ceoChange } from "../../services/platformService";

jest.mock("../../context/PermissionContext", () => ({ usePermissions: jest.fn() }));
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "qa", email: "qa@example.test", user_metadata: { role: "ceo" } }, profile: { first_name: "QA", store: "Praia", role: "admin" } }) }));
jest.mock("../../services/platformService", () => ({ ceoRead: jest.fn(), ceoChange: jest.fn() }));
jest.mock("../../components/admin/ArticleDatabaseSyncPanel", () => () => null);
jest.mock("../../components/admin/UserManagementPanel", () => () => null);
let root, container, access, enabled;
beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  access = { context: { platformAdmin: false, pages: [{ page_key: "home", path: "/Homepage", name: "Início" }] }, loading: false, error: "", can: () => false, hasPage: () => false, refresh: jest.fn(async () => {}) };
  usePermissions.mockImplementation(() => access);
  enabled = false;
  ceoRead.mockImplementation(async resource => resource === "organization" ? {
    organization: { id: "org1", name: "Expert", status: "active" },
    modules: [{ module_key: "pos", name: "POS", effective: enabled, status: "available", source: "ceo", override: enabled, implemented: false, dependencies: [] }],
  } : { items: [], total: 0 });
  ceoChange.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(element, path = "/ceo") { await act(async () => root.render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>)); }
const adminRoute = () => <Routes><Route path="/ceo/*" element={<FeatureRoute ceo><CeoAdmin /></FeatureRoute>} /></Routes>;

test("ordinary organization admin and user metadata cannot open CEO directly", async () => {
  await render(adminRoute()); expect(container.textContent).toContain("Acesso restrito"); expect(ceoRead).not.toHaveBeenCalled();
});
test("direct module route rejects missing permission even when authenticated", async () => {
  await render(<FeatureRoute page="pos"><p>Operations</p></FeatureRoute>, "/POS");
  expect(container.textContent).toContain("Acesso restrito"); expect(container.textContent).not.toContain("Operations");
});
test("permission service failure fails closed and offers retry", async () => {
  access.error = "Serviço indisponível";
  await render(<FeatureRoute permission="products.read"><p>Private products</p></FeatureRoute>);
  expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.textContent).not.toContain("Private products");
  await act(async () => container.querySelector("button").click()); expect(access.refresh).toHaveBeenCalledTimes(1);
});
test("navigation reflects central page registry and displays CEO only when authorised", async () => {
  await render(<Sidebar menuAberto={false} setMenuAberto={() => {}} />);
  expect(container.querySelector('.sidebar-body a[href="/POS"]')).toBeNull();
  access.context = { ...access.context, platformAdmin: true, pages: [...access.context.pages, { page_key: "pos", path: "/POS", name: "Ponto de venda" }] };
  await render(<Sidebar menuAberto={false} setMenuAberto={() => {}} />);
  expect(container.querySelector('.sidebar-body a[href="/POS"]').textContent).toBe("Ponto de venda");
  expect(container.querySelector('.sidebar-body a[href="/ceo"]')).not.toBeNull();
});
test("CEO POS switch persists a scoped mutation and reloads actual server state", async () => {
  access.context.platformAdmin = true;
  ceoChange.mockImplementation(async (_, data) => { enabled = data.enabled; return { enabled }; });
  await render(adminRoute(), "/ceo/organizations/org1/modules");
  expect(container.querySelector('[aria-label="Autorizar POS"]').getAttribute("aria-checked")).toBe("false");
  await act(async () => container.querySelector('[aria-label="Autorizar POS"]').click());
  expect(ceoChange).toHaveBeenCalledWith("organization_feature", { organization_id: "org1", module_key: "pos", enabled: true });
  expect(container.querySelector('[aria-label="Autorizar POS"]').getAttribute("aria-checked")).toBe("true");
  expect(access.refresh).toHaveBeenCalled(); expect(container.textContent).toContain("registadas na auditoria");
});
test("rejected module mutation never reports success or optimistic access", async () => {
  access.context.platformAdmin = true; ceoChange.mockRejectedValue(new Error("Dependência desativada"));
  await render(adminRoute(), "/ceo/organizations/org1/modules");
  await act(async () => container.querySelector('[aria-label="Autorizar POS"]').click());
  expect(container.querySelector('[aria-label="Autorizar POS"]').getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector('[role="alert"]').textContent).toContain("Dependência desativada");
});
test("a previously authorised route closes after revocation", async () => {
  access.hasPage = () => true; await render(<FeatureRoute page="pos"><p>Authorised area</p></FeatureRoute>);
  expect(container.textContent).toContain("Authorised area");
  access.hasPage = () => false; await render(<FeatureRoute page="pos"><p>Authorised area</p></FeatureRoute>);
  expect(container.textContent).not.toContain("Authorised area"); expect(container.textContent).toContain("Acesso restrito");
});
