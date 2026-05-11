import FilterMenu from "../../../components/FilterMenu";
import SyncedHorizontalScroll from "../../../components/SyncedHorizontalScroll";
import { obterFormatoFinalEtiqueta } from "./excelCampaignUtils";

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

function ExcelTableRows({
  colunas,
  dadosFiltrados,
  alternarSelecionado,
  renderTableCell,
  formatoAutomaticoAtivo,
  formatoEtiqueta,
  emptyMessage,
  calculaFormatoPrevisto,
}) {
  if (dadosFiltrados.length === 0) {
    return (
      <tr>
        <td colSpan={colunas.length + 1} className="empty-cell">
          {emptyMessage}
        </td>
      </tr>
    );
  }

  return dadosFiltrados.map((item) => {
    const formatoPrevisto = calculaFormatoPrevisto
      ? obterFormatoFinalEtiqueta(item, formatoAutomaticoAtivo, formatoEtiqueta)
      : "";

    return (
      <tr
        key={`${colunas.length}-${item.id}`}
        className={item.selecionado ? "linha-selecionada" : ""}
        onClick={() => alternarSelecionado(item.id)}
      >
        <td className="col-select" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={!!item.selecionado} readOnly />
        </td>

        {colunas.map((col) => (
          <td key={`${item.id}-${col.key}`}>
            {renderTableCell(item, col, formatoPrevisto)}
          </td>
        ))}
      </tr>
    );
  });
}

function ExcelTable({
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
  renderTableCell,
  formatoAutomaticoAtivo,
  formatoEtiqueta,
  calculaFormatoPrevisto,
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
        <ExcelTableRows
          colunas={colunas}
          dadosFiltrados={dadosFiltrados}
          alternarSelecionado={alternarSelecionado}
          renderTableCell={renderTableCell}
          formatoAutomaticoAtivo={formatoAutomaticoAtivo}
          formatoEtiqueta={formatoEtiqueta}
          calculaFormatoPrevisto={calculaFormatoPrevisto}
          emptyMessage="Importa um ficheiro Excel para carregar os artigos."
        />
      </tbody>
    </table>
  );
}

export default function ExcelCampaignTable({
  mostrarTabelaCompleta,
  setMostrarTabelaCompleta,
  colunasTabelaAtivas,
  colunasResumoAtivas,
  dadosFiltrados,
  filtroAberto,
  setFiltroAberto,
  filtros,
  filterButtonRefs,
  atualizarFiltroPopup,
  setOrdenacao,
  limparFiltro,
  alternarSelecionado,
  renderTableCell,
  formatoAutomaticoAtivo,
  formatoEtiqueta,
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
    renderTableCell,
    formatoAutomaticoAtivo,
    formatoEtiqueta,
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
          <ExcelTable
            {...commonProps}
            colunas={colunasTabelaAtivas}
            tableClassName="full-table full-campaign-table"
            calculaFormatoPrevisto
          />
        </SyncedHorizontalScroll>
      ) : (
        <div className="table-panel table-panel-summary">
          <ExcelTable
            {...commonProps}
            colunas={colunasResumoAtivas}
            tableClassName="compact-table compact-campaign-table compact-campaign-table--summary"
            calculaFormatoPrevisto={false}
          />
        </div>
      )}
    </div>
  );
}
