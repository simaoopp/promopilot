import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CampaignImportDialog from "./CampaignImportDialog";
import { createImportApi } from "./importApi";
import { extractInWorker } from "./extractInWorker";
jest.mock("./importApi", () => ({ createImportApi: jest.fn() }));
jest.mock("./extractInWorker", () => ({ extractInWorker: jest.fn() }));
let host, root, request, session, onAdd, onClose;
const row = {
  row_index: 0,
  source_index: 1,
  raw: ["00125", "Produto", "299,99"],
  flags: [],
  code: "00125",
  description: "Produto",
  article_id: "article-uuid",
  before_cents: 34999,
  promo_cents: 29999,
  promo_input: "299,99",
  saving_cents: 5000,
  discount_bps: 1429,
  state: "valid",
  match_state: "identified",
  start_date: "2026-11-01",
  end_date: "2026-11-30",
};
const click = async (label) => {
  const button = [...host.querySelectorAll("button")].find((b) =>
    b.textContent.includes(label),
  );
  expect(button).toBeTruthy();
  await act(async () => button.click());
};
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.TextEncoder = require("util").TextEncoder;
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: { randomUUID: () => "40000000-0000-4000-8000-000000000001" },
  });
  jest.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onAdd = jest.fn();
  onClose = jest.fn();
  session = {
    id: "40000000-0000-4000-8000-000000000001",
    organization_id: "org",
    state: "ready",
    version: 2,
    processed: 1,
    total_rows: 1,
    source: { hash: "hash" },
    config: {},
  };
  request = jest.fn(async (action, data) => {
    if (action === "templates" || action === "sessions") return { items: [] };
    if (action === "start")
      return {
        ...session,
        state: "processing",
        processed: 0,
        config: data.config,
      };
    if (action === "batch") return session;
    if (action === "read")
      return { session, counts: { valid: 1 }, rows: [row] };
    if (action === "finalize") return { ...session, state: "completed" };
    return session;
  });
  createImportApi.mockReturnValue(request);
  extractInWorker.mockResolvedValue({
    type: "csv",
    source: { name: "synthetic.csv", hash: "a".repeat(64) },
    sheets: [
      {
        name: "Tabela 1",
        flags: {},
        rows: [["SKU", "Descrição", "Promo"], row.raw],
      },
    ],
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(existing = []) {
  await act(async () =>
    root.render(
      <CampaignImportDialog
        existing={existing}
        onAdd={onAdd}
        onClose={onClose}
      />,
    ),
  );
}
async function upload() {
  const input = host.querySelector("input[type=file]");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["fixture"], "synthetic.csv")],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
}
async function mapping() {
  await upload();
  await click("Associar campos");
  const checkbox = [...host.querySelectorAll("input[type=checkbox]")].find(
    (n) => n.parentElement.textContent.includes("Confirmo"),
  );
  await act(async () => checkbox.click());
}
test("shared wizard: explicit mapping confirmation, server snapshot, review and explicit add", async () => {
  await mount();
  await upload();
  await click("Associar campos");
  await click("Obter preços");
  expect(host.textContent).toContain("Confirme");
  expect(request.mock.calls.some(([a]) => a === "start")).toBe(false);
  const checkbox = [...host.querySelectorAll("input[type=checkbox]")].find(
    (n) => n.parentElement.textContent.includes("Confirmo"),
  );
  await act(async () => checkbox.click());
  await click("Obter preços");
  expect(host.textContent).toContain("349,99");
  expect(host.textContent).toContain("14,29");
  expect(onAdd).not.toHaveBeenCalled();
  await click("Validar e continuar");
  await click("Adicionar 1 artigos");
  expect(onAdd).toHaveBeenCalledTimes(1);
  expect(onAdd.mock.calls[0][0][0]).toEqual(
    expect.objectContaining({
      article_id: "article-uuid",
      antes: 349.99,
      atual: 299.99,
      tipo_registo: "campanha",
    }),
  );
  expect(onClose).toHaveBeenCalledTimes(1);
});
test("transient batch failure retries same session and does not add twice", async () => {
  const original = request.getMockImplementation();
  let failed = false;
  request.mockImplementation(async (a, d) => {
    if (a === "batch" && !failed) {
      failed = true;
      throw new Error("Temporary failure");
    }
    return original(a, d);
  });
  await mount();
  await mapping();
  await click("Obter preços");
  expect(host.textContent).toContain("Temporary failure");
  await click("Obter preços");
  const starts = request.mock.calls.filter(([a]) => a === "start");
  expect(starts.length).toBe(2);
  expect(starts[0][1].id).toBe(starts[1][1].id);
  expect(host.textContent).toContain("Promoção válida");
  expect(onAdd).not.toHaveBeenCalled();
});
test("existing campaign items remain untouched and duplicate additions are disabled", async () => {
  await mount([{ codigo: "00125", antes: 10 }]);
  await mapping();
  await click("Obter preços");
  await click("Validar e continuar");
  expect(host.textContent).toContain("0 artigos prontos");
  const button = [...host.querySelectorAll("button")].find((b) =>
    b.textContent.includes("Adicionar 0 artigos"),
  );
  expect(button.disabled).toBe(true);
  expect(onAdd).not.toHaveBeenCalled();
});
test("tenant/logout change closes dialog and aborts pending scope", async () => {
  await mount();
  const signal = createImportApi.mock.calls[0][0];
  await act(async () =>
    window.dispatchEvent(new Event("promopilot:access-changed")),
  );
  expect(signal.aborted).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(1);
});
