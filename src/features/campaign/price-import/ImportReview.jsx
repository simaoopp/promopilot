import React, { useState } from "react";
import { money, priceInCents, priceState, sourceComparison } from "../../../shared/campaign-price-import/model";

const PROBLEMS = {
  not_found: "Artigo não encontrado nesta organização.",
  ambiguous: "Correspondência ambígua. Reveja o código com o administrador.",
  duplicate: "Código repetido na tabela. Corrija a origem ou exclua estas linhas.",
  missing_code: "Código em falta ou não fiável. Corrija a origem ou a coluna escolhida.",
  invalid_catalog_price: "O PVP2 do catálogo não é válido. Não pode ser substituído pela tabela.",
};
export function reviewRow(row, edit, existingCodes) {
  const cents = priceInCents(edit?.price ?? "");
  const error = PROBLEMS[row.problem] || (existingCodes.has(row.code) ? "Este artigo já está na campanha." :
    cents === null ? "Introduza um preço válido, com até duas casas decimais." :
      row.warning && !edit?.reviewed ? "Confirme a revisão do valor original." : "");
  return { cents, error, state: error ? "Pendente" : priceState(row.beforeCents, cents) };
}

export default function ImportReview({ batch, edits, originalsByLine = new Map(), onEdit, existingCodes, disabled }) {
  const [page, setPage] = useState(0);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const rows = batch.rows.filter(row => !onlyProblems || reviewRow(row, edits[row.id], existingCodes).error);
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const mismatchCount = batch.rows.filter(row => sourceComparison(row, originalsByLine.get(Number(row.line)), row.currentCents).differs).length;
  return <>
    <div className="price-import-review-tools">
      <label><input type="checkbox" checked={onlyProblems} onChange={e => { setOnlyProblems(e.target.checked); setPage(0); }} /> Mostrar apenas pendentes</label>
      <span>Catálogo consultado: {new Date(batch.capturedAt).toLocaleString("pt-PT")}</span>
    </div>
    {mismatchCount > 0 && <p className="price-import-discrepancy" role="status">
      <strong>{mismatchCount} {mismatchCount === 1 ? "artigo tem" : "artigos têm"} preços anteriores diferentes.</strong>{" "}
      A tabela e o catálogo não indicam o mesmo PVP2 Antes. O estado da campanha é calculado em relação ao catálogo; confirme cada divergência antes de incluir.
    </p>}
    <div className="price-import-table-wrap" role="region" aria-label="Tabela de revisão dos artigos" tabIndex={0}>
      <table className="price-import-table price-import-review-table">
        <caption>PVP2 Antes é o preço do catálogo. Os valores «Na tabela» servem para conferir a origem e não alteram o catálogo.</caption>
        <colgroup><col className="price-import-col-include"/><col className="price-import-col-product"/><col className="price-import-col-before"/><col className="price-import-col-current"/><col className="price-import-col-delta"/><col className="price-import-col-status"/></colgroup>
        <thead><tr>
          <th scope="col">Incluir</th>
          <th scope="col">Artigo e descrição</th>
          <th scope="col">PVP2 Antes <small>Catálogo</small></th>
          <th scope="col">PVP2 Atual <small>Tabela</small></th>
          <th scope="col">Diferença <small>Face ao catálogo</small></th>
          <th scope="col">Estado</th>
        </tr></thead>
        <tbody>{rows.slice(currentPage * 50, currentPage * 50 + 50).map(row => {
          const edit = edits[row.id] || {};
          const review = reviewRow(row, edit, existingCodes);
          const original = originalsByLine.get(Number(row.line));
          const comparison = sourceComparison(row, original, review.cents);
          const status = review.state === "Aumento" ? "Aumento vs catálogo" : review.state;
          return <tr key={row.id} className={comparison.differs ? "price-import-row-discrepancy" : ""}>
            <td className="price-import-cell-include"><input type="checkbox" aria-label={`Incluir ${row.code || `linha ${row.line}`}`} checked={Boolean(edit.selected)} disabled={disabled || Boolean(review.error)} onChange={e => onEdit(row.id, { selected: e.target.checked })} /></td>
            <td className="price-import-cell-product">
              <strong className="price-import-code">{row.code || "Sem código"}</strong>
              <span className="price-import-description">{row.description || "—"}</span>
              <small className="price-import-source">{row.sourceSheet ? `${row.sourceSheet} · linha ${row.sourceLine || row.line}` : `Tabela · linha ${row.line}`}</small>
              <details className="price-import-raw-details"><summary>Ver informação original</summary><p>Código: {row.rawCode || "—"}<br/>PVP2 Atual: {row.rawPrice || "—"}{original?.raw ? <> <br/>PVP2 Antes: {original.raw}</> : null}</p></details>
            </td>
            <td className="price-import-cell-money">
              <strong className="price-import-amount">{money(row.beforeCents)}</strong>
              {original?.raw && <small className={`price-import-source-price ${comparison.differs ? "price-import-price-differs" : ""}`}>
                Na tabela: {Number.isInteger(original.cents) ? money(original.cents) : original.raw}
              </small>}
            </td>
            <td className="price-import-cell-edit">
              <div className="price-import-price-editor"><input inputMode="decimal" aria-label={`PVP2 Atual de ${row.code || row.line}`} value={edit.price ?? ""} disabled={disabled || Boolean(row.problem)} onChange={e => onEdit(row.id, { price: e.target.value, selected: false })} /><span aria-hidden="true">€</span></div>
              {row.warning && <label className="price-import-warning"><input type="checkbox" checked={Boolean(edit.reviewed)} disabled={disabled} onChange={e => onEdit(row.id, { reviewed: e.target.checked, selected: false })} /> Confirmei a divergência. {row.warning}</label>}
            </td>
            <td className="price-import-cell-money">
              <strong className={`price-import-amount ${comparison.catalogDelta !== null && comparison.catalogDelta < 0 ? "price-import-discount-value" : comparison.catalogDelta > 0 ? "price-import-increase-value" : ""}`}>
                {comparison.catalogDelta !== null ? money(comparison.catalogDelta) : "—"}
              </strong>
              {comparison.differs && comparison.sourceDelta !== null && <small className="price-import-source-price">Na tabela: {money(comparison.sourceDelta)}</small>}
            </td>
            <td className="price-import-cell-status">
              <span className={`price-import-status ${review.state === "Promoção" ? "discount" : review.state === "Pendente" ? "pending" : review.state === "Aumento" ? "increase" : "neutral"}`}>{status}</span>
              {comparison.differs && comparison.sourceDelta !== null && <small className="price-import-source-price">Na tabela: {priceState(original.cents, review.cents)}</small>}
              {comparison.contradicts && <small className="price-import-warning">A variação na tabela é diferente da comparação com o catálogo.</small>}
              {review.error && <small className="price-import-warning">{review.error}</small>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!rows.length && <p>Não há linhas {onlyProblems ? "pendentes" : "para rever"}.</p>}
    <nav className="price-import-pagination" aria-label="Linhas da importação"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage + 1} de {pageCount} · {rows.length} linhas</span><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Seguinte</button></nav>
  </>;
}
