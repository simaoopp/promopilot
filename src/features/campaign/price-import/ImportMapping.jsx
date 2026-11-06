import React, { useState } from "react";
import { detectSimpleColumns, headerLabels } from "../../../shared/campaign-price-import/model";

const FIELDS = [
  ["codeColumn", "Artigo", "Código do artigo", true],
  ["descriptionColumn", "Descrição", "Descrição", false],
  ["eanColumn", "EAN", "EAN", false],
  ["originalColumn", "PVP2 Antes", "PVP2 Antes (tabela)", true],
  ["priceColumn", "PVP2 Atual", "PVP2 Atual (tabela)", true],
  ["startColumn", "Data início", "Coluna da data de início", false],
  ["endColumn", "Data fim", "Coluna da data de fim", false],
  ["informationColumn", "Informação", "Informação / tipo de alteração", false],
];
const FIELD_KEYS = { codeColumn: "code", descriptionColumn: "description", eanColumn: "ean", originalColumn: "original", priceColumn: "promo", startColumn: "start", endColumn: "end", informationColumn: "information" };

export default function ImportMapping({ mode = "manual", sheets, sheetIndex, onSheet, mapping, onMapping }) {
  const [showManual, setShowManual] = useState(false);
  const sheet = sheets[sheetIndex];
  const labels = headerLabels(sheet, mapping.headerRow);
  const candidates = detectSimpleColumns(sheet, mapping.headerRow)?.candidates || {};
  const fieldsToResolve = FIELDS.filter(([key, , , required]) => (mapping[key] ?? -1) < 0 &&
    ((required && (key !== "originalColumn" || mode === "manual")) || candidates[FIELD_KEYS[key]]?.length > 1));
  const fields = showManual ? FIELDS : fieldsToResolve;
  return <>
    {sheets.length > 1 && <label>Rever folha<select value={sheetIndex} onChange={event => { setShowManual(false); onSheet(Number(event.target.value)); }}>{sheets.map((item, i) => <option key={i} value={i}>{item.name}</option>)}</select></label>}
    <h3>Tabela analisada</h3>
    <dl className="price-import-detection-summary">
      {FIELDS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{mapping[key] >= 0
        ? `Identificado: ${labels[mapping[key]]}` : candidates[FIELD_KEYS[key]]?.length > 1 ? "Confirmar coluna" : "Não encontrado"}</dd></div>)}
    </dl>
    {fieldsToResolve.length > 0 && <p className="price-import-note">Confirme apenas os campos por identificar. Os preços nunca são procurados noutra coluna ou no catálogo.</p>}
    <button type="button" onClick={() => setShowManual(value => !value)}>{showManual ? "Ocultar opções" : "Corrigir identificação"}</button>
    {showManual && <label>Linha dos títulos<select value={mapping.headerRow} onChange={event => {
      const headerRow = Number(event.target.value);
      onMapping(detectSimpleColumns(sheet, headerRow).mapping);
    }}><option value={-1}>Sem títulos (começa na linha 1)</option>{sheet.rows.map((row, i) => <option key={i} value={i}>{i + 1}. {row.slice(0, 4).map(cell => cell.text).join(" · ").slice(0, 90)}</option>)}</select></label>}
    <div className="price-import-fields">
      {fields.map(([key, , label]) => <label key={key}>{label}<select value={mapping[key] ?? -1} onChange={event => onMapping({ [key]: Number(event.target.value) })}>
        <option value={-1}>{key === "priceColumn" ? "Escolher coluna do novo preço" : "Não identificado / escolher coluna"}</option>
        {labels.map((text, i) => <option key={i} value={i}>{i + 1}. {text.slice(0, 100)}</option>)}
      </select></label>)}
    </div>
    <div className="price-import-table-wrap" role="region" aria-label="Amostra da tabela" tabIndex={0}><table className="price-import-table"><caption>Primeiras linhas da folha selecionada</caption><thead><tr>{labels.map((label, i) => <th key={i} className={i === mapping.priceColumn || i === mapping.originalColumn || i === mapping.codeColumn ? "mapped" : ""}>{label}</th>)}</tr></thead><tbody>{sheet.rows.slice(mapping.headerRow + 1, mapping.headerRow + 6).map((row, i) => <tr key={i}>{labels.map((_, col) => <td key={col}>{row[col]?.text || "—"}</td>)}</tr>)}</tbody></table></div>
  </>;
}
