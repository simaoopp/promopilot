export default function FilterMenu({
  coluna,
  tipo = "text",
  aberto,
  filtro,
  onClose,
  onUpdate,
  onSort,
  onClear,
}) {
  if (!aberto) return null;

  return (
    <div className="filter-popup">
      <div className="filter-popup-header">
        <strong>{coluna}</strong>
        <button type="button" className="filter-close" onClick={onClose}>
          ×
        </button>
      </div>

      {tipo === "text" && (
        <>
          <div className="filter-section">
            <button type="button" onClick={() => onSort("asc")}>
              Ordenar A → Z
            </button>
            <button type="button" onClick={() => onSort("desc")}>
              Ordenar Z → A
            </button>
          </div>

          <div className="filter-section">
            <label>Contém</label>
            <input
              type="text"
              value={filtro?.contains || ""}
              onChange={(e) => onUpdate("contains", e.target.value)}
            />
          </div>

          <div className="filter-section">
            <label>Igual a</label>
            <input
              type="text"
              value={filtro?.equals || ""}
              onChange={(e) => onUpdate("equals", e.target.value)}
            />
          </div>
        </>
      )}

      {tipo === "number" && (
        <>
          <div className="filter-section">
            <button type="button" onClick={() => onSort("asc")}>
              Ordem crescente
            </button>
            <button type="button" onClick={() => onSort("desc")}>
              Ordem decrescente
            </button>
          </div>

          <div className="filter-section">
            <label>Operador</label>
            <select
              value={filtro?.op || ""}
              onChange={(e) => onUpdate("op", e.target.value)}
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
            <label>Valor</label>
            <input
              type="number"
              value={filtro?.valor || ""}
              onChange={(e) => onUpdate("valor", e.target.value)}
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
