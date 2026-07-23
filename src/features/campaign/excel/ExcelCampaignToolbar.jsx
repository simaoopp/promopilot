import { useState } from "react";
import ResumoCard from "../common/ResumoCard";
import { TITULO_CAMPANHA_SEM_DATA_DEFINIDA } from "../../../utils/campaignTitleRules";
import { EXCEL_FORMATS, isFormatoCampanhaComDatas, obterDescricaoFormatoExcel } from "./excelCampaignUtils";

export default function ExcelCampaignToolbar({
  titulo,
  setTitulo,
  campanhaSemDatas,
  anoValidade,
  setAnoValidade,
  formatoEtiqueta,
  setFormatoEtiqueta,
  formatoAutomaticoAtivo,
  setFormatoAutomaticoAtivo,
  carregarExcel,
  nomeFicheiro,
  loading,
  modeloImportado,
  dadosTotal,
  dataInicioCampanhaGeral,
  dataFimCampanhaGeral,
  atualizarDataGeralCampanha,
  dataInicioShopping,
  dataFimShopping,
  atualizarDatasShopping,
  filtradosTotal,
  selecionadosTotal,
  selecionarTodosFiltrados,
  desmarcarTodosFiltrados,
  limparSelecao,
  imprimirSelecionados,
  promocaoFontePreco,
  setPromocaoFontePreco,
}) {
  const [definicoesAbertas, setDefinicoesAbertas] = useState(false);
  const mostraDatasCampanha =
    !campanhaSemDatas && isFormatoCampanhaComDatas(modeloImportado) && dadosTotal > 0;
  const mostraDatasShopping =
    !campanhaSemDatas && modeloImportado === EXCEL_FORMATS.SHOPPING && dadosTotal > 0;

  return (
    <div className="control-card">
      <div className="toolbar-grid">
        <label className="input-group">
          <span>Título da campanha</span>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex: ASUS PROMO / SHOPPING"
          />
          {campanhaSemDatas ? (
            <small>
              Regra ativa: campanhas “{TITULO_CAMPANHA_SEM_DATA_DEFINIDA}” são impressas sem campo de validade.
            </small>
          ) : null}
        </label>

        <div className="input-group">
          <span>Ano de validade</span>
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
              onClick={() => setFormatoEtiqueta((prev) => (prev === "a6" ? "a5" : "a6"))}
              disabled={formatoAutomaticoAtivo}
            >
              Formato manual: {formatoEtiqueta.toUpperCase()}
            </button>

            <button
              type="button"
              className={`btn ${formatoAutomaticoAtivo ? "btn-primary" : "btn-secondary"} formato-btn`}
              onClick={() => setFormatoAutomaticoAtivo((prev) => !prev)}
            >
              Automático: {formatoAutomaticoAtivo ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      </div>

      <div className="input-group">
        <span>Importar ficheiro Excel</span>
        <input type="file" accept=".xlsx,.xls,.xlsb,.csv,.ods" onChange={carregarExcel} />
        {nomeFicheiro ? <small>Ficheiro: {nomeFicheiro}</small> : null}
        {loading ? <small>A carregar Excel...</small> : null}
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
          {mostraDatasCampanha ? (
            <div className="toolbar-grid campaign-global-dates">
              <label className="input-group">
                <span>Data início geral</span>
                <input
                  type="date"
                  value={dataInicioCampanhaGeral}
                  onChange={(e) => atualizarDataGeralCampanha("dataInicio", e.target.value)}
                />
                <small>Predefine a data de início para todos os artigos abaixo.</small>
              </label>

              <label className="input-group">
                <span>Data fim geral</span>
                <input
                  type="date"
                  value={dataFimCampanhaGeral}
                  onChange={(e) => atualizarDataGeralCampanha("dataFim", e.target.value)}
                />
                <small>Se ficar vazio, mantém as datas do Excel ou o fallback de 30 dias.</small>
              </label>
            </div>
          ) : null}

          {mostraDatasShopping ? (
            <div className="toolbar-grid">
              <label className="input-group">
                <span>Data início Shopping</span>
                <input
                  type="date"
                  value={dataInicioShopping}
                  onChange={(e) => atualizarDatasShopping("dataInicio", e.target.value)}
                />
              </label>

              <label className="input-group">
                <span>Data fim Shopping</span>
                <input
                  type="date"
                  value={dataFimShopping}
                  onChange={(e) => atualizarDatasShopping("dataFim", e.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="input-group promotion-price-source-group">
            <span>Preço sem promoção usado na impressão</span>
            <div className="segmented-control" role="group" aria-label="Preço sem promoção usado na impressão">
              <button
                type="button"
                className={`segmented-control-button ${promocaoFontePreco === "pvp2" ? "active" : ""}`}
                onClick={() => setPromocaoFontePreco("pvp2")}
              >
                Usar PVP2 como preço sem promoção
              </button>
              <button
                type="button"
                className={`segmented-control-button ${promocaoFontePreco === "pvp3" ? "active" : ""}`}
                onClick={() => setPromocaoFontePreco("pvp3")}
              >
                Usar PVP3 como preço sem promoção
              </button>
            </div>
            <small>O preço de promoção mantém sempre o PVP ATUAL; esta opção só muda o preço sem promoção nos artigos de campanha.</small>
          </div>
        </div>
      ) : null}

      <div className="resumo-cards">
        <ResumoCard
          label="Formato detetado"
          value={obterDescricaoFormatoExcel(modeloImportado)}
        />
        <ResumoCard label="Total artigos" value={dadosTotal} />
        <ResumoCard label="Filtrados" value={filtradosTotal} />
        <ResumoCard label="Selecionados" value={selecionadosTotal} />
        <ResumoCard label="Modo formato" value={formatoAutomaticoAtivo ? "Automático" : "Manual"} />
      </div>

      <div className="toolbar-actions">
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
    </div>
  );
}
