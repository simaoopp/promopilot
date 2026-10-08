const ESTADOS = {
  valido: "Válido", bloqueado: "Bloqueado", duplicado: "Duplicado",
  naoEncontrado: "Não encontrado", erro: "Não foi possível validar",
};

export default function CampaignReview({
  resultado, titulo = "Validar artigos da campanha", onConfirm, onCancel,
  modal = false, concluido = false, substituiTabela = false,
}) {
  if (!resultado) return null;
  const content = <>
    <h2>{titulo}</h2>
    <div className="popup-status-row" role="status" aria-live="polite">
      {Object.entries(ESTADOS).map(([estado, label]) => (
        <span className="popup-chip" key={estado}>{label}: {resultado.totais[estado] || 0}</span>
      ))}
    </div>
    <p>Confirma os motivos antes de continuar. Só os artigos válidos serão adicionados.</p>
    {substituiTabela && <p>A importação confirmada substitui a tabela atual. Cancelar mantém os dados existentes.</p>}
    <div style={{ overflow: "auto", maxHeight: "45vh" }}>
      <table className="campaign-review-table" style={{ width: "100%", textAlign: "left" }}>
        <thead><tr><th>Código</th><th>Estado</th><th>Motivo e origem</th></tr></thead>
        <tbody>{resultado.linhas.map((linha, index) => {
          const origem = linha.item?.origemDados;
          return <tr key={`${linha.codigo}-${index}`}>
            <td style={{ padding: "8px", verticalAlign: "top" }}>
              <strong>{linha.codigo || "Sem código"}</strong><br />{linha.item?.descricao}
            </td>
            <td style={{ padding: "8px", verticalAlign: "top" }}>{ESTADOS[linha.estado]}</td>
            <td style={{ padding: "8px", verticalAlign: "top" }}>
              {linha.motivo}
              {origem && <details>
                <summary>Ver informação original</summary>
                <p>{origem.tipo === "excel" ? "Excel" : origem.tipo === "email" ? "Email / tabela colada" : "Catálogo"}
                  {origem.ficheiro ? ` · ${origem.ficheiro}` : ""}
                  {origem.folha ? ` · ${origem.folha}` : ""}
                  {origem.linha ? ` · linha ${origem.linha}` : ""}</p>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {origem.informacao || "A origem não fornece informação sobre atualização/reposição de PVP. A validação só pode usar os dados disponíveis."}
                </p>
              </details>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="popup-actions">
      <button type="button" className="btn btn-primary" disabled={concluido || !resultado.validos.length} onClick={onConfirm}>
        {concluido ? "Artigos adicionados" : `Adicionar ${resultado.validos.length} artigo(s) válido(s)`}
      </button>
      {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>}
    </div>
  </>;
  return modal ? <div className="popup-overlay">
    <section className="popup-card popup-card-campanha" role="dialog" aria-modal="true" aria-label={titulo}>
      {content}
    </section>
  </div> : <section aria-label={titulo}>{content}</section>;
}
