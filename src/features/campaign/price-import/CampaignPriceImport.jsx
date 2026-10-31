import React, { lazy, Suspense, useCallback, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../components/ToastProvider";
import { addCampaignToHistory, createCampaignSnapshot } from "../../../utils/campaignHistory";
import { mergeImportedItems } from "../../../shared/campaign-price-import/model";
import { getAccessCacheScope } from "../../../services/platformService";
import "./CampaignPriceImport.css";

const Dialog = lazy(() => import("./CampaignPriceImportDialog"));

// Shared by both pages. A successful confirmation persists a campaign snapshot;
// it does not depend on the user printing labels to save the imported prices.
export default function CampaignPriceImport({ mode, items, onItems, title, year, format, dates, initialSource, onSourceConsumed }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => { setOpen(false); onSourceConsumed?.(null); }, [onSourceConsumed]);
  const apply = async (incoming, batch) => {
    const scope = getAccessCacheScope();
    const merged = mergeImportedItems(items, dates ? incoming.map(item => ({
      ...item, dataInicio: dates.dataInicio || "", dataFim: dates.dataFim || "",
    })) : incoming);
    const snapshot = createCampaignSnapshot({
      titulo: title, dados: merged, anoValidade: year, formatoEtiqueta: format,
      origem: mode, createdBy: `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim(),
      createdByEmail: user?.email || "", store: batch.store, userId: user?.id || "",
    });
    // The same confirmed import has the same target after a lost response.
    snapshot.id = `camp-price-${batch.id}`;
    const saved = await addCampaignToHistory(snapshot, { cleanup: false });
    if (getAccessCacheScope() !== scope) return;
    onItems(saved.dados);
    toast.success(`${incoming.length} artigos guardados na campanha. O catálogo não foi alterado.`);
  };
  if (process.env.REACT_APP_CAMPAIGN_PRICE_IMPORT_ENABLED === "0") return null;
  return <section className="price-import-launcher" aria-label="Importação de preços de fornecedor">
    <div><strong>Importar preços de fornecedor</strong><p>Escolha a tabela, reveja o PVP2 e guarde na campanha.</p></div>
    <button type="button" className="btn btn-primary" disabled={!profile?.store || !user?.id} onClick={() => setOpen(true)}>Importar tabela</button>
    {(open || initialSource) && <Suspense fallback={<p role="status">A abrir importador…</p>}><Dialog key={`${user?.id}:${profile?.store}`} mode={mode} store={profile.store} items={items} initialSource={initialSource} onApply={apply} onClose={close} /></Suspense>}
  </section>;
}
