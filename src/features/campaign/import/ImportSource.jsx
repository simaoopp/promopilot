import React, { useState } from "react";

export default function ImportSource({
  busy,
  onRead,
  templates,
  selected,
  onTemplate,
  sessions,
  onResume,
}) {
  const [text, setText] = useState(""),
    [html, setHtml] = useState(""),
    [drag, setDrag] = useState(false);
  const [separator, setSeparator] = useState("");
  return (
    <div className="ci-source">
      <div
        className={`ci-drop ${drag ? "ci-drop-active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          if (!busy && event.dataTransfer.files[0])
            onRead({ file: event.dataTransfer.files[0], separator });
        }}
      >
        <span className="ci-file-icon" aria-hidden="true">
          ↥
        </span>
        <h3>Uma tabela. Uma campanha.</h3>
        <p>Arraste o ficheiro ou selecione no computador.</p>
        <label className="ci-button ci-primary">
          Selecionar ficheiro
          <input
            type="file"
            disabled={busy}
            accept=".xlsx,.xls,.ods,.csv,.tsv,.txt,.md,.html,.htm"
            onChange={(event) => {
              if (event.target.files[0])
                onRead({ file: event.target.files[0], separator });
            }}
          />
        </label>
        <small>XLSX, XLS, ODS, CSV, TSV, HTML ou Markdown · até 10 MB</small>
      </div>
      <label>
        Ou cole a tabela
        <textarea
          value={text}
          rows={6}
          disabled={busy}
          placeholder="Cole as células do Excel, LibreOffice ou de um email…"
          onChange={(event) => {
            setText(event.target.value);
            setHtml("");
          }}
          onPaste={(event) => {
            const table = event.clipboardData.getData("text/html"),
              plain = event.clipboardData.getData("text/plain");
            if (/<table[\s>]/i.test(table)) {
              event.preventDefault();
              setHtml(table);
              setText(plain || "Tabela HTML copiada.");
            }
          }}
        />
      </label>
      <div className="ci-inline">
        <label>
          Separador de texto
          <select
            value={separator}
            disabled={busy}
            onChange={(event) => setSeparator(event.target.value)}
          >
            <option value="">Detetar</option>
            <option value={"\t"}>Tabulação</option>
            <option value=";">Ponto e vírgula</option>
            <option value=",">Vírgula</option>
          </select>
        </label>
        <button
          type="button"
          className="ci-button"
          disabled={busy || !text.trim()}
          onClick={() => onRead({ text: html || text, separator })}
        >
          Interpretar tabela colada
        </button>
      </div>
      <label>
        Modelo do fornecedor
        <select
          value={selected?.id || ""}
          disabled={busy}
          onChange={(event) =>
            onTemplate(
              templates.find((t) => t.id === event.target.value) || null,
            )
          }
        >
          <option value="">Novo formato / escolher depois</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.supplier} · {t.name} · v{t.version}
            </option>
          ))}
        </select>
      </label>
      {sessions.length > 0 && (
        <details>
          <summary>Retomar uma importação recente</summary>
          <ul className="ci-recent">
            {sessions.map((s) => (
              <li key={s.id}>
                <span>
                  <strong>{s.source.name}</strong>
                  <small>
                    {new Date(s.updated_at).toLocaleString("pt-PT")} ·{" "}
                    {s.processed}/{s.total_rows} linhas ·{" "}
                    {s.state === "completed"
                      ? "Validada"
                      : s.state === "ready"
                        ? "Em revisão"
                        : "Leitura parcial"}
                  </small>
                </span>
                <button
                  type="button"
                  className="ci-button"
                  disabled={busy}
                  onClick={() => onResume(s)}
                >
                  Retomar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
