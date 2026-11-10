import React, { act } from "react";
import { createRoot } from "react-dom/client";
import DossierErrorBoundary from "./DossierErrorBoundary";
test("a render failure offers recovery without reloading the application", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = jest.spyOn(console, "error").mockImplementation(() => {}), warnings = jest.spyOn(console, "warn").mockImplementation(() => {});
  const host = document.createElement("div"), root = createRoot(host); let broken = true;
  function Child() { if (broken) throw new Error("sensitive internal details"); return <p>Rascunho recuperado</p>; }
  try {
    await act(async () => root.render(<DossierErrorBoundary><Child /></DossierErrorBoundary>));
    expect(host.textContent).toContain("Recuperar dossier"); expect(host.textContent).not.toContain("sensitive");
    expect(JSON.stringify(warnings.mock.calls)).not.toContain("sensitive");
    broken = false; await act(async () => host.querySelector("button").click());
    expect(host.textContent).toBe("Rascunho recuperado");
  } finally { await act(async () => root.unmount()); errors.mockRestore(); warnings.mockRestore(); }
});
