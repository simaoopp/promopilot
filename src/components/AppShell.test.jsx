import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import AppLoading from "./AppLoading";

jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "qa", email: "qa@example.test" }, profile: { first_name: "Teste", store: "Loja de teste", role: "store_user" } }) }));
jest.mock("./admin/ArticleDatabaseSyncPanel", () => () => null);
jest.mock("./admin/UserManagementPanel", () => () => null);

let container, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function Harness() { const [open, setOpen] = useState(false); const { pathname } = useLocation(); return <><Sidebar menuAberto={open} setMenuAberto={setOpen} /><output>{pathname}</output></>; }
async function renderShell() { await act(async () => root.render(<MemoryRouter initialEntries={["/EtiquetasCampanha"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Harness /></MemoryRouter>)); }

test("loading is accessible and has no raster logo or invented percentage", async () => { await act(async () => root.render(<AppLoading />)); expect(container.querySelector('[role="status"]').getAttribute("aria-busy")).toBe("true"); expect(container.querySelector("img")).toBeNull(); expect(container.textContent).not.toContain("%"); });
test("topbar brand navigates to the workspace homepage", async () => { await renderShell(); const logo = container.querySelector('.topbar-site .pp-brand-home-link'); expect(logo.getAttribute("href")).toBe("/Homepage"); await act(async () => logo.click()); expect(container.querySelector("output").textContent).toBe("/Homepage"); });
test("drawer focuses close button, traps Tab and restores focus on Escape", async () => { await renderShell(); const trigger = container.querySelector('.menu-button'); trigger.focus(); await act(async () => trigger.click()); const drawer = container.querySelector('#sidebar-navigation'); expect(drawer.hasAttribute("inert")).toBe(false); expect(document.activeElement).toBe(drawer.querySelector('.close-sidebar')); const links = drawer.querySelectorAll('a[href],button:not([disabled])'); links[links.length - 1].focus(); await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab',bubbles:true,cancelable:true}))); expect(document.activeElement).toBe(links[0]); await act(async () => window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))); expect(drawer.hasAttribute('inert')).toBe(true); expect(document.activeElement).toBe(trigger); expect(document.body.style.overflow).toBe(''); });
test("account control exposes expanded state and closes on Escape", async () => { await renderShell(); const button=container.querySelector('.topbar-account-button'); await act(async () => button.click()); expect(button.getAttribute('aria-expanded')).toBe('true'); container.querySelector('.topbar-account-menu-item').focus(); await act(async () => window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))); expect(button.getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(button); });
