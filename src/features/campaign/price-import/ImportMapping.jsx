import React, { useState } from "react";
import { headerLabels } from "../../../shared/campaign-price-import/model";

export default function ImportMapping({ mode = "excel", sheets, sheetIndex, onSheet, mapping, autoDetected, onMapping, confirmed, onConfirmed }) {
  const [showManual, setShowManual] = useState(false);
  const sheet = sheets[sheetIndex];
  const labels = headerLabels(sheet, mapping.headerRow);
  const columns = labels.map((label, index) => <option key={index} value={index}>{index + 1}. {label.slice(0,100)}</option>);
  const missingPrevious = mode === "manual" && !(Number.isInteger(mapping.originalColumn) && mapping.originalColumn >= 0);
  return <>
    <label>Folha da tabela<select value={sheetIndex} onChange={e=>onSheet(Number(e.target.value))}>{sheets.map((item,i)=><option key={i} value={i}>{item.name}</option>)}</select></label>
    {autoDetected && !showManual && !missingPrevious && <p className="price-import-note" role="status">✓ Código do artigo e os preços da tabela identificados. Confirme as colunas e continue.</p>}
    {(showManual || !autoDetected || missingPrevious) && <div className="price-import-fields">
      <label>Linha dos títulos<select value={mapping.headerRow} onChange={e => onMapping({ headerRow: Number(e.target.value), codeColumn: -1, priceColumn: -1, originalColumn: -1, descriptionColumn: -1, eanColumn: -1, warehouseColumns: {} })}><option value={-1}>Sem títulos (começa na linha 1)</option>{sheet.rows.map((row,i)=><option key={i} value={i}>{i+1}. {row.slice(0,4).map(c=>c.text).join(" · ").slice(0,90)}</option>)}</select></label>
      <label>Código do artigo<select value={mapping.codeColumn} onChange={e => onMapping({ codeColumn: Number(e.target.value) })}><option value={-1}>Escolher coluna</option>{columns}</select></label>
      <label>PVP2 Atual (tabela)<select value={mapping.priceColumn} onChange={e => onMapping({ priceColumn: Number(e.target.value) })}><option value={-1}>Escolher coluna do novo preço</option>{columns}</select></label>
      <label>PVP2 Antes (tabela{mode === "manual" ? ", obrigatório" : ", opcional"})<select value={mapping.originalColumn ?? -1} onChange={e => onMapping({ originalColumn: Number(e.target.value) })}><option value={-1}>Sem preço anterior na tabela</option>{columns}</select></label>
    </div>}
    {autoDetected && <button type="button" className="ci-button" onClick={() => setShowManual(value => !value)}>{showManual ? "Ocultar opções" : "Corrigir identificação"}</button>}
    <p className="price-import-note">{mode === "manual" ? "Na campanha manual, os dois preços são retirados exclusivamente da tabela. Nenhum PVP2 é importado do catálogo. Se faltar o PVP2 Antes ou o PVP2 Atual, o artigo fica pendente e não pode ser incluído." : "Na campanha Excel, o PVP2 Antes é o do catálogo; o valor da tabela é mostrado para comparação."} Descrição e EAN são confirmados no catálogo quando necessário. Armazéns AF, A1, A1E, AE, AEA, A10 e AEV são lidos da tabela apenas para filtros.</p>
    <div className="price-import-table-wrap"><table className="price-import-table"><caption>Amostra da folha selecionada</caption><thead><tr>{labels.map((label,i)=><th key={i} className={i===mapping.priceColumn||i===mapping.codeColumn?"mapped":""}>{i+1}. {label}</th>)}</tr></thead><tbody>{sheet.rows.slice(mapping.headerRow+1,mapping.headerRow+6).map((row,i)=><tr key={i}>{labels.map((_,c)=><td key={c}>{row[c]?.text || "—"}</td>)}</tr>)}</tbody></table></div>
    <label className="price-import-confirm-column"><input type="checkbox" checked={confirmed} disabled={missingPrevious} onChange={e=>onConfirmed(e.target.checked)} /> {mode === "manual" ? "Confirmo que PVP2 Antes e PVP2 Atual são as duas colunas de preços da tabela, em euros." : "Confirmo que a coluna escolhida contém o novo preço de campanha, em euros."}{missingPrevious && <small className="price-import-warning">Selecione a coluna PVP2 Antes para continuar. Não existe preenchimento automático pelo catálogo.</small>}</label>
  </>;
}
