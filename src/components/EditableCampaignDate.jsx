import React from "react";
import {
  formatarDataCampanhaParaTabela,
  formatarDataInputParaDiaMes,
  obterDataInputCampanha,
} from "../utils/campaignDates";

export default function EditableCampaignDate({
  item,
  field,
  label,
  anoValidade,
  onChange,
}) {
  const value = item?.[field] || "";

  return (
    <div
      className="shopping-price-selector campaign-date-selector"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="shopping-price-selector__header">
        <span className="shopping-price-selector__label">{label}</span>
        <span className="shopping-price-selector__value">
          {formatarDataCampanhaParaTabela(value)}
        </span>
      </div>

      <input
        className="shopping-price-selector__input"
        type="date"
        value={obterDataInputCampanha(value, anoValidade)}
        onChange={(event) =>
          onChange(item.id, field, formatarDataInputParaDiaMes(event.target.value))
        }
      />
    </div>
  );
}
