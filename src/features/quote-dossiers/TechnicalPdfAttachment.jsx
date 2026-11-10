import React, { useEffect, useRef, useState } from "react";
import { formatTechnicalPdfSize, normalizeTechnicalPdf, prepareTechnicalPdf } from "./dossierTechnicalPdf";

export default function TechnicalPdfAttachment({ value, equipmentNumber, disabled = false, onChange, onReadingChange }) {
  const [reading, setReading] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState(null), [confirmRemove, setConfirmRemove] = useState(false);
  const input = useRef(null), request = useRef(null);
  const sheet = normalizeTechnicalPdf(value), blob = sheet?.blob || null;
  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    if (!blob) { setPreview(null); return undefined; }
    let url;
    try { url = URL.createObjectURL(blob); setPreview({ blob, url }); }
    catch { setError("Não foi possível preparar a abertura do PDF neste navegador."); setPreview(null); }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [blob]);
  // Never render a previous attachment's URL while the replacement effect runs.
  const url = preview?.blob === blob ? preview.url : "";
  async function select(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || disabled) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setReading(true); setError(""); setConfirmRemove(false);
    onReadingChange?.(true);
    try {
      const next = await prepareTechnicalPdf(file, { signal: controller.signal });
      if (!controller.signal.aborted && request.current === controller) onChange(next);
    } catch (failure) {
      if (!controller.signal.aborted && request.current === controller) setError(failure?.message || "Não foi possível carregar a ficha técnica.");
    } finally {
      if (!controller.signal.aborted && request.current === controller) setReading(false);
      if (request.current === controller) onReadingChange?.(false);
    }
  }
  const unavailable = disabled || reading;
  return <section className="quote-technical-pdf" aria-label={`Ficha técnica do equipamento ${equipmentNumber}`}>
    <div className="quote-technical-pdf-heading"><strong>Ficha técnica · PDF</strong><span>Até 10 MB</span></div>
    <input ref={input} className="quote-technical-pdf-input" type="file" accept="application/pdf,.pdf" aria-label={`Carregar ficha técnica do equipamento ${equipmentNumber}`} onChange={select} disabled={unavailable} />
    {sheet ? <p className="quote-technical-pdf-name"><strong>{sheet.name}</strong><span>{formatTechnicalPdfSize(sheet.size)}</span></p> : <p className="quote-technical-pdf-empty">Adiciona a ficha do fabricante para a consultar aqui.</p>}
    <div className="quote-technical-pdf-actions">
      <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()} disabled={unavailable}>{reading ? "A validar PDF…" : sheet ? "Substituir PDF" : "Carregar PDF"}</button>
      {sheet && url && <>
        <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">Abrir PDF</a>
        <a className="quote-technical-pdf-link" href={url} download={sheet.name}>Descarregar</a>
      </>}
      {sheet && <button type="button" className="quote-technical-pdf-link" onClick={() => setConfirmRemove(true)} disabled={unavailable}>Remover</button>}
    </div>
    {sheet && <p className="quote-technical-pdf-note">Guardada no rascunho como ficheiro separado do dossier gerado.</p>}
    {confirmRemove && <div className="quote-technical-pdf-confirm" role="alert">
      <p>Remover esta ficha técnica do equipamento?</p>
      <button type="button" className="btn btn-secondary" onClick={() => setConfirmRemove(false)}>Cancelar</button>
      <button type="button" className="btn btn-secondary" disabled={unavailable} onClick={() => { onChange(null); setConfirmRemove(false); setError(""); }}>Confirmar remoção</button>
    </div>}
    {reading && <p role="status">A verificar o ficheiro…</p>}
    {error && <p className="quote-technical-pdf-error" role="alert">{error}</p>}
  </section>;
}
