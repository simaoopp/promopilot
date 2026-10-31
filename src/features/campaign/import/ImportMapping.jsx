import React, { useState } from "react";
import {
  FIELDS,
  headersFor,
  templateCompatible,
  validateConfig,
} from "../../../shared/campaign-import/model.js";

export function ImportInterpret({
  book,
  config,
  setConfig,
  onSheet,
  templates,
  onTemplate,
}) {
  const sheet =
    book.sheets.find((s) => s.name === config.sheet) || book.sheets[0];
  const compatible = templates.filter((t) =>
    templateCompatible(t, sheet, book.type),
  );
  return (
    <>
      <div className="ci-inline">
        <label>
          Folha / tabela
          <select
            value={sheet.name}
            onChange={(event) => onSheet(event.target.value)}
          >
            {book.sheets.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        <label>
          Primeiro cabeçalho
          <input
            type="number"
            min="1"
            max={sheet.rows.length}
            value={config.headerStart + 1}
            onChange={(event) =>
              setConfig({
                ...config,
                headerStart: Number(event.target.value) - 1,
              })
            }
          />
        </label>
        <label>
          Linhas de cabeçalho
          <select
            value={config.headerCount}
            onChange={(event) =>
              setConfig({ ...config, headerCount: Number(event.target.value) })
            }
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Sem cabeçalho" : n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dados a partir da linha
          <input
            type="number"
            min="1"
            max={sheet.rows.length}
            value={config.dataStart + 1}
            onChange={(event) =>
              setConfig({
                ...config,
                dataStart: Number(event.target.value) - 1,
              })
            }
          />
        </label>
      </div>
      <p className="ci-note">
        {sheet.rows.length} linhas ·{" "}
        {Math.max(...sheet.rows.map((r) => r.length))} colunas. Títulos, totais
        e observações podem ser excluídos na revisão.
      </p>
      <div className="ci-table-scroll">
        <table>
          <caption>Primeiras 12 linhas — confirme a posição dos dados</caption>
          <thead>
            <tr>
              <th>Linha</th>
              {headersFor(sheet, { ...config, headerCount: 0 }).map(
                (label, i) => (
                  <th key={i}>{label}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.slice(0, 12).map((row, i) => (
              <tr
                key={i}
                className={i < config.dataStart ? "ci-muted-row" : ""}
              >
                <th>{i + 1}</th>
                {row.map((value, j) => (
                  <td key={j}>{value || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {compatible.length > 0 && (
        <div className="ci-callout">
          <strong>Modelos com a mesma estrutura</strong>
          {compatible.map((t) => (
            <button
              type="button"
              className="ci-button"
              key={t.id}
              onClick={() => onTemplate(t)}
            >
              {t.supplier} · {t.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function ImportMapping({
  sheet,
  config,
  setConfig,
  confidence,
  selected,
  onSave,
  busy,
}) {
  const [supplier, setSupplier] = useState(selected?.supplier || ""),
    [name, setName] = useState(selected?.name || "");
  const [tested, setTested] = useState("");
  const headers = headersFor(sheet, config);
  const change = (patch) => {
    setTested("");
    setConfig({ ...config, ...patch });
  };
  return (
    <>
      <div className="ci-callout">
        <strong>PVP2 Antes vem do seu catálogo.</strong>
        <span>
          Escolha o preço promocional. A importação não altera os preços do
          catálogo.
        </span>
      </div>
      <div className="ci-mapping-grid">
        {Object.entries(FIELDS).map(([field, label]) => (
          <label key={field}>
            {label}
            <select
              disabled={field === "promo" && config.manualPrice}
              value={config.mapping[field] ?? ""}
              onChange={(event) => {
                const mapping = { ...config.mapping };
                if (event.target.value === "") delete mapping[field];
                else mapping[field] = Number(event.target.value);
                change({ mapping, priceConfirmed: false });
              }}
            >
              <option value="">Não associar</option>
              {headers.map((h, index) => (
                <option key={index} value={index}>
                  {index + 1}. {h || "(sem título)"} ·{" "}
                  {sheet.rows[config.dataStart]?.[index] || "—"}
                </option>
              ))}
            </select>
            {confidence[field] && (
              <small>
                Sugestão: confiança {confidence[field]}. Confirme com a tabela.
              </small>
            )}
          </label>
        ))}
      </div>
      <div className="ci-inline">
        <label>
          Formato monetário
          <select
            value={config.locale}
            onChange={(event) =>
              change({ locale: event.target.value, priceConfirmed: false })
            }
          >
            <option value="auto">Detetar; rever valores ambíguos</option>
            <option value="pt">Português · 1.234,56</option>
            <option value="en">Internacional · 1,234.56</option>
          </select>
        </label>
        <label className="ci-check">
          <input
            type="checkbox"
            checked={!!config.manualPrice}
            onChange={(event) => {
              const mapping = { ...config.mapping };
              if (event.target.checked) delete mapping.promo;
              change({
                manualPrice: event.target.checked,
                mapping,
                priceConfirmed: false,
              });
            }}
          />
          Introduzir os preços manualmente na revisão
        </label>
      </div>
      <div className="ci-inline">
        <label>
          Início da campanha
          <input
            type="date"
            value={config.startDate}
            onChange={(event) => change({ startDate: event.target.value })}
          />
        </label>
        <label>
          Fim da campanha
          <input
            type="date"
            value={config.endDate}
            min={config.startDate}
            onChange={(event) => change({ endDate: event.target.value })}
          />
        </label>
        <small>
          Datas da tabela, quando associadas, substituem estas datas.
        </small>
      </div>
      <label className="ci-check ci-price-confirm">
        <input
          type="checkbox"
          checked={config.priceConfirmed}
          onChange={(event) => change({ priceConfirmed: event.target.checked })}
        />
        Confirmo que PVP2 Agora é o preço promocional que pretendo aplicar.
      </label>
      <details className="ci-template">
        <summary>Guardar, editar ou duplicar modelo do fornecedor</summary>
        <div className="ci-inline">
          <label>
            Fornecedor
            <input
              value={supplier}
              maxLength={120}
              onChange={(event) => setSupplier(event.target.value)}
            />
          </label>
          <label>
            Nome do modelo
            <input
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>
        <div className="ci-inline">
          <button
            type="button"
            className="ci-button"
            disabled={busy}
            onClick={() => {
              try {
                validateConfig(config);
                setTested(
                  `Estrutura válida: ${headers.length} colunas, ${sheet.rows.length - config.dataStart} linhas. Os artigos e preços serão verificados no passo seguinte.`,
                );
              } catch (error) {
                setTested(error.message);
              }
            }}
          >
            Testar modelo
          </button>
          <button
            type="button"
            className="ci-button"
            disabled={busy || !supplier.trim() || !name.trim()}
            onClick={() =>
              onSave({
                supplier: supplier.trim(),
                name: name.trim(),
                config: { ...config, headers },
                ...(selected
                  ? { id: selected.id, version: selected.version }
                  : {}),
              })
            }
          >
            {selected ? "Guardar nova versão" : "Guardar modelo"}
          </button>
          {selected && (
            <button
              type="button"
              className="ci-button"
              disabled={busy || !supplier.trim() || !name.trim()}
              onClick={() =>
                onSave({
                  supplier: supplier.trim(),
                  name: `${name.trim()} (cópia)`,
                  config: { ...config, headers },
                })
              }
            >
              Duplicar modelo
            </button>
          )}
        </div>
        {tested && <p role="status">{tested}</p>}
        {selected && (
          <small>
            Versão {selected.version} ·{" "}
            {new Date(selected.updated_at).toLocaleDateString("pt-PT")}
          </small>
        )}
      </details>
    </>
  );
}
