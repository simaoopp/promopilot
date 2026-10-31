import React, { lazy, Suspense, useCallback, useState } from "react";
import "./campaignImport.css";
const CampaignImportDialog = lazy(() => import("./CampaignImportDialog"));
export default function CampaignImportLauncher({ existing, onAdd }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <div className="ci-launcher">
        <div>
          <strong>Da tabela do fornecedor à campanha</strong>
          <span>
            Associe as colunas, confirme os preços e guarde o formato para a
            próxima vez.
          </span>
        </div>
        <button
          type="button"
          className="ci-button ci-primary"
          onClick={() => setOpen(true)}
        >
          Importar tabela comercial <span aria-hidden="true">↗</span>
        </button>
      </div>
      {open && (
        <Suspense
          fallback={
            <div className="ci-loading" role="status">
              A abrir importador…
            </div>
          }
        >
          <CampaignImportDialog
            existing={existing}
            onAdd={onAdd}
            onClose={close}
          />
        </Suspense>
      )}
    </>
  );
}
