import React, { useEffect, useMemo, useRef, useState } from "react";
import { createImportApi } from "./importApi";
import { extractInWorker } from "./extractInWorker";
import ImportMapping from "./ImportMapping";
import ImportReview, { reviewRow } from "./ImportReview";
import ImportDates from "./ImportDates";
import ImportExclusions from "./ImportExclusions";
import { MAX_IMPORT_ROWS, detectSimpleColumns, headerLabels, mappingMatches, projectRows, validateMapping } from "../../../shared/campaign-price-import/model";
import { analyzeImportDates, campaignDateText, importRowDates } from "../../../shared/campaign-price-import/tableDates";
import "./CampaignPriceImport.css";

const EMPTY_MAPPING = { version: 1, headerRow: 0, codeColumn: -1, priceColumn: -1, originalColumn: -1 };
const EMPTY_ANALYSIS = { start: "", end: "", datedRows: 0, perItem: false, conflict: false, candidates: { starts: [], ends: [] } };

export default function CampaignPriceImportDialog({ mode, store, items, initialSource, year, dates = {}, allowNoDates = false, onApply, onClose }) {
  const dialog = useRef(null), work = useRef(null), alive = useRef(true), api = useRef(null);
  const preparedRequest = useRef(null), confirmation = useRef(null), sourceRows = useRef(new Map());
  const [step, setStep] = useState(1), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [text, setText] = useState(initialSource?.text || ""), [html, setHtml] = useState("");
  const [file, setFile] = useState(initialSource?.file || null), [delimiter, setDelimiter] = useState("auto");
  const [sheets, setSheets] = useState([]), [sheetIndex, setSheetIndex] = useState(0);
  const [mappings, setMappings] = useState({}), [includedSheets, setIncludedSheets] = useState([]);
  const [source, setSource] = useState(null), [models, setModels] = useState([]);
  const [modelOffset, setModelOffset] = useState(0), [modelId, setModelId] = useState(""), [modelName, setModelName] = useState("");
  const [batch, setBatch] = useState(null), [edits, setEdits] = useState({}), [locked, setLocked] = useState(false);
  const [periodOverride, setPeriodOverride] = useState({});
  const existingCodes = useMemo(() => new Set(items.map(item => String(item.codigo ?? item.artigo ?? "").trim())), [items]);
  const mapping = mappings[sheetIndex] || EMPTY_MAPPING;
  const tableAnalysis = useMemo(() => {
    const entries = [], errors = [];
    includedSheets.forEach(index => {
      const sheet = sheets[index], selectedMapping = mappings[index];
      try {
        const rows = projectRows(sheet, selectedMapping).map(row => ({ ...row, sourceSheet: sheet.name, sourceLine: row.line }));
        entries.push({ sheet, mapping: selectedMapping, rows });
      } catch (failure) { errors.push(`${sheet.name}: ${failure.message}`); }
    });
    const rows = entries.flatMap(entry => entry.rows);
    if (rows.length > MAX_IMPORT_ROWS) errors.push(`Selecione até ${MAX_IMPORT_ROWS} artigos por importação.`);
    return { entries, errors, rows };
  }, [sheets, mappings, includedSheets]);
  const dateAnalysis = useMemo(() => sheets.length ? analyzeImportDates(tableAnalysis.entries, year, { dataInicio: periodOverride.start ?? dates.dataInicio, dataFim: periodOverride.end ?? dates.dataFim }) : EMPTY_ANALYSIS,
    [sheets.length, tableAnalysis.entries, year, dates, periodOverride.start, periodOverride.end]);
  const period = { start: dateAnalysis.start, end: dateAnalysis.end, resolved: !dateAnalysis.conflict, overrideRows: false, ...periodOverride };
  const exclusions = tableAnalysis.rows.filter(row => row.classification === "excluded");
  const originalsByLine = new Map([...sourceRows.current].map(([line, row]) => [line, { raw: row.originalRawPrice, cents: row.originalCents }]));

  useEffect(() => {
    alive.current = true;
    const el = dialog.current;
    if (el?.showModal) el.showModal(); else el?.setAttribute("open", "");
    return () => { alive.current = false; work.current?.abort(); el?.close?.(); };
  }, []);
  useEffect(() => {
    const close = () => { alive.current = false; work.current?.abort(); onClose(); };
    window.addEventListener("promopilot:access-changed", close);
    return () => window.removeEventListener("promopilot:access-changed", close);
  }, [onClose]);
  async function request(action, payload) {
    if (!api.current) api.current = await createImportApi(store);
    return api.current(action, payload);
  }
  async function run(action) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (failure) { if (alive.current) setError(failure.message || "Não foi possível concluir a importação."); }
    finally { if (alive.current) setBusy(false); }
  }
  async function loadModels(offset) {
    const result = await request("models", { offset });
    if (alive.current) { setModels(result.models); setModelOffset(offset); }
  }
  async function readSource() {
    if (file?.size > 10 * 1024 * 1024) throw new Error("O limite por ficheiro é 10 MB.");
    work.current?.abort(); work.current = new AbortController();
    const bytes = file ? await file.arrayBuffer() : null, inputText = html || text;
    const digest = await crypto.subtle.digest("SHA-256", bytes || new TextEncoder().encode(inputText));
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const result = await extractInWorker({ bytes, text: inputText, name: file?.name || "Tabela colada", delimiter }, work.current.signal);
    if (!alive.current) return;
    if (!result.length) throw new Error("Não foram encontradas tabelas com dados.");
    const detected = result.map((sheet, index) => ({ ...detectSimpleColumns(sheet), index }));
    const included = detected.filter(entry => entry.candidates?.code?.length && entry.candidates?.promo?.length).map(entry => entry.index);
    const first = [...detected].sort((a, b) => b.score - a.score)[0]?.index || 0;
    setSheets(result); setSheetIndex(first); setIncludedSheets(included.length ? included : [first]);
    setMappings(Object.fromEntries(detected.map(entry => [entry.index, entry.mapping || EMPTY_MAPPING])));
    setSource({ name: (file?.name || "Tabela colada").slice(0, 240), sha256, parser: "campaign-pvp2-v1",
      priceBaseline: mode === "manual" ? "supplier-table" : "catalog" });
    preparedRequest.current = null; confirmation.current = null; sourceRows.current = new Map();
    setBatch(null); setEdits({}); setLocked(false); resetDateResolution(); setModelId(""); setModelName(""); setStep(2);
  }
  function resetDateResolution() {
    setPeriodOverride(previous => { const next = { ...previous }; delete next.resolved; return next; });
  }
  function updateMapping(patch) {
    resetDateResolution();
    setMappings(previous => ({ ...previous, [sheetIndex]: { ...previous[sheetIndex], ...patch } }));
    preparedRequest.current = null;
  }
  function chooseModel(id) {
    const model = models.find(item => item.id === id);
    setModelId(id); setModelName(model?.name || ""); preparedRequest.current = null;
    if (!model) return;
    if (!mappingMatches(model.mapping, sheets[sheetIndex], model.mapping.headerRow)) {
      setError("As colunas desta tabela mudaram. Confirme a identificação e atualize o modelo.");
      return;
    }
    const guessed = detectSimpleColumns(sheets[sheetIndex], model.mapping.headerRow)?.mapping;
    setError(""); updateMapping({ ...guessed, ...model.mapping });
  }
  async function saveModel(update) {
    const headers = validateMapping(mapping, sheets[sheetIndex]);
    if (mode === "manual" && !(mapping.originalColumn >= 0)) throw new Error("Selecione também a coluna PVP2 Antes da tabela.");
    const result = await request("save_model", { ...(update ? { id: modelId } : {}), name: modelName, mapping: { ...mapping, headers } });
    if (!alive.current) return;
    setModelId(result.id); await loadModels(modelOffset); setNotice("Modelo guardado para esta organização.");
  }
  async function prepare() {
    if (tableAnalysis.errors.length) throw new Error(tableAnalysis.errors.join(" "));
    if (!includedSheets.length) throw new Error("Selecione pelo menos uma folha.");
    if (!preparedRequest.current) {
      const rows = tableAnalysis.rows.filter(row => row.classification !== "excluded").map((row, index) => ({ ...row, line: index + 1,
        warning: [row.warning, row.classification === "review" ? row.reason : ""].filter(Boolean).join(" · ").slice(0, 1000) }));
      sourceRows.current = new Map(rows.map(row => [row.line, row]));
      if (!rows.length) { setBatch({ id: null, rows: [] }); setEdits({}); setStep(3); return; }
      preparedRequest.current = { id: crypto.randomUUID(), mode, rows,
        source: { ...source, sheet: includedSheets.length === 1 ? sheets[includedSheets[0]].name : "Várias folhas",
          sheets: includedSheets.map(index => ({ name: sheets[index].name, mapping: { ...mappings[index], headers: headerLabels(sheets[index], mappings[index].headerRow) } })),
          modelId: modelId || null, period, excludedRows: exclusions.length } };
    }
    const result = await request("prepare", preparedRequest.current);
    if (!alive.current) return;
    setBatch(result); setEdits(Object.fromEntries(result.rows.map(row => {
      const rowDates = importRowDates(sourceRows.current.get(Number(row.line)) || {}, period, year, allowNoDates);
      return [row.id, { price: row.currentCents ? (row.currentCents / 100).toFixed(2).replace(".", ",") : "",
        selected: !row.problem && !row.warning && !rowDates.error && !existingCodes.has(row.code) && row.currentCents !== null && row.currentCents < row.beforeCents,
        reviewed: false, start: rowDates.start, end: rowDates.end }];
    }))); setStep(3);
  }
  function updatePeriod(patch) {
    const next = { ...period, ...patch };
    setPeriodOverride(previous => ({ ...previous, ...patch }));
    if (batch && ["start", "end", "overrideRows"].some(key => key in patch)) setEdits(previous => Object.fromEntries(batch.rows.map(row => {
      const old = previous[row.id];
      if (old?.datesEdited && !patch.overrideRows) return [row.id, old];
      const rowDates = importRowDates(sourceRows.current.get(Number(row.line)) || {}, next, year, allowNoDates);
      return [row.id, { ...old, start: rowDates.start, end: rowDates.end, selected: false, datesEdited: false }];
    })));
  }
  const selected = (batch?.rows || []).flatMap(row => {
    const edit = edits[row.id], review = reviewRow(row, edit, existingCodes, !allowNoDates);
    return edit?.selected && !review.error ? [{ id: row.id, cents: review.cents, reviewed: Boolean(edit.reviewed) }] : [];
  });
  async function apply() {
    if (!allowNoDates && !period.resolved) throw new Error("Confirme as datas diferentes antes de guardar.");
    if (!selected.length && !confirmation.current) throw new Error("Selecione pelo menos uma linha válida.");
    // Freeze confirmation after submission: retries may follow a successful SQL
    // commit whose HTTP response was lost. No new prices or dates on that retry.
    if (!confirmation.current) confirmation.current = { id: batch.id, selected };
    setLocked(true);
    const result = await request("confirm", confirmation.current);
    if (!alive.current) return;
    const withPresentation = result.items.map(item => {
      const prepared = batch.rows.find(row => row.id === item.campaignPriceImport?.rowId || row.id === item.id || row.code === item.codigo);
      const extra = sourceRows.current.get(Number(prepared?.line))?.extra || {};
      const edit = edits[prepared?.id] || {};
      const description = String(extra.description || "").trim().slice(0, 200), ean = String(extra.ean || "").replace(/\s/g, "");
      return { ...item,
        ...(!String(item.descricao || "").trim() && description ? { descricao: description } : {}),
        ...(!String(item.ean || "").trim() && /^(?:\d{8}|\d{12,14})$/.test(ean) ? { ean } : {}),
        ...(extra.warehouses || {}),
        dataInicio: allowNoDates ? "" : campaignDateText(edit.start), dataFim: allowNoDates ? "" : campaignDateText(edit.end) };
    });
    await onApply(withPresentation, result);
    if (alive.current) onClose();
  }

  return <dialog ref={dialog} className="price-import-dialog" aria-labelledby="price-import-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={onClose}>
    <header className="price-import-header"><div><span className="price-import-eyebrow">Campanhas Manuais</span><h2 id="price-import-title">Importar tabela de campanha</h2><p>Reveja os artigos, preços e datas antes de guardar. O catálogo mantém-se intacto.</p></div><button type="button" className="price-import-close" aria-label="Fechar importação" disabled={busy} onClick={onClose}>×</button></header>
    <ol className="price-import-steps" aria-label="Progresso">{["Tabela", "Análise", "Revisão"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <fieldset className="price-import-body" disabled={busy} aria-busy={busy}>
      {error && <p className="price-import-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {step === 1 && <>
        <label className="price-import-upload">Escolher ficheiro<input autoFocus type="file" accept=".xlsx,.xls,.ods,.csv,.tsv,.txt" onChange={event => { setFile(event.target.files?.[0] || null); setError(""); }} /><span>XLSX, XLS, ODS ou CSV · até 10 MB · 2 000 artigos</span>{file && <span>Selecionado: {file.name}</span>}</label>
        <label className="price-import-paste">Ou colar uma tabela<textarea value={text} disabled={Boolean(file)} placeholder="Cole a tabela do Excel, LibreOffice ou de um email." onPaste={event => { event.preventDefault(); setText(event.clipboardData.getData("text/plain")); const rich = event.clipboardData.getData("text/html"); setHtml(/<table/i.test(rich) ? rich : ""); }} onChange={event => { setText(event.target.value); setHtml(""); }} /></label>
        {file && <button type="button" onClick={() => setFile(null)}>Remover ficheiro e usar colagem</button>}
        <details><summary>Opções do texto colado / CSV</summary><label className="price-import-delimiter">Separador<select value={delimiter} onChange={event => setDelimiter(event.target.value)}><option value="auto">Detetar</option><option value={"\t"}>Tabulação</option><option value=";">Ponto e vírgula</option><option value=",">Vírgula</option><option value="|">Barra vertical</option></select></label></details>
      </>}
      {step === 2 && <>
        {sheets.length > 1 && <div className="price-import-sheets"><strong>Folhas a importar</strong>{sheets.map((sheet, index) => <label key={index} className="price-import-sheet-option"><input type="checkbox" checked={includedSheets.includes(index)} onChange={event => { resetDateResolution(); setIncludedSheets(previous => event.target.checked ? [...previous, index].sort((a, b) => a - b) : previous.filter(value => value !== index)); preparedRequest.current = null; }} />{sheet.name}</label>)}</div>}
        <ImportMapping mode={mode} sheets={sheets} sheetIndex={sheetIndex} mapping={mapping} onMapping={updateMapping} onSheet={index => { setSheetIndex(index); setModelId(""); }} />
        <details className="price-import-models"><summary onClick={() => { if (!models.length) run(() => loadModels(0)); }}>Modelos de fornecedor (opcional)</summary>
          <label>Usar modelo guardado<select value={modelId} onChange={event => chooseModel(event.target.value)}><option value="">Deteção automática</option>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
          <div className="price-import-pagination"><button type="button" disabled={busy || modelOffset === 0} onClick={() => run(() => loadModels(Math.max(0, modelOffset - 100)))}>Modelos anteriores</button><span>{models.length} modelos nesta página</span><button type="button" disabled={busy || models.length < 100} onClick={() => run(() => loadModels(modelOffset + 100))}>Mais modelos</button></div>
          <label>Nome do modelo<input value={modelName} maxLength={120} onChange={event => setModelName(event.target.value)} /></label>
          <div className="price-import-model-actions"><button type="button" disabled={busy || !modelName.trim()} onClick={() => run(() => saveModel(false))}>Guardar novo modelo</button>{modelId && <><button type="button" disabled={busy || !modelName.trim()} onClick={() => run(() => saveModel(true))}>Atualizar modelo</button><button type="button" disabled={busy} onClick={() => run(async () => { await request("delete_model", { id: modelId }); if (alive.current) { setModelId(""); await loadModels(modelOffset); } })}>Eliminar modelo</button></>}</div>
        </details>
        {tableAnalysis.errors.map(message => <p key={message} className="price-import-warning">{message}</p>)}
      </>}
      {step > 1 && <ImportDates analysis={dateAnalysis} period={period} onChange={updatePeriod} allowNoDates={allowNoDates} disabled={busy || locked} />}
      {step > 1 && <ImportExclusions rows={exclusions} />}
      {step === 3 && <>
        <p className="price-import-note">{batch.rows.length} artigos para rever · {selected.length} selecionados. {mode === "manual" ? "PVP2 Antes e PVP2 Atual vêm da tabela." : "PVP2 Antes do catálogo e PVP2 Atual da tabela."}</p>
        <ImportReview mode={mode} batch={batch} edits={edits} originalsByLine={originalsByLine} existingCodes={existingCodes} requireDates={!allowNoDates} disabled={busy || locked} onEdit={(id, patch) => setEdits(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }))} />
      </>}
    </fieldset>
    <footer className="price-import-footer">
      <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
      {step === 2 && <button type="button" disabled={busy} onClick={() => setStep(1)}>Mudar tabela</button>}
      {step === 3 && !locked && <button type="button" disabled={busy} onClick={() => { setStep(2); preparedRequest.current = null; setBatch(null); }}>Corrigir identificação</button>}
      <button type="button" className="price-import-primary" disabled={busy || (step === 1 && !file && !text.trim()) || (step === 2 && (tableAnalysis.errors.length > 0 || !includedSheets.length)) || (step === 3 && ((!selected.length && !locked) || (!allowNoDates && !period.resolved)))} onClick={() => run(step === 1 ? readSource : step === 2 ? prepare : apply)}>{busy ? "A processar…" : step === 1 ? "Analisar tabela" : step === 2 ? "Rever artigos" : locked ? "Repetir confirmação e guardar" : `Confirmar e guardar ${selected.length} artigos`}</button>
    </footer>
  </dialog>;
}
