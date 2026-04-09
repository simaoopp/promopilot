import { useEffect, useRef } from "react";

export default function FilterMenu({
  coluna,
  tipo = "text",
  aberto,
  filtro = {},
  onClose,
  onUpdate,
  onSort,
  onClear,
}) {
  const popupRef = useRef(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose?.();
      }

      if (e.key === "Enter") {
        onClose?.();
      }
    }

    function handleClickOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [aberto, onClose]);

  if (!aberto) return null;

  const contains = filtro.contains || "";
  const equals = filtro.equals || "";
  const op = filtro.op || "";
  const valor = filtro.valor || "";

  function renderSortButtons(labels = ["asc", "desc"]) {
    return (
      <div className="filter-section">
        <button type="button" onClick={() => onSort?.("asc")}>
          {labels[0]}
        </button>
        <button type="button" onClick={() => onSort?.("desc")}>
          {labels[1]}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={popupRef}
      className="filter-popup"
      role="dialog"
      aria-modal="false"
      aria-label={`Filtro da coluna ${coluna}`}
    >
      <div className="filter-popup-header">
        <strong>{coluna}</strong>
        <button
          type="button"
          className="filter-close"
          onClick={onClose}
          aria-label={`Fechar filtro da coluna ${coluna}`}
        >
          ×
        </button>
      </div>

      {tipo === "text" && (
        <>
          {renderSortButtons(["Ordenar A → Z", "Ordenar Z → A"])}

          <div className="filter-section">
            <label htmlFor={`filter-contains-${coluna}`}>Contém</label>
            <input
              id={`filter-contains-${coluna}`}
              ref={firstInputRef}
              type="text"
              value={contains}
              placeholder="Texto a procurar"
              onChange={(e) => onUpdate?.("contains", e.target.value)}
            />
          </div>

          <div className="filter-section">
            <label htmlFor={`filter-equals-${coluna}`}>Igual a</label>
            <input
              id={`filter-equals-${coluna}`}
              type="text"
              value={equals}
              placeholder="Valor exato"
              onChange={(e) => onUpdate?.("equals", e.target.value)}
            />
          </div>
        </>
      )}

      {tipo === "number" && (
        <>
          {renderSortButtons(["Ordem crescente", "Ordem decrescente"])}

          <div className="filter-section">
            <label htmlFor={`filter-op-${coluna}`}>Operador</label>
            <select
              id={`filter-op-${coluna}`}
              ref={firstInputRef}
              value={op}
              onChange={(e) => onUpdate?.("op", e.target.value)}
            >
              <option value="">-</option>
              <option value="=">=</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
            </select>
          </div>

          <div className="filter-section">
            <label htmlFor={`filter-value-${coluna}`}>Valor</label>
            <input
              id={`filter-value-${coluna}`}
              type="number"
              value={valor}
              placeholder="Introduz um número"
              onChange={(e) => onUpdate?.("valor", e.target.value)}
            />
          </div>
        </>
      )}

      <div className="filter-section">
        <button type="button" onClick={onClear}>
          Limpar filtro
        </button>
      </div>
    </div>
  );
}