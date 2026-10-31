import React, { useState } from "react";
import { STATES } from "../../../shared/campaign-import/model.js";
export const euros = (cents) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: "EUR",
      }).format(cents / 100);
function ReviewRow({ row, busy, locked, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(row.code),
    [price, setPrice] = useState(row.promo_input);
  const [start, setStart] = useState(row.start_date || ""),
    [end, setEnd] = useState(row.end_date || "");
  const [confirmed, setConfirmed] = useState(false);
  return (
    <>
      <tr>
        <td>
          <strong>{row.code || "Sem código"}</strong>
          <small>
            Linha da tabela {row.source_index + 1} ·{" "}
            {row.match_state === "identified"
              ? "Artigo identificado"
              : "Por identificar"}
          </small>
        </td>
        <td>{row.description || "—"}</td>
        <td>
          {euros(row.before_cents)}
          {row.previous_mismatch && (
            <small className="ci-warning">
              Difere do preço anterior da tabela: {euros(row.previous_cents)}
            </small>
          )}
        </td>
        <td>{euros(row.promo_cents)}</td>
        <td>
          {row.discount_bps
            ? `${(row.discount_bps / 100).toLocaleString("pt-PT")}%`
            : "—"}
          <small>
            {row.saving_cents ? `${euros(row.saving_cents)} de poupança` : ""}
          </small>
        </td>
        <td>
          <span className={`ci-status ci-status-${row.state}`}>
            {STATES[row.state]}
          </span>
        </td>
        <td>
          <button
            type="button"
            className="ci-button"
            onClick={() => setEditing(!editing)}
          >
            {locked ? "Ver origem" : "Rever"}
          </button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={7}>
            <div className="ci-row-editor">
              <details>
                <summary>Dados originais e avisos</summary>
                <ol>
                  {row.raw.map((value, i) => (
                    <li key={i}>{value || "(vazio)"}</li>
                  ))}
                </ol>
                {row.flags.map((flag, i) => (
                  <p key={i}>{flag}</p>
                ))}
              </details>
              {!locked && (
                <>
                  <div className="ci-inline">
                    <label>
                      Código exato
                      <input
                        value={code}
                        maxLength={120}
                        onChange={(event) => setCode(event.target.value)}
                      />
                    </label>
                    <label>
                      PVP2 Agora
                      <input
                        value={price}
                        inputMode="decimal"
                        maxLength={1000}
                        onChange={(event) => setPrice(event.target.value)}
                      />
                    </label>
                    <label>
                      Início
                      <input
                        type="date"
                        value={start}
                        onChange={(event) => setStart(event.target.value)}
                      />
                    </label>
                    <label>
                      Fim
                      <input
                        type="date"
                        value={end}
                        onChange={(event) => setEnd(event.target.value)}
                      />
                    </label>
                  </div>
                  {code !== row.code && (
                    <p className="ci-warning">
                      Ao corrigir o artigo, será capturado o PVP2 atual desse
                      artigo.
                    </p>
                  )}
                  {row.review && (
                    <label className="ci-check">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                      Conferi os códigos, preços e avisos com a origem.
                    </label>
                  )}
                  <div className="ci-inline">
                    <button
                      type="button"
                      className="ci-button ci-primary"
                      disabled={busy}
                      onClick={() =>
                        onEdit(row.row_index, {
                          code,
                          promoInput: price,
                          startDate: start,
                          endDate: end,
                          reviewConfirmed: confirmed,
                        })
                      }
                    >
                      Guardar correção
                    </button>
                    <button
                      type="button"
                      className="ci-button"
                      disabled={busy}
                      onClick={() =>
                        onEdit(row.row_index, { excluded: !row.excluded })
                      }
                    >
                      {row.excluded ? "Incluir linha" : "Excluir linha"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
export default function ImportReview({
  review,
  busy,
  filter,
  onFilter,
  onEdit,
  onExclude,
  onPage,
}) {
  const [query, setQuery] = useState(filter.query || "");
  const { session, counts, rows } = review;
  const locked = session.state === "completed";
  return (
    <>
      <div className="ci-counts">
        {Object.entries(counts).map(([state, count]) => (
          <button
            type="button"
            className={`ci-count ${filter.state === state ? "ci-count-active" : ""}`}
            key={state}
            onClick={() =>
              onFilter({ state: filter.state === state ? "" : state, query })
            }
          >
            <strong>{count}</strong>
            {STATES[state]}
          </button>
        ))}
      </div>
      <form
        className="ci-inline"
        onSubmit={(event) => {
          event.preventDefault();
          onFilter({ ...filter, query });
        }}
      >
        <label>
          Pesquisar código ou descrição
          <input
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="ci-button" disabled={busy}>
          Pesquisar
        </button>
        <button
          type="button"
          className="ci-button"
          disabled={busy}
          onClick={() => {
            setQuery("");
            onFilter({ query: "", state: "" });
          }}
        >
          Mostrar todas
        </button>
      </form>
      {!locked && (
        <button
          type="button"
          className="ci-button"
          disabled={busy}
          onClick={onExclude}
        >
          Excluir todas as linhas que precisam de correção
        </button>
      )}
      <div className="ci-table-scroll">
        <table>
          <caption>Revisão · PVP2 Antes capturado no catálogo</caption>
          <thead>
            <tr>
              {[
                "Artigo",
                "Descrição",
                "PVP2 Antes",
                "PVP2 Agora",
                "Desconto",
                "Estado",
                "Ações",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ReviewRow
                key={`${row.row_index}-${session.version}`}
                row={row}
                busy={busy}
                locked={locked}
                onEdit={onEdit}
              />
            ))}
          </tbody>
        </table>
        {!rows.length && <p>Sem linhas para este filtro.</p>}
      </div>
      <div className="ci-inline">
        <button
          type="button"
          className="ci-button"
          disabled={busy || !filter.offset}
          onClick={() => onPage(Math.max(0, filter.offset - 100))}
        >
          Anterior
        </button>
        <span>Página {Math.floor(filter.offset / 100) + 1}</span>
        <button
          type="button"
          className="ci-button"
          disabled={busy || rows.length < 100}
          onClick={() => onPage(filter.offset + 100)}
        >
          Seguinte
        </button>
      </div>
    </>
  );
}
