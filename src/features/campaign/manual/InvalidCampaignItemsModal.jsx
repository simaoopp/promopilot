import { artigoElegivelComparacaoPvp3 } from "../../../utils/pvp3Promotion";
import { formatarEuro } from "../../../utils/formatters";

export default function InvalidCampaignItemsModal({
  aberto,
  artigosInvalidosPopup,
  idsComparacaoPvp3Popup,
  selecionarTodosComparacaoPvp3Popup,
  desmarcarTodosComparacaoPvp3Popup,
  copiarCodigosInvalidosEProsseguir,
  fecharPopupEProsseguir,
  alternarComparacaoPvp3Popup,
}) {
  if (!aberto) return null;

  return (
    <div className="popup-overlay">
      <div className="popup-card">
        <div className="popup-header">
          <h2>Artigos com preço superior</h2>
        </div>

        <p className="popup-text">
          Os artigos abaixo foram selecionados para impressão, mas têm o PVP2 anterior menor ou igual ao PVP2 atual. Quando o PVP atual for inferior ao PVP3, podes selecionar o artigo para impressão com a comparação PVP atual/PVP3. Os artigos selecionados nessa comparação não entram no botão “Copiar código”.
        </p>

        <div className="popup-actions">
          <button type="button" className="btn btn-secondary" onClick={selecionarTodosComparacaoPvp3Popup}>
            Selecionar todos
          </button>

          <button type="button" className="btn btn-secondary" onClick={desmarcarTodosComparacaoPvp3Popup}>
            Desmarcar todos
          </button>

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
                <th>Imprimir PVP atual/PVP3</th>
                <th>Código</th>
                <th>Designação</th>
                <th>PVP2 Antes</th>
                <th>PVP2 Atual</th>
                <th>PVP3</th>
              </tr>
            </thead>

            <tbody>
              {artigosInvalidosPopup.map((item) => {
                const elegivelPvp3 = artigoElegivelComparacaoPvp3(item);

                return (
                  <tr
                    key={item.id}
                    className={idsComparacaoPvp3Popup.has(item.id) ? "linha-selecionada" : ""}
                    onClick={() => alternarComparacaoPvp3Popup(item)}
                    title={
                      elegivelPvp3
                        ? "Selecionar para impressão PVP atual/PVP3"
                        : "Artigo não elegível para comparação PVP3"
                    }
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={idsComparacaoPvp3Popup.has(item.id)}
                        disabled={!elegivelPvp3}
                        aria-label={`Selecionar ${item.codigo} para impressão por PVP3`}
                        onChange={() => alternarComparacaoPvp3Popup(item)}
                      />
                    </td>
                    <td>{item.codigo}</td>
                    <td>{item.descricao}</td>
                    <td>{formatarEuro(item.antes)}€</td>
                    <td>{formatarEuro(item.atual)}€</td>
                    <td>
                      {item.pv3 ? `${formatarEuro(item.pv3)}€` : "-"}
                      {!elegivelPvp3 ? " · não elegível" : ""}
                    </td>
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
