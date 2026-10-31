// Local synthetic harness only; never imported by the production app.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import CampaignImportLauncher from "../../src/features/campaign/import/CampaignImportLauncher";
function Harness() {
  const [items, setItems] = useState([]);
  return (
    <main
      style={{
        fontFamily: "Arial,sans-serif",
        maxWidth: 1200,
        margin: "40px auto",
        padding: 20,
      }}
    >
      <h1>Campanha de teste</h1>
      <CampaignImportLauncher
        existing={items}
        onAdd={(next) => setItems((list) => [...list, ...next])}
      />
      <pre data-testid="campaign">{JSON.stringify(items, null, 2)}</pre>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<Harness />);
