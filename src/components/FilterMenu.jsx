import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const POPUP_WIDTH = 280;
const VIEWPORT_GUTTER = 12;

export default function FilterMenu({
  coluna,
  tipo = "text",
  aberto,
  filtro = {},
  anchorEl,
  onClose,
  onUpdate,
  onSort,
  onClear,
}) {
  const popupRef = useRef(null);
  const firstInputRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: POPUP_WIDTH });

  const popupId = useMemo(
    () => `filter-popup-${String(coluna || "coluna").toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
    [coluna],
  );

  useEffect(() => {
    if (!aberto) return undefined;

    function updatePosition() {
      if (!anchorEl) return;

      const rect = anchorEl.getBoundingClientRect();
      const preferredLeft = rect.left;
      const maxLeft = window.innerWidth - POPUP_WIDTH - VIEWPORT_GUTTER;
      const nextLeft = Math.min(Math.max(VIEWPORT_GUTTER, preferredLeft), Math.max(VIEWPORT_GUTTER, maxLeft));

      setPosition({
        top: rect.bottom + 8,
        left: nextLeft,
        width: POPUP_WIDTH,
      });
    }

    function handleKeyDown(e) {
      if (e.key === "Escape" || e.key === "Enter") {
        onClose?.();
      }
    }

    function handleClickOutside(e) {
      const clickedInsidePopup = popupRef.current?.contains(e.target);
      const clickedAnchor = anchorEl?.contains?.(e.target);

      if (!clickedInsidePopup && !clickedAnchor) {
        onClose?.();
      }
    }

    updatePosition();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handleClickOutside);

    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [aberto, anchorEl, onClose]);

  if (!aberto) return null;

  const contains = filtro.contains || "";
  const equals = filtro.equals || "";
  const op = filtro.op || "";
  const valor = filtro.valor || "";

  function renderSortButtons(labels = ["asc", "desc"]) {
    return (
      <div className="filter-section filter-section-sort">
        <button type="button" onClick={() => onSort?.("asc")}>
          {labels[0]}
        </button>
        <button type="button" onClick={() => onSort?.("desc")}>
          {labels[1]}
        </button>
      </div>
    );
  }

  return createPortal(
    <div
      ref={popupRef}
      id={popupId}
      className="filter-popup"
      role="dialog"
      aria-modal="false"
      aria-label={`Filtro da coluna ${coluna}`}
      style={{ top: `${position.top}px`, left: `${position.left}px`, width: `${position.width}px` }}
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

      <div className="filter-section filter-section-actions">
        <button type="button" onClick={onClear}>
          Limpar filtro
        </button>
      </div>
    </div>,
    document.body,
  );
}
