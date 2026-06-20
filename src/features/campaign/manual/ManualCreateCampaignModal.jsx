import { formatarEuro } from "../../../utils/formatters";
import { formatarPvpTriplo, normalizarValorPvp } from "../../../utils/articlePrices";
import { obterFormatoAutomaticoEtiqueta } from "./manualCampaignUtils";

export default function ManualCreateCampaignModal({
  aberto,
  artigoCampanhaSelecionado,
  fecharPopupCriarCampanha,
  descontoCampanha,
  pesquisaCampanha,
  setPesquisaCampanha,
  catalogoLoading,
  catalogoErro,
  sugestoesCampanha,
  selecionarSugestaoCampanha,
  campanhaAntes,
  setCampanhaAntes,
  campanhaAtual,
  setCampanhaAtual,
  erroCampanha,
  campanhaSemDatas,
  campanhaValida30Dias,
  setCampanhaValida30Dias,
  campanhaDataInicio,
  setCampanhaDataInicio,
  campanhaDataFim,
  setCampanhaDataFim,
  estadoValidacaoCampanha,
  adicionarArtigoCampanha,
}) {
  if (!aberto) return null;

  return (
    <div className="popup-overlay">
      <div className="popup-card popup-card-campanha popup-card-campanha-pro">
        <div className="popup-header popup-header-campanha">
          <div>
            <div className="popup-eyebrow">Campanha manual</div>
            <h2>Criar campanha</h2>
            <p className="popup-subtitle">
              Pesquisa um artigo do catálogo. O preço antes passa a ser o PVP3 e o preço atual mantém o PVP2.
            </p>
          </div>

          <button type="button" className="popup-close" onClick={fecharPopupCriarCampanha}>
            ×
          </button>
        </div>

        <div className="popup-campanha-scroll">
          <div className="popup-status-row">
            <span className="popup-chip">
              {artigoCampanhaSelecionado ? "Artigo selecionado" : "Sem artigo selecionado"}
            </span>
            <span className="popup-chip popup-chip-ai">
              Desconto: {formatarEuro(descontoCampanha)}€
            </span>
          </div>

          <div className="campanha-layout">
            <div className="campanha-col-main">
              <div className="ai-card-panel">
                <div className="section-title-row">
                  <h3>Pesquisar artigo</h3>
                </div>

                <div className="input-group">
                  <span>Pesquisar por código interno, descrição ou EAN</span>
                  <input
                    type="text"
                    value={pesquisaCampanha}
                    onChange={(e) => setPesquisaCampanha(e.target.value)}
                    placeholder="Ex: frigorífico aeg, 5601234567890..."
                  />
                </div>

                {catalogoLoading ? (
                  <p className="empty-state-text">A carregar catálogo de artigos...</p>
                ) : catalogoErro ? (
                  <p className="campanha-erro">{catalogoErro}</p>
                ) : sugestoesCampanha.length > 0 ? (
                  <div className="campanha-sugestoes">
                    {sugestoesCampanha.map((item, index) => {
                      const ativo = artigoCampanhaSelecionado?.artigo === item.artigo;

                      return (
                        <button
                          key={`${item.artigo}-${index}`}
                          type="button"
                          className={`campanha-sugestao ${ativo ? "ativa" : ""}`}
                          onClick={() => selecionarSugestaoCampanha(item)}
                        >
                          <div className="campanha-sugestao-top">
                            <strong>{item.artigo}</strong>
                            <span className="campanha-tag">{formatarPvpTriplo(item)}</span>
                          </div>

                          <span>{item.descricao}</span>
                          <small>EAN: {item.codigoBarras || "-"}</small>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty-state-text">
                    Escreve pelo menos 2 caracteres para pesquisar artigos.
                  </p>
                )}
              </div>

              <div className="campanha-stack">
                <div className="ai-card-panel">
                  <div className="section-title-row">
                    <h3>Preços da campanha</h3>
                  </div>

                  <div className="campanha-precos-grid">
                    <label className="input-group">
                      <span>PVP3 antes</span>
                      <input
                        type="text"
                        value={campanhaAntes}
                        onChange={(e) => setCampanhaAntes(e.target.value)}
                        placeholder="Ex: 799,99"
                      />
                    </label>

                    <label className="input-group">
                      <span>PVP2 atual</span>
                      <input
                        type="text"
                        value={campanhaAtual}
                        onChange={(e) => setCampanhaAtual(e.target.value)}
                        placeholder="Ex: 699,99"
                      />
                    </label>

                    <div className="campanha-desconto-box">
                      <span>Desconto calculado</span>
                      <strong>{formatarEuro(descontoCampanha)}€</strong>
                    </div>
                  </div>

                  {erroCampanha && <p className="campanha-erro">{erroCampanha}</p>}
                </div>

                {!campanhaSemDatas ? (
                  <div className="ai-card-panel">
                    <div className="section-title-row">
                      <h3>Validade da campanha</h3>
                    </div>

                    <label className="campanha-check-row">
                      <input
                        type="checkbox"
                        checked={campanhaValida30Dias}
                        onChange={(e) => setCampanhaValida30Dias(e.target.checked)}
                      />
                      <span>Campanha válida para 30 dias</span>
                    </label>

                    {!campanhaValida30Dias && (
                      <div className="campanha-datas-grid">
                        <label className="input-group">
                          <span>Data de início</span>
                          <input
                            type="date"
                            value={campanhaDataInicio}
                            onChange={(e) => setCampanhaDataInicio(e.target.value)}
                          />
                        </label>

                        <label className="input-group">
                          <span>Data de fim</span>
                          <input
                            type="date"
                            value={campanhaDataFim}
                            onChange={(e) => setCampanhaDataFim(e.target.value)}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="campanha-col-side">
              <div className="ai-card-panel campanha-resumo-panel">
                <div className="section-title-row">
                  <h3>Resumo do artigo</h3>
                </div>

                {artigoCampanhaSelecionado ? (
                  <>
                    <div className="campanha-resumo">
                      <div className="campanha-resumo-item">
                        <span>Artigo</span>
                        <strong>{artigoCampanhaSelecionado.artigo}</strong>
                      </div>

                      <div className="campanha-resumo-item">
                        <span>EAN</span>
                        <strong>{artigoCampanhaSelecionado.codigoBarras || "-"}</strong>
                      </div>

                      <div className="campanha-resumo-item campanha-resumo-item-full">
                        <span>Descrição</span>
                        <strong>{artigoCampanhaSelecionado.descricao}</strong>
                      </div>

                      <div className="campanha-resumo-item">
                        <span>PVP1 base</span>
                        <strong>{normalizarValorPvp(artigoCampanhaSelecionado.pvp1)}</strong>
                      </div>

                      <div className="campanha-resumo-item">
                        <span>PVP2 base</span>
                        <strong>{normalizarValorPvp(artigoCampanhaSelecionado.pvp2)}</strong>
                      </div>

                      <div className="campanha-resumo-item">
                        <span>PVP3 base</span>
                        <strong>{normalizarValorPvp(artigoCampanhaSelecionado.pvp3)}</strong>
                      </div>

                      <div className="campanha-resumo-item">
                        <span>Formato auto</span>
                        <strong>
                          {obterFormatoAutomaticoEtiqueta(artigoCampanhaSelecionado.descricao).toUpperCase()}
                        </strong>
                      </div>
                    </div>

                    <div className="campanha-highlight-box">
                      <span>Validação</span>
                      <strong>{estadoValidacaoCampanha}</strong>
                    </div>
                  </>
                ) : (
                  <p className="empty-state-text">
                    Seleciona um artigo à esquerda para veres o resumo antes de o adicionares à campanha.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="popup-actions popup-actions-pro popup-actions-campanha">
          <button
            type="button"
            className="btn btn-primary"
            onClick={adicionarArtigoCampanha}
            disabled={!artigoCampanhaSelecionado || !!erroCampanha}
          >
            Adicionar à campanha
          </button>

          <button type="button" className="btn btn-secondary" onClick={fecharPopupCriarCampanha}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
