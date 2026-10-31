import React, { useState } from "react";
import { money, priceInCents, priceState } from "../../../shared/campaign-price-import/model";

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

export default function ImportReview({ batch, edits, onEdit, existingCodes, disabled }) {
  const [page, setPage] = useState(0);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const rows = batch.rows.filter(row => !onlyProblems || reviewRow(row, edits[row.id], existingCodes).error);
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  return <>
    <div className="price-import-review-tools">
      <label><input type="checkbox" checked={onlyProblems} onChange={e => { setOnlyProblems(e.target.checked); setPage(0); }} /> Só linhas pendentes</label>
      <span>Snapshot do catálogo: {new Date(batch.capturedAt).toLocaleString("pt-PT")}</span>
    </div>
    <div className="price-import-table-wrap"><table className="price-import-table">
      <caption>Reveja os preços. PVP2 Antes é fixo; apenas PVP2 Atual pode ser corrigido.</caption>
      <thead><tr><th scope="col">Incluir</th><th scope="col">Artigo / descrição</th><th scope="col">PVP2 Antes</th><th scope="col">PVP2 Atual</th><th scope="col">Diferença</th><th scope="col">Estado</th></tr></thead>
      <tbody>{rows.slice(currentPage * 50, currentPage * 50 + 50).map(row => {
        const edit = edits[row.id] || {};
        const review = reviewRow(row, edit, existingCodes);
        return <tr key={row.id}>
          <td><input type="checkbox" aria-label={`Incluir ${row.code || `linha ${row.line}`}`} checked={Boolean(edit.selected)} disabled={disabled || Boolean(review.error)} onChange={e => onEdit(row.id, { selected: e.target.checked })} /></td>
          <td><strong>{row.code || "Sem código"}</strong><span className="price-import-description">{row.description || "—"}</span><small>Linha {row.line}</small>
            <details><summary>Origem</summary><p>Código: {row.rawCode || "—"}<br />Preço: {row.rawPrice || "—"}</p></details></td>
          <td>{money(row.beforeCents)}</td>
          <td><input inputMode="decimal" aria-label={`PVP2 Atual de ${row.code || row.line}`} value={edit.price ?? ""} disabled={disabled || Boolean(row.problem)} onChange={e => onEdit(row.id, { price: e.target.value, selected: false })} />
            {row.warning && <label className="price-import-warning"><input type="checkbox" checked={Boolean(edit.reviewed)} disabled={disabled} onChange={e => onEdit(row.id, { reviewed: e.target.checked, selected: false })} /> {row.warning} Valor revisto.</label>}</td>
          <td>{review.cents !== null && row.beforeCents !== null ? money(review.cents - row.beforeCents) : "—"}</td>
          <td><span className={`price-import-status ${review.state === "Promoção" ? "discount" : review.state === "Pendente" ? "pending" : "neutral"}`}>{review.state}</span>{review.error && <small className="price-import-warning">{review.error}</small>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    {!rows.length && <p>Não há linhas pendentes.</p>}
    <nav className="price-import-pagination" aria-label="Linhas da importação"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage + 1} de {pageCount} · {rows.length} linhas</span><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Seguinte</button></nav>
  </>;
}
