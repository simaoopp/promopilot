import FilterMenu from "../../../components/FilterMenu";
import SyncedHorizontalScroll from "../../../components/SyncedHorizontalScroll";
import { PRIMARY_TABLE_COLUMNS, TABLE_COLUMNS } from "../../../data/tableColumns";

function FilterHeader({
  col,
  filtroAberto,
  setFiltroAberto,
  filtros,
  filterButtonRefs,
  atualizarFiltroPopup,
  setOrdenacao,
  limparFiltro,
}) {
  if (!col.tipo) return col.label;

  return (
    <>
      <button
        type="button"
        ref={(node) => {
          filterButtonRefs.current[col.key] = node;
        }}
        className="filter-button"
        aria-expanded={filtroAberto === col.key}
        onClick={() => setFiltroAberto(filtroAberto === col.key ? null : col.key)}
      >
        {col.label}
      </button>

      <FilterMenu
        coluna={col.label}
        tipo={col.tipo}
        aberto={filtroAberto === col.key}
        filtro={filtros[col.key]}
        anchorEl={filterButtonRefs.current[col.key]}
        onClose={() => setFiltroAberto(null)}
        onUpdate={(chave, valor) => atualizarFiltroPopup(col.key, chave, valor)}
        onSort={(direcao) => setOrdenacao({ coluna: col.key, direcao })}
        onClear={() => limparFiltro(col.key, col.tipo)}
      />
    </>
  );
}

function CampaignRows({ dadosFiltrados, colunas, alternarSelecionado, renderTabelaCampanhaCell }) {
  if (dadosFiltrados.length === 0) {
    return (
      <tr>
        <td colSpan={colunas.length + 1} className="empty-cell">
          Cola a tabela do email e carrega em “Carregar tabela”.
        </td>
      </tr>
    );
  }

  return dadosFiltrados.map((item) => (
    <tr
      key={`${colunas.length}-${item.id}`}
      className={item.selecionado ? "linha-selecionada" : ""}
      onClick={() => alternarSelecionado(item.id)}
    >
      <td className="col-select" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={!!item.selecionado}
          onChange={() => alternarSelecionado(item.id)}
        />
      </td>

      {colunas.map((col) => (
        <td key={`${item.id}-${col.key}`}>{renderTabelaCampanhaCell(item, col)}</td>
      ))}
    </tr>
  ));
}

function CampaignTable({
  colunas,
  tableClassName,
  dadosFiltrados,
  filtroAberto,
  setFiltroAberto,
  filtros,
  filterButtonRefs,
  atualizarFiltroPopup,
  setOrdenacao,
  limparFiltro,
  alternarSelecionado,
  renderTabelaCampanhaCell,
}) {
  return (
    <table className={tableClassName}>
      <thead>
        <tr>
          <th>Selecionar</th>
          {colunas.map((col) => (
            <th key={col.key} className={col.tipo ? "filter-th" : undefined}>
              <FilterHeader
                col={col}
                filtroAberto={filtroAberto}
                setFiltroAberto={setFiltroAberto}
                filtros={filtros}
                filterButtonRefs={filterButtonRefs}
                atualizarFiltroPopup={atualizarFiltroPopup}
                setOrdenacao={setOrdenacao}
                limparFiltro={limparFiltro}
              />
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        <CampaignRows
          dadosFiltrados={dadosFiltrados}
          colunas={colunas}
          alternarSelecionado={alternarSelecionado}
          renderTabelaCampanhaCell={renderTabelaCampanhaCell}
        />
      </tbody>
    </table>
  );
}

export default function ManualCampaignTable({
  mostrarTabelaCompleta,
  setMostrarTabelaCompleta,
  dadosFiltrados,
  filtroAberto,
  setFiltroAberto,
  filtros,
  filterButtonRefs,
  atualizarFiltroPopup,
  setOrdenacao,
  limparFiltro,
  alternarSelecionado,
  renderTabelaCampanhaCell,
}) {
  const commonProps = {
    dadosFiltrados,
    filtroAberto,
    setFiltroAberto,
    filtros,
    filterButtonRefs,
    atualizarFiltroPopup,
    setOrdenacao,
    limparFiltro,
    alternarSelecionado,
    renderTabelaCampanhaCell,
  };

  return (
    <div className="table-card">
      <div className="table-card-header table-card-header-inline">
        <h2>{mostrarTabelaCompleta ? "Tabela completa" : "Lista de artigos"}</h2>

        <button
          type="button"
          className={`btn ${mostrarTabelaCompleta ? "btn-secondary" : "btn-primary"}`}
          onClick={() => setMostrarTabelaCompleta((prev) => !prev)}
        >
          {mostrarTabelaCompleta ? "Ver tabela simples" : "Abrir tabela completa"}
        </button>
      </div>

      {mostrarTabelaCompleta ? (
        <SyncedHorizontalScroll className="table-panel table-panel-complete">
          <CampaignTable
            {...commonProps}
            colunas={TABLE_COLUMNS}
            tableClassName="full-table full-campaign-table"
          />
        </SyncedHorizontalScroll>
      ) : (
        <div className="table-panel table-panel-summary">
          <CampaignTable
            {...commonProps}
            colunas={PRIMARY_TABLE_COLUMNS}
            tableClassName="compact-table compact-campaign-table compact-campaign-table--summary"
          />
        </div>
      )}
    </div>
  );
}
