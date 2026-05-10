import { renderCampaignLabel } from "../../../components/campaign/CampaignLabel";
import { obterTextoValidade } from "./manualCampaignUtils";

export default function ManualCampaignPrintArea({
  modoFormatoAutomatico,
  formatoEtiqueta,
  paginasImpressao,
  titulo,
  anoValidade,
}) {
  return (
    <div
      className={`print-area ${
        modoFormatoAutomatico ? "formato-auto" : `formato-${formatoEtiqueta}`
      }`}
    >
      {paginasImpressao.map((pagina, pageIndex) => (
        <div
          key={pageIndex}
          className={`sheet ${pagina.layout === "a5" ? "sheet-a5" : "sheet-a6"}`}
        >
          {pagina.items.map((item) =>
            renderCampaignLabel(item, pagina.layout, {
              titulo,
              textoValidade: obterTextoValidade(item, anoValidade, titulo),
            }),
          )}

          {pagina.layout === "a5" && pagina.items.length === 1 ? (
            <div className="label label-a5 label-vazia">
              <div className="label-inner" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
