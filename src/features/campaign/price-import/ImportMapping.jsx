import React from "react";
import { headerLabels } from "../../../shared/campaign-price-import/model";

export default function ImportMapping({ sheets, sheetIndex, onSheet, mapping, onMapping, confirmed, onConfirmed }) {
  const sheet = sheets[sheetIndex];
  const labels = headerLabels(sheet, mapping.headerRow);
  const columns = labels.map((label, index) => <option key={index} value={index}>{index + 1}. {label.slice(0,100)}</option>);
  return <>
    <div className="price-import-fields">
      <label>Folha<select value={sheetIndex} onChange={e => onSheet(Number(e.target.value))}>{sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select></label>
      <label>Linha dos títulos<select value={mapping.headerRow} onChange={e => onMapping({ headerRow: Number(e.target.value), codeColumn: -1, priceColumn: -1 })}><option value={-1}>Sem títulos (começa na linha 1)</option>{sheet.rows.slice(0,40).map((row,i)=><option key={i} value={i}>{i+1}. {row.slice(0,4).map(c=>c.text).join(" · ").slice(0,90)}</option>)}</select></label>
      <label>Linha dos títulos (número exato)<input type="number" min="0" max={sheet.rows.length} value={mapping.headerRow + 1} onChange={e => onMapping({ headerRow: Number(e.target.value) - 1, codeColumn: -1, priceColumn: -1, originalColumn: -1 })} /></label>
      <label>Código do artigo<select value={mapping.codeColumn} onChange={e => onMapping({ codeColumn: Number(e.target.value) })}><option value={-1}>Escolher coluna</option>{columns}</select></label>
      <label>PVP2 Atual / PVP2PROMO<select value={mapping.priceColumn} onChange={e => onMapping({ priceColumn: Number(e.target.value) })}><option value={-1}>Escolher coluna promocional</option>{columns}</select></label>
      <label>PVP2 na tabela (comparação opcional)<select value={mapping.originalColumn ?? -1} onChange={e => onMapping({ originalColumn: Number(e.target.value) })}><option value={-1}>Sem comparação</option>{columns}</select></label>
    </div>
    <p className="price-import-note">PVP2 Antes vem sempre do catálogo da organização. O PVP2 da tabela serve apenas para assinalar divergências; nenhuma coluna altera os artigos.</p>
    <div className="price-import-table-wrap"><table className="price-import-table"><caption>Amostra da folha selecionada</caption><thead><tr>{labels.map((label,i)=><th key={i} className={i===mapping.priceColumn||i===mapping.codeColumn||i===mapping.originalColumn?"mapped":""}>{i+1}. {label}</th>)}</tr></thead><tbody>{sheet.rows.slice(mapping.headerRow+1,mapping.headerRow+6).map((row,i)=><tr key={i}>{labels.map((_,c)=><td key={c}>{row[c]?.text || "—"}</td>)}</tr>)}</tbody></table></div>
    <label className="price-import-confirm-column"><input type="checkbox" checked={confirmed} onChange={e=>onConfirmed(e.target.checked)} /> Confirmei as colunas das folhas selecionadas: PVP2PROMO (ou equivalente) é o PVP2 Atual da campanha; PVP2 Antes vem do catálogo.</label>
  </>;
}
