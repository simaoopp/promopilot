import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const POPUP_WIDTH = 280;
const VIEWPORT_GUTTER = 12;
const POPUP_OFFSET = 8;
const MIN_POPUP_HEIGHT = 180;
const IDEAL_POPUP_HEIGHT = 320;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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
  const deferredListenerRef = useRef(null);
  const [position, setPosition] = useState({
    top: VIEWPORT_GUTTER,
    left: VIEWPORT_GUTTER,
    width: POPUP_WIDTH,
    maxHeight: IDEAL_POPUP_HEIGHT,
  });

  const popupId = useMemo(
    () => `filter-popup-${String(coluna || "coluna").toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
    [coluna],
  );

  useEffect(() => {
    if (!aberto) return undefined;

    function updatePosition() {
      if (!anchorEl) return;

      const rect = anchorEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(POPUP_WIDTH, viewportWidth - VIEWPORT_GUTTER * 2);
      const left = clamp(
        rect.left,
        VIEWPORT_GUTTER,
        Math.max(VIEWPORT_GUTTER, viewportWidth - width - VIEWPORT_GUTTER),
      );

      const popupHeight = popupRef.current?.offsetHeight || IDEAL_POPUP_HEIGHT;
      const availableBelow = Math.max(
        MIN_POPUP_HEIGHT,
        viewportHeight - rect.bottom - POPUP_OFFSET - VIEWPORT_GUTTER,
      );
      const availableAbove = Math.max(
        MIN_POPUP_HEIGHT,
        rect.top - POPUP_OFFSET - VIEWPORT_GUTTER,
      );

      const shouldOpenAbove =
        availableBelow < Math.min(popupHeight, IDEAL_POPUP_HEIGHT) &&
        availableAbove > availableBelow;

      const maxHeight = shouldOpenAbove ? availableAbove : availableBelow;
      const estimatedHeight = Math.min(popupHeight, maxHeight);
      const top = shouldOpenAbove
        ? Math.max(VIEWPORT_GUTTER, rect.top - POPUP_OFFSET - estimatedHeight)
        : Math.min(
            rect.bottom + POPUP_OFFSET,
            Math.max(VIEWPORT_GUTTER, viewportHeight - VIEWPORT_GUTTER - estimatedHeight),
          );

      setPosition({
        top,
        left,
        width,
        maxHeight,
      });
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose?.();
      }
    }

    function handlePointerDown(e) {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      const clickedInsidePopup = popupRef.current && (path.includes(popupRef.current) || popupRef.current.contains(e.target));
      const clickedAnchor = anchorEl && (path.includes(anchorEl) || anchorEl.contains?.(e.target));

      if (!clickedInsidePopup && !clickedAnchor) {
        onClose?.();
      }
    }

    updatePosition();
    const rafId = window.requestAnimationFrame(() => {
      updatePosition();
      deferredListenerRef.current = handlePointerDown;
      document.addEventListener("pointerdown", handlePointerDown);
    });

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const resizeObserver =
      typeof ResizeObserver !== "undefined" && popupRef.current
        ? new ResizeObserver(() => updatePosition())
        : null;

    resizeObserver?.observe(popupRef.current);

    const focusId = window.requestAnimationFrame(() => {
      firstInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.cancelAnimationFrame(focusId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      if (deferredListenerRef.current) {
        document.removeEventListener("pointerdown", deferredListenerRef.current);
        deferredListenerRef.current = null;
      }
      resizeObserver?.disconnect();
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
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
      }}
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
