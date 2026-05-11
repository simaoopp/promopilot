import { artigoElegivelComparacaoPvp3 } from "../../../utils/pvp3Promotion";
import { formatarEuro } from "../../../utils/formatters";
import { EXCEL_FORMATS } from "./excelCampaignUtils";

export default function ExcelInvalidItemsModal({
  aberto,
  modeloImportado,
  artigosInvalidosPopup,
  idsComparacaoPvp3Popup,
  selecionarTodosComparacaoPvp3Popup,
  desmarcarTodosComparacaoPvp3Popup,
  copiarCodigosInvalidosEProsseguir,
  fecharPopupEProsseguir,
  alternarComparacaoPvp3Popup,
}) {
  if (!aberto) return null;

  const isCampanha = modeloImportado === EXCEL_FORMATS.CAMPANHA;

  return (
    <div className="popup-overlay">
      <div className="popup-card">
        <div className="popup-header">
          <h2>Artigos com preço inválido</h2>
        </div>

        <p className="popup-text">
          {modeloImportado === EXCEL_FORMATS.SHOPPING
            ? "Os artigos abaixo foram selecionados para impressão, mas têm o preço sem promoção menor ou igual ao preço com promoção."
            : "Os artigos abaixo foram selecionados para impressão, mas têm o PVP2 atual maior ou igual ao PVP2 antes. Quando o PVP atual for inferior ao PVP3, podes selecionar o artigo para impressão com a comparação PVP atual/PVP3. Os artigos selecionados nessa comparação não entram no botão “Copiar código”."}
        </p>

        <div className="popup-actions">
          {isCampanha ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={selecionarTodosComparacaoPvp3Popup}>
                Selecionar todos
              </button>

              <button type="button" className="btn btn-secondary" onClick={desmarcarTodosComparacaoPvp3Popup}>
                Desmarcar todos
              </button>
            </>
          ) : null}

          <button type="button" className="btn btn-primary" onClick={copiarCodigosInvalidosEProsseguir}>
            Copiar código
          </button>

          <button type="button" className="btn btn-secondary" onClick={fecharPopupEProsseguir}>
            Fechar e prosseguir
          </button>
        </div>

        <div className="popup-table-wrap">
          <table>
            <thead>
              <tr>
                {isCampanha ? <th>Imprimir PVP atual/PVP3</th> : null}
                <th>Código</th>
                <th>Designação</th>
                <th>{modeloImportado === EXCEL_FORMATS.SHOPPING ? "Preço sem promoção" : "PVP2 Antes"}</th>
                <th>{modeloImportado === EXCEL_FORMATS.SHOPPING ? "Preço promoção" : "PVP2 Atual"}</th>
                {isCampanha ? <th>PVP3</th> : null}
              </tr>
            </thead>

            <tbody>
              {artigosInvalidosPopup.map((item) => {
                const elegivelPvp3 = artigoElegivelComparacaoPvp3(item);

                return (
                  <tr
                    key={item.id}
                    className={idsComparacaoPvp3Popup.has(item.id) ? "linha-selecionada" : ""}
                    onClick={isCampanha ? () => alternarComparacaoPvp3Popup(item) : undefined}
                    title={
                      isCampanha
                        ? elegivelPvp3
                          ? "Selecionar para impressão PVP atual/PVP3"
                          : "Artigo não elegível para comparação PVP3"
                        : undefined
                    }
                  >
                    {isCampanha ? (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={idsComparacaoPvp3Popup.has(item.id)}
                          disabled={!elegivelPvp3}
                          aria-label={`Selecionar ${item.codigo} para impressão por PVP3`}
                          onChange={() => alternarComparacaoPvp3Popup(item)}
                        />
                      </td>
                    ) : null}
                    <td>{item.codigo}</td>
                    <td>{item.descricao}</td>
                    <td>{formatarEuro(item.antes)}€</td>
                    <td>{formatarEuro(item.atual)}€</td>
                    {isCampanha ? (
                      <td>
                        {item.pv3 ? `${formatarEuro(item.pv3)}€` : "-"}
                        {!elegivelPvp3 ? " · não elegível" : ""}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
