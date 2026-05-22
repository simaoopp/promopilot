import { renderCampaignLabel } from "../../../components/campaign/CampaignLabel";
import { prepararItemPromocionalParaImpressao } from "../../../utils/promotionPricing";
import { EXCEL_FORMATS, obterClasseIndicadorShopping, obterTextoValidade } from "./excelCampaignUtils";

export default function ExcelCampaignPrintArea({ paginasA5, paginasA6, anoValidade, titulo, promocaoFontePreco }) {
  function renderEtiqueta(item, formatoAtual) {
    const mostrarIndicadorShopping = item.tipo_registo === EXCEL_FORMATS.SHOPPING;
    const itemImpressao = mostrarIndicadorShopping
      ? item
      : prepararItemPromocionalParaImpressao(item, promocaoFontePreco);

    return renderCampaignLabel(itemImpressao, formatoAtual, {
      titulo,
      textoValidade: obterTextoValidade(item, anoValidade, titulo),
      showShoppingIndicator: mostrarIndicadorShopping,
      shoppingIndicatorClass: mostrarIndicadorShopping
        ? obterClasseIndicadorShopping(item)
        : "",
    });
  }

  return (
    <div className="print-area">
      {paginasA6.map((pagina, pageIndex) => (
        <div key={`a6-${pageIndex}`} className="sheet sheet-a6">
          {pagina.map((item) => renderEtiqueta(item, "a6"))}
        </div>
      ))}

      {paginasA5.map((pagina, pageIndex) => (
        <div key={`a5-${pageIndex}`} className="sheet sheet-a5">
          {pagina.map((item) => renderEtiqueta(item, "a5"))}

          {pagina.length === 1 ? (
            <div className="label label-a5 label-vazia">
              <div className="label-inner"></div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
