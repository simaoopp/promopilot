import React, { useEffect, useRef, useState } from "react";
import { fetchArticleDatabaseSyncHistory, parseArticleDatabaseFile, syncArticleDatabase } from "../../services/articleDatabaseSyncService";

const OWNER_EMAIL = "simao.pereira@susiarte.com";

function formatDate(value) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; }
}

export default function ArticleDatabaseSyncPanel({ user, open, onClose }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState([]);

  const isOwner = String(user?.email || "").trim().toLowerCase() === OWNER_EMAIL;

  async function loadHistory() {
    try { setHistory(await fetchArticleDatabaseSyncHistory()); } catch (e) { console.warn(e); }
  }

  useEffect(() => { if (open && isOwner) loadHistory(); }, [open, isOwner]);

  if (!open || !isOwner) return null;

  async function chooseFile(nextFile) {
    setError(""); setMessage(""); setResult(null); setParsed(null); setProgress(0); setConfirming(false);
    if (!nextFile) return;
    setFile(nextFile);
    try {
      const data = await parseArticleDatabaseFile(nextFile);
      setParsed(data);
      setMessage(`${data.rows.length.toLocaleString("pt-PT")} artigos preparados para sincronização.`);
    } catch (e) {
      setFile(null);
      setError(e?.message || "Não foi possível ler o ficheiro.");
    }
  }

  async function handleSync() {
    if (!file || !parsed || loading) return;
    if (!confirming) {
      setConfirming(true);
      setMessage("Confirma a atualização. Os artigos existentes só terão preços e estado alterados.");
      return;
    }
    setLoading(true); setConfirming(false); setError(""); setMessage("A sincronizar a base de dados…"); setProgress(0);
    try {
      const data = await syncArticleDatabase({ file, onProgress: ({ processed, total }) => setProgress(Math.round((processed / total) * 100)) });
      setProgress(100); setResult(data.aggregate); setMessage("Atualização concluída com sucesso."); await loadHistory();
    } catch (e) {
      setError(e?.message || "A sincronização falhou.");
    } finally { setLoading(false); }
  }

  return (
    <div className="admin-db-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !loading && onClose()}>
      <section className="admin-db-modal" role="dialog" aria-modal="true" aria-labelledby="admin-db-title">
        <div className="admin-db-header">
          <div><span className="admin-db-eyebrow">Gestão de dados</span><h2 id="admin-db-title">Atualizar base de artigos</h2><p>Importa a tabela oficial e sincroniza preços, estado e novos artigos.</p></div>
          <button type="button" className="admin-db-close" onClick={onClose} disabled={loading}>×</button>
        </div>

        <div className="admin-db-dropzone" onClick={() => !loading && inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0]); }} data-dragging={dragging}>
          <input ref={inputRef} type="file" accept=".ods,.xlsx,.xls" hidden onChange={(e) => chooseFile(e.target.files?.[0])} />
          <strong>{file ? file.name : "Seleciona a tabela de artigos"}</strong>
          <span>{file ? "Clica para escolher outro ficheiro" : "Arrasta aqui ou clica para procurar · ODS, XLSX ou XLS"}</span>
        </div>

        {parsed && <div className="admin-db-summary"><div><span>Artigos</span><strong>{parsed.rows.length.toLocaleString("pt-PT")}</strong></div><div><span>Folha</span><strong>{parsed.sheetName}</strong></div><div><span>Colunas</span><strong>{parsed.sourceColumns.length}</strong></div></div>}

        {loading && <div className="admin-db-progress"><div className="admin-db-progress-top"><span>A atualizar Supabase</span><strong>{progress}%</strong></div><div className="admin-db-progress-track"><span style={{ width: `${progress}%` }} /></div></div>}

        {message && <div className="admin-db-message">{message}</div>}
        {error && <div className="admin-db-error">{error}</div>}

        {result && <div className="admin-db-result"><strong>Resultado</strong><div className="admin-db-result-grid"><span><b>{result.updated}</b> alterados</span><span><b>{result.inserted}</b> novos</span><span><b>{result.unchanged}</b> iguais</span><span><b>{result.changedFields.pvp1 + result.changedFields.pvp2 + result.changedFields.pvp3}</b> alterações de preço</span></div></div>}

        <div className="admin-db-actions"><button type="button" className="btn btn-secondary" onClick={() => { setConfirming(false); onClose(); }} disabled={loading}>Fechar</button><button type="button" className="btn btn-primary" onClick={handleSync} disabled={!parsed || loading}>{loading ? "A atualizar…" : confirming ? "Confirmar atualização" : "Atualizar Base de Dados"}</button></div>

        <div className="admin-db-history"><div className="admin-db-history-title"><strong>Últimas atualizações</strong><button type="button" onClick={loadHistory} disabled={loading}>Atualizar</button></div>{history.length ? history.map((item) => <div className="admin-db-history-row" key={item.id}><div><strong>{item.file_name}</strong><span>{formatDate(item.created_at)}</span></div><div><b>{Number(item.updated_rows || 0).toLocaleString("pt-PT")}</b> alterados · <b>{Number(item.inserted_rows || 0).toLocaleString("pt-PT")}</b> novos</div><span className={`admin-db-status admin-db-status-${item.status}`}>{item.status === "completed" ? "Concluída" : item.status === "processing" ? "Em curso" : "Falhou"}</span></div>) : <p>Sem sincronizações registadas.</p>}</div>
      </section>
    </div>
  );
}
