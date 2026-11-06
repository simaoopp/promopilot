import React from "react";

export default function ImportDates({ analysis, period, onChange, allowNoDates, disabled }) {
  if (allowNoDates) return <p className="price-import-note">Este tipo de campanha não utiliza datas de validade.</p>;
  return <section className="price-import-date-panel" aria-label="Datas da campanha">
    <h3>Datas da campanha</h3>
    {analysis.perItem && <p>Foram encontrados períodos diferentes por artigo. As datas de cada linha são preservadas.</p>}
    {analysis.datedRows > 0 && !analysis.perItem && <p>{analysis.datedRows} artigos com datas na tabela.</p>}
    {analysis.conflict && !period.resolved && <div className="price-import-discrepancy" role="alert">
      <strong>Foram encontradas datas diferentes.</strong>
      <p>Inícios: {analysis.candidates.starts.join(" · ") || "—"}<br/>Fins: {analysis.candidates.ends.join(" · ") || "—"}</p>
      <p>Reveja os campos e as datas por artigo. As datas já introduzidas na campanha mantêm-se.</p>
      <button type="button" disabled={disabled} onClick={() => onChange({ resolved: true })}>Confirmar as datas apresentadas</button>
    </div>}
    {!analysis.datedRows && !period.start && !period.end && <p>Não foi encontrado um período inequívoco. Preencha as datas para continuar.</p>}
    <div className="price-import-fields">
      <label>Data de início<input type="date" value={period.start} disabled={disabled} onChange={event => onChange({ start: event.target.value })} /></label>
      <label>Data de fim<input type="date" value={period.end} disabled={disabled} onChange={event => onChange({ end: event.target.value })} /></label>
    </div>
    <p className="price-import-date-help">Este período preenche as linhas sem datas. Pode corrigir as datas de cada artigo na revisão.</p>
    {analysis.datedRows > 0 && <label><input type="checkbox" checked={Boolean(period.overrideRows)} disabled={disabled} onChange={event => onChange({ overrideRows: event.target.checked })} /> Aplicar este período a todos os artigos, substituindo as datas da tabela</label>}
    {period.start && period.end && period.end < period.start && <p role="alert" className="price-import-warning">A data de fim não pode ser anterior à data de início.</p>}
  </section>;
}
