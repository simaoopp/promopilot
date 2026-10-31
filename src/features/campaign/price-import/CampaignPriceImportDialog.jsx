import React, { useEffect, useMemo, useRef, useState } from "react";
import { createImportApi } from "./importApi";
import { extractInWorker } from "./extractInWorker";
import ImportMapping from "./ImportMapping";
import ImportReview, { reviewRow } from "./ImportReview";
import { headerLabels, mappingMatches, projectRows, validateMapping } from "../../../shared/campaign-price-import/model";
import "./CampaignPriceImport.css";

const EMPTY_MAPPING = { version: 1, headerRow: 0, codeColumn: -1, priceColumn: -1 };

export default function CampaignPriceImportDialog({ mode, store, items, initialSource, onApply, onClose }) {
  const dialog = useRef(null);
  const work = useRef(null);
  const alive = useRef(true);
  const api = useRef(null);
  const preparedRequest = useRef(null);
  const confirmation = useRef(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState(initialSource?.text || "");
  const [html, setHtml] = useState("");
  const [file, setFile] = useState(initialSource?.file || null);
  const [delimiter, setDelimiter] = useState("auto");
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState(EMPTY_MAPPING);
  const [columnConfirmed, setColumnConfirmed] = useState(false);
  const [source, setSource] = useState(null);
  const [models, setModels] = useState([]);
  const [modelOffset, setModelOffset] = useState(0);
  const [modelId, setModelId] = useState("");
  const [modelName, setModelName] = useState("");
  const [batch, setBatch] = useState(null);
  const [edits, setEdits] = useState({});
  const [locked, setLocked] = useState(false);
  const existingCodes = useMemo(() => new Set(items.map(i => String(i.codigo ?? i.artigo ?? "").trim())), [items]);

  useEffect(() => {
    alive.current = true;
    const el = dialog.current;
    if (el?.showModal) el.showModal(); else el?.setAttribute("open", "");
    return () => { alive.current = false; work.current?.abort(); el?.close?.(); };
  }, []);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("promopilot:access-changed", close);
    return () => window.removeEventListener("promopilot:access-changed", close);
  }, [onClose]);

  async function request(action, payload) {
    if (!api.current) api.current = await createImportApi(store);
    return api.current(action, payload);
  }
  async function run(fn) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await fn(); }
    catch (e) { if (alive.current) setError(e.message || "Não foi possível concluir a importação."); }
    finally { if (alive.current) setBusy(false); }
  }
  const loadModels = async offset => {
    const result = await request("models", { offset });
    if (alive.current) { setModels(result.models); setModelOffset(offset); }
  };
  async function readSource() {
    if (file?.size > 10 * 1024 * 1024) throw new Error("O limite por ficheiro é 10 MB.");
    work.current?.abort(); work.current = new AbortController();
    const bytes = file ? await file.arrayBuffer() : null;
    const inputText = html || text;
    const digest = await crypto.subtle.digest("SHA-256", bytes || new TextEncoder().encode(inputText));
    const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
    const result = await extractInWorker({ bytes, text: inputText, name: file?.name || "Tabela colada", delimiter }, work.current.signal);
    if (!alive.current) return;
    if (!result.length) throw new Error("Não foram encontradas tabelas com dados.");
    setSheets(result); setSheetIndex(0); setMapping(EMPTY_MAPPING); setColumnConfirmed(false);
    setSource({ name: (file?.name || "Tabela colada").slice(0,240), sha256, parser: "campaign-pvp2-v1" });
    preparedRequest.current = null; confirmation.current = null; setBatch(null); setLocked(false);
    setStep(2);
    await loadModels(0);
  }
  function updateMapping(patch) {
    setMapping(previous => ({ ...previous, ...patch }));
    setColumnConfirmed(false); preparedRequest.current = null;
  }
  function chooseModel(id) {
    const model = models.find(m => m.id === id);
    setModelId(id); setModelName(model?.name || ""); setColumnConfirmed(false);
    preparedRequest.current = null;
    if (!model) return;
    if (!mappingMatches(model.mapping, sheets[sheetIndex], model.mapping.headerRow)) {
      setMapping(EMPTY_MAPPING); setError("As colunas desta tabela mudaram. Associe-as novamente e atualize o modelo.");
    } else { setError(""); setMapping(model.mapping); }
  }
  async function saveModel(update) {
    const headers = validateMapping(mapping, sheets[sheetIndex]);
    if (!columnConfirmed) throw new Error("Confirme a coluna do PVP2 Atual antes de guardar o modelo.");
    const result = await request("save_model", { ...(update ? { id: modelId } : {}), name: modelName, mapping: { ...mapping, headers } });
    if (!alive.current) return;
    setModelId(result.id); await loadModels(modelOffset); setNotice("Modelo guardado para esta organização.");
  }
  async function prepare() {
    if (!columnConfirmed) throw new Error("Confirme a coluna do PVP2 Atual.");
    if (!preparedRequest.current) {
      const sheet = sheets[sheetIndex];
      preparedRequest.current = { id: crypto.randomUUID(), mode,
        source: { ...source, sheet: sheet.name, mapping: { ...mapping, headers: headerLabels(sheet, mapping.headerRow) }, modelId: modelId || null },
        rows: projectRows(sheet, mapping) };
    }
    const result = await request("prepare", preparedRequest.current);
    if (!alive.current) return;
    setBatch(result); setEdits(Object.fromEntries(result.rows.map(row => [row.id, {
      price: row.currentCents ? (row.currentCents / 100).toFixed(2).replace(".", ",") : "",
      selected: !row.problem && !row.warning && !existingCodes.has(row.code) && row.currentCents !== null && row.currentCents < row.beforeCents,
      reviewed: false,
    }]))); setStep(3);
  }
  const selected = (batch?.rows || []).flatMap(row => {
    const edit = edits[row.id]; const reviewed = reviewRow(row, edit, existingCodes);
    return edit?.selected && !reviewed.error ? [{ id: row.id, cents: reviewed.cents, reviewed: Boolean(edit.reviewed) }] : [];
  });
  async function apply() {
    if (!selected.length && !confirmation.current) throw new Error("Selecione pelo menos uma linha válida.");
    // Freeze a confirmation once submitted. A network timeout may occur after
    // commit; retry the identical payload rather than changing a committed price.
    if (!confirmation.current) confirmation.current = { id: batch.id, selected };
    setLocked(true);
    const result = await request("confirm", confirmation.current);
    if (!alive.current) return;
    await onApply(result.items, result);
    if (alive.current) onClose();
  }

  return <dialog ref={dialog} className="price-import-dialog" aria-labelledby="price-import-title" onCancel={e => { if (busy) e.preventDefault(); }} onClose={onClose}>
    <header className="price-import-header"><div><span className="price-import-eyebrow">Campanha {mode === "manual" ? "manual" : "Excel"}</span><h2 id="price-import-title">Da tabela à campanha</h2><p>PVP2 Antes → PVP2 Atual. O catálogo mantém-se intacto.</p></div><button type="button" className="price-import-close" aria-label="Fechar importação" disabled={busy} onClick={onClose}>×</button></header>
    <ol className="price-import-steps" aria-label="Progresso">{["Tabela", "Colunas", "Rever preços"].map((label,index)=><li key={label} aria-current={step===index+1?"step":undefined}><span>{index+1}</span>{label}</li>)}</ol>
    <fieldset className="price-import-body" disabled={busy} aria-busy={busy}>
      {error && <p className="price-import-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {step===1 && <>
        <label className="price-import-upload">Escolher ficheiro<input autoFocus type="file" accept=".xlsx,.xls,.ods,.csv,.tsv,.txt" onChange={e=>{setFile(e.target.files?.[0]||null);setError("");}} /><span>XLSX, XLS, ODS ou CSV · até 10 MB · 2 000 artigos por importação</span>{file && <span>Selecionado: {file.name}</span>}</label>
        <label className="price-import-paste">Ou colar uma tabela<textarea value={text} disabled={Boolean(file)} placeholder="Cole as colunas do Excel, LibreOffice ou de um email." onPaste={e=>{const raw=e.clipboardData.getData("text/plain");const rich=e.clipboardData.getData("text/html");e.preventDefault();setText(raw);setHtml(rich.includes("<table")?rich:"");}} onChange={e=>{setText(e.target.value);setHtml("");}} /></label>
        {file && <button type="button" onClick={()=>setFile(null)}>Remover ficheiro e usar colagem</button>}
        <label className="price-import-delimiter">Separador de texto<select value={delimiter} onChange={e=>setDelimiter(e.target.value)}><option value="auto">Detetar</option><option value={"\t"}>Tabulação</option><option value=";">Ponto e vírgula</option><option value=",">Vírgula</option><option value="|">Barra vertical</option></select></label>
      </>}
      {step===2 && <>
        <details className="price-import-models"><summary>Modelos de fornecedor</summary>
          <label>Usar modelo guardado<select value={modelId} onChange={e=>chooseModel(e.target.value)}><option value="">Novo formato</option>{models.map(model=><option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
          <div className="price-import-pagination"><button type="button" disabled={busy||modelOffset===0} onClick={()=>run(()=>loadModels(Math.max(0,modelOffset-100)))}>Modelos anteriores</button><span>{modelOffset+1}–{modelOffset+models.length}</span><button type="button" disabled={busy||models.length<100} onClick={()=>run(()=>loadModels(modelOffset+100))}>Mais modelos</button></div>
          <label>Nome do modelo<input value={modelName} maxLength={120} onChange={e=>setModelName(e.target.value)} placeholder="Fornecedor · tabela promocional" /></label>
          <div className="price-import-model-actions"><button type="button" disabled={busy||!modelName.trim()||!columnConfirmed} onClick={()=>run(()=>saveModel(false))}>Guardar novo modelo</button>{modelId&&<><button type="button" disabled={busy||!modelName.trim()||!columnConfirmed} onClick={()=>run(()=>saveModel(true))}>Atualizar modelo</button><button type="button" disabled={busy} onClick={()=>run(async()=>{await request("delete_model",{id:modelId});if(alive.current){setModelId("");await loadModels(modelOffset);setNotice("Modelo eliminado. As importações anteriores mantêm a origem.");}})}>Eliminar modelo</button></>}</div>
        </details>
        <ImportMapping sheets={sheets} sheetIndex={sheetIndex} mapping={mapping} confirmed={columnConfirmed} onConfirmed={setColumnConfirmed} onMapping={updateMapping} onSheet={index=>{setSheetIndex(index);setModelId("");updateMapping(EMPTY_MAPPING);}} />
      </>}
      {step===3 && <>
        <p className="price-import-note">{batch.rows.length} linhas · {selected.length} selecionadas. Preços iguais e aumentos exigem seleção individual e não geram etiquetas de desconto.</p>
        <ImportReview batch={batch} edits={edits} existingCodes={existingCodes} disabled={busy||locked} onEdit={(id,patch)=>setEdits(previous=>({...previous,[id]:{...previous[id],...patch}}))} />
      </>}
    </fieldset>
    <footer className="price-import-footer">
      <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
      {step===2&&<button type="button" disabled={busy} onClick={()=>setStep(1)}>Mudar tabela</button>}
      {step===3&&!locked&&<button type="button" disabled={busy} onClick={()=>{setStep(2);preparedRequest.current=null;setColumnConfirmed(false);setNotice("Ao rever novamente, será capturado um novo PVP2 do catálogo.");}}>Corrigir colunas</button>}
      <button type="button" className="price-import-primary" disabled={busy||(step===1&&!file&&!text.trim())||(step===2&&!columnConfirmed)||(step===3&&!selected.length&&!locked)} onClick={()=>run(step===1?readSource:step===2?prepare:apply)}>{busy?"A processar…":step===1?"Ler tabela":step===2?"Consultar PVP2 e rever":locked?"Repetir confirmação e guardar":`Aplicar e guardar ${selected.length} artigos`}</button>
    </footer>
  </dialog>;
}
