import { formatarValorTabelaMoeda, obterOpcoesSelectShopping } from "./excelCampaignUtils";

export default function ShoppingPriceSelector({ item, tipo, atualizarPrecoShopping }) {
  const isSemDesconto = tipo === "semDesconto";
  const fonteAtual = isSemDesconto
    ? item.precoSemDescontoFonte
    : item.precoComDescontoFonte;
  const valorManual = isSemDesconto
    ? item.precoSemDescontoManual
    : item.precoComDescontoManual;
  const valorSelecionado = isSemDesconto ? item.antes : item.atual;
  const opcoesSelect = obterOpcoesSelectShopping(item);

  return (
    <div className="shopping-price-selector" onClick={(e) => e.stopPropagation()}>
      <div className="shopping-price-selector__header">
        <span className="shopping-price-selector__label">
          {isSemDesconto ? "Sem promoção" : "Com promoção"}
        </span>

        <span className="shopping-price-selector__value">
          {formatarValorTabelaMoeda(valorSelecionado)}
        </span>
      </div>

      <select
        className="shopping-price-selector__select"
        value={fonteAtual}
        onChange={(e) =>
          atualizarPrecoShopping(item.id, {
            [isSemDesconto ? "precoSemDescontoFonte" : "precoComDescontoFonte"]: e.target.value,
          })
        }
      >
        {opcoesSelect.map((option) => (
          <option key={option.value} value={option.value}>
            {option.optionLabel}
          </option>
        ))}
      </select>

      {fonteAtual === "manual" ? (
        <input
          className="shopping-price-selector__input"
          type="text"
          inputMode="decimal"
          value={valorManual}
          placeholder="Outro valor: 0,00"
          onChange={(e) =>
            atualizarPrecoShopping(item.id, {
              [isSemDesconto ? "precoSemDescontoManual" : "precoComDescontoManual"]: e.target.value,
            })
          }
        />
      ) : null}
    </div>
  );
}
