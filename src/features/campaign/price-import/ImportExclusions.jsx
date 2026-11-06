import React, { useState } from "react";
import { excludedCodes } from "../../../shared/campaign-price-import/tableSections";

export default function ImportExclusions({ rows }) {
  const [message, setMessage] = useState("");
  const codes = excludedCodes(rows);
  if (!rows.length) return null;
  async function copy() {
    try { await navigator.clipboard.writeText(codes); setMessage("Códigos copiados."); }
    catch { setMessage("Não foi possível copiar automaticamente. Selecione e copie a linha abaixo."); }
  }
  return <section className="price-import-exclusions" aria-label="Artigos excluídos">
    <h3>{rows.length} linhas excluídas por atualização/reposição de PVP</h3>
    <p>{codes ? codes.split("|").length : 0} códigos únicos. Estes artigos não serão adicionados à campanha.</p>
    <label>Códigos excluídos<input readOnly value={codes} onFocus={event => event.target.select()} /></label>
    <button type="button" disabled={!codes} onClick={copy}>Copiar códigos excluídos</button>
    {message && <p role="status">{message}</p>}
    <details><summary>Ver artigos excluídos</summary><div className="price-import-excluded-list">{rows.map(row => <p key={`${row.sourceSheet}:${row.line}`}><strong>{row.code || "Sem código"}</strong> · {row.extra.description || "—"} · {row.reason} ({row.sourceSheet}, linha {row.sourceLine || row.line})</p>)}</div></details>
  </section>;
}
