import React, { useEffect, useRef } from "react";
import { useCampaignImport } from "./useCampaignImport";
import ImportSource from "./ImportSource";
import { ImportInterpret, ImportMapping } from "./ImportMapping";
import ImportReview from "./ImportReview";
const STEPS = [
  "Adicionar tabela",
  "Interpretar",
  "Associar campos",
  "Rever promoções",
  "Adicionar à campanha",
];
export default function CampaignImportDialog({ existing, onAdd, onClose }) {
  const {
    step,
    busy,
    error,
    notice,
    progress,
    book,
    config,
    setConfig,
    confidence,
    templates,
    selected,
    sessions,
    review,
    readyItems,
    filter,
    sheet,
    isResuming,
    readSource,
    applyTemplate,
    mapFields,
    prepare,
    resume,
    edit,
    finalize,
    selectSheet,
    saveTemplate,
    excludeInvalid,
    changeFilter,
    changePage,
    refreshReview,
    resetResume,
    back,
  } = useCampaignImport({ existing, onClose });
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  const keyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
    if (event.key !== "Tab") return;
    const nodes = [
      ...dialog.current.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary",
      ),
    ].filter((node) => node.getClientRects().length);
    const first = nodes[0],
      last = nodes[nodes.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  return (
    <div className="ci-overlay">
      <section
        className="ci-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ci-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={keyDown}
      >
        <header className="ci-header">
          <div>
            <span className="ci-eyebrow">TABELAS COMERCIAIS</span>
            <h2 id="ci-title">Importar para a campanha</h2>
          </div>
          <button
            type="button"
            className="ci-close"
            aria-label="Fechar importador"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <ol className="ci-steps">
          {STEPS.map((title, index) => (
            <li
              key={title}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {title}
            </li>
          ))}
        </ol>
        <div className="ci-body" aria-busy={busy}>
          {error && (
            <div className="ci-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <p className="ci-notice" role="status">
              {notice}
            </p>
          )}
          {progress && <p role="status">{progress}</p>}
          {step === 1 && isResuming && (
            <button
              type="button"
              className="ci-button"
              disabled={busy}
              onClick={resetResume}
            >
              Iniciar outra importação
            </button>
          )}
          <fieldset disabled={busy} className="ci-fields">
            {step === 1 && (
              <ImportSource
                busy={busy}
                onRead={readSource}
                templates={templates}
                selected={selected}
                onTemplate={applyTemplate}
                sessions={sessions}
                onResume={resume}
              />
            )}
            {step === 2 && book && (
              <ImportInterpret
                book={book}
                config={config}
                setConfig={setConfig}
                onSheet={selectSheet}
                templates={templates}
                onTemplate={applyTemplate}
              />
            )}
            {step === 3 && sheet && (
              <ImportMapping
                key={selected?.id || "new"}
                sheet={sheet}
                config={config}
                setConfig={setConfig}
                confidence={confidence}
                selected={selected}
                busy={busy}
                onSave={saveTemplate}
              />
            )}
            {step === 4 && review && (
              <ImportReview
                review={review}
                busy={busy}
                filter={filter}
                onEdit={edit}
                onFilter={changeFilter}
                onPage={changePage}
                onExclude={excludeInvalid}
              />
            )}
            {step === 5 && (
              <div className="ci-finish">
                <span aria-hidden="true">✓</span>
                <h3>{readyItems.length} artigos prontos</h3>
                <p>
                  Os preços anteriores e a referência à origem ficam guardados
                  nos artigos da campanha.
                </p>
                <p>
                  Continue no ecrã da campanha para rever as etiquetas e guardar
                  ou imprimir.
                </p>
              </div>
            )}
          </fieldset>
        </div>
        <footer className="ci-footer">
          <span>{busy ? "A processar…" : `Passo ${step} de 5`}</span>
          <div className="ci-inline">
            {(step === 2 || step === 3) && !isResuming && (
              <button
                type="button"
                className="ci-button"
                disabled={busy}
                onClick={back}
              >
                Voltar
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                className="ci-button ci-primary"
                disabled={busy}
                onClick={mapFields}
              >
                Associar campos
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                className="ci-button ci-primary"
                disabled={busy}
                onClick={prepare}
              >
                {isResuming
                  ? "Retomar processamento"
                  : "Obter preços do catálogo"}
              </button>
            )}
            {step === 4 && (
              <>
                <button
                  type="button"
                  className="ci-button"
                  disabled={busy}
                  onClick={refreshReview}
                >
                  Atualizar revisão
                </button>
                <button
                  type="button"
                  className="ci-button ci-primary"
                  disabled={
                    busy ||
                    !review?.counts.valid ||
                    Object.entries(review?.counts || {}).some(
                      ([state, count]) =>
                        !["valid", "ignored"].includes(state) && count > 0,
                    )
                  }
                  onClick={finalize}
                >
                  Validar e continuar
                </button>
              </>
            )}
            {step === 5 && (
              <button
                type="button"
                className="ci-button ci-primary"
                disabled={!readyItems.length || busy}
                onClick={() => {
                  onAdd(readyItems);
                  onClose();
                }}
              >
                Adicionar {readyItems.length} artigos
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
