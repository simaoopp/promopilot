import { useState } from "react";
import ResumoCard from "../common/ResumoCard";
import { TITULO_CAMPANHA_SEM_DATA_DEFINIDA } from "../../../utils/campaignTitleRules";

export default function ManualCampaignToolbar({
  titulo,
  setTitulo,
  campanhaSemDatas,
  anoValidade,
  setAnoValidade,
  formatoEtiqueta,
  setFormatoEtiqueta,
  modoFormatoAutomatico,
  setModoFormatoAutomatico,
  textoColado,
  setTextoColado,
  dataInicioGeral,
  dataFimGeral,
  atualizarDataGeral,
  carregarTextoColado,
  abrirPopupCriarCampanha,
  selecionarTodosFiltrados,
  desmarcarTodosFiltrados,
  limparSelecao,
  imprimirSelecionados,
  totalArtigos,
  totalFiltrados,
  totalSelecionados,
  modoImpressaoTexto,
  promocaoFontePreco,
  setPromocaoFontePreco,
}) {
  const [definicoesAbertas, setDefinicoesAbertas] = useState(false);

  return (
    <div className="control-card">
      <div className="toolbar-grid">
        <label className="input-group">
          <span>Título da campanha</span>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex: ASUS PROMO"
          />
          {campanhaSemDatas ? (
            <small>
              Regra ativa: campanhas “{TITULO_CAMPANHA_SEM_DATA_DEFINIDA}” são impressas sem campo de validade.
            </small>
          ) : null}
        </label>

        <div className="input-group">
          <span>Ano de validade / formato</span>

          <div className="ano-formato-row ano-formato-row-advanced">
            <input
              type="number"
              value={anoValidade}
              onChange={(e) => setAnoValidade(e.target.value)}
              placeholder="2026"
              disabled={campanhaSemDatas}
            />

            <button
              type="button"
              className="btn btn-secondary formato-btn"
              onClick={() =>
                setFormatoEtiqueta((prev) => (prev === "a6" ? "a5" : "a6"))
              }
              disabled={modoFormatoAutomatico}
              title={
                modoFormatoAutomatico
                  ? "Desativa o formato automático para alterar manualmente"
                  : "Alternar formato manual"
              }
            >
              Manual: {formatoEtiqueta.toUpperCase()}
            </button>

            <button
              type="button"
              className={`btn ${
                modoFormatoAutomatico ? "btn-primary" : "btn-secondary"
              } formato-btn`}
              onClick={() => setModoFormatoAutomatico((prev) => !prev)}
            >
              Automático: {modoFormatoAutomatico ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      </div>

      <div className="input-group">
        <span>Colar tabela recebida por email</span>
        <textarea
          className="paste-box"
          value={textoColado}
          onChange={(e) => setTextoColado(e.target.value)}
          placeholder="Cola aqui a tabela completa do email"
        />
      </div>

      <div className="settings-toggle-row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setDefinicoesAbertas((prev) => !prev)}
          aria-expanded={definicoesAbertas}
        >
          {definicoesAbertas ? "Fechar definições" : "Abrir definições"}
        </button>
      </div>

      {definicoesAbertas ? (
        <div className="campaign-settings-panel">
          {!campanhaSemDatas ? (
            <div className="toolbar-grid campaign-global-dates">
              <label className="input-group">
                <span>Data início geral</span>
                <input
                  type="date"
                  value={dataInicioGeral}
                  onChange={(e) => atualizarDataGeral("dataInicio", e.target.value)}
                />
                <small>Predefine a data de início para todos os artigos abaixo.</small>
              </label>

              <label className="input-group">
                <span>Data fim geral</span>
                <input
                  type="date"
                  value={dataFimGeral}
                  onChange={(e) => atualizarDataGeral("dataFim", e.target.value)}
                />
                <small>Se ficar vazio, mantém as datas do email ou o fallback de 30 dias.</small>
              </label>
            </div>
          ) : null}

          <div className="input-group promotion-price-source-group">
            <span>Preço usado na promoção/impressão</span>
            <div className="segmented-control" role="group" aria-label="Preço usado na promoção">
              <button
                type="button"
                className={`segmented-control-button ${promocaoFontePreco === "pvp2" ? "active" : ""}`}
                onClick={() => setPromocaoFontePreco("pvp2")}
              >
                Usar PVP2 para promoção
              </button>
              <button
                type="button"
                className={`segmented-control-button ${promocaoFontePreco === "pvp3" ? "active" : ""}`}
                onClick={() => setPromocaoFontePreco("pvp3")}
              >
                Usar PVP3 para promoção
              </button>
            </div>
            <small>Quando PVP3 não existir no artigo, a impressão mantém o PVP2 atual.</small>
          </div>
        </div>
      ) : null}

      <div className="toolbar-actions">
        <button type="button" className="btn btn-primary" onClick={carregarTextoColado}>
          Carregar tabela
        </button>

        <button type="button" className="btn btn-secondary" onClick={abrirPopupCriarCampanha}>
          Criar campanha
        </button>

        <button type="button" className="btn btn-secondary" onClick={selecionarTodosFiltrados}>
          Selecionar filtrados
        </button>

        <button type="button" className="btn btn-secondary" onClick={desmarcarTodosFiltrados}>
          Desmarcar filtrados
        </button>

        <button type="button" className="btn btn-secondary" onClick={limparSelecao}>
          Limpar seleção
        </button>

        <button type="button" className="btn btn-success" onClick={imprimirSelecionados}>
          Imprimir selecionados
        </button>
      </div>

      <div className="resumo-cards">
        <ResumoCard label="Total artigos" value={totalArtigos} />
        <ResumoCard label="Filtrados" value={totalFiltrados} />
        <ResumoCard label="Selecionados" value={totalSelecionados} />
        <ResumoCard label="Modo de impressão" value={modoImpressaoTexto} />
      </div>
    </div>
  );
}
