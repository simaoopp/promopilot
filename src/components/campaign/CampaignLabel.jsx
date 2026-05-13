import React from "react";
import Barcode from "../Barcode";
import logo from "../../logo.png";
import { formatarEuro, parseNumero } from "../../utils/formatters";
import { formatarEuroPromocional, ajustarPrecoPromocionalParaImpressao } from "../../utils/promotionPricing";
import { useAutoFontSize } from "../../utils/useAutoFontSize";

export const DEFAULT_PROMOTION_NOTE =
  "VÁLIDO ENQUANTO DURAR O STOCK. Limitado ao stock existente e não acumulável com outras promoções.";

function AutoText({ texto, className, min, max, style = {} }) {
  const autoFont = useAutoFontSize(texto, min, max);

  return (
    <div
      ref={autoFont.ref}
      className={className}
      style={{
        width: "100%",
        fontSize: `${autoFont.fontSize}px`,
        ...style,
      }}
    >
      {texto}
    </div>
  );
}

function DescricaoAuto({ texto, formatoEtiqueta }) {
  return (
    <AutoText
      texto={texto}
      className="descricao"
      min={formatoEtiqueta === "a5" ? 24 : 12}
      max={formatoEtiqueta === "a5" ? 38 : 18}
    />
  );
}

function PrecoAntesAuto({ valor, formatoEtiqueta }) {
  return (
    <AutoText
      texto={`${formatarEuroPromocional(valor)}€`}
      className="antes"
      min={formatoEtiqueta === "a5" ? 44 : 38}
      max={formatoEtiqueta === "a5" ? 54 : 46}
    />
  );
}

function DescontoAuto({ valor, formatoEtiqueta }) {
  return (
    <AutoText
      texto={`-${formatarEuro(valor)}€`}
      className="desconto"
      min={formatoEtiqueta === "a5" ? 48 : 40}
      max={formatoEtiqueta === "a5" ? 60 : 50}
    />
  );
}

function PrecoAtualAuto({ valor, formatoEtiqueta }) {
  return (
    <AutoText
      texto={`${formatarEuroPromocional(valor)}€`}
      className="atual"
      min={formatoEtiqueta === "a5" ? 62 : 48}
      max={formatoEtiqueta === "a5" ? 88 : 68}
    />
  );
}

function CampaignLabelContent({
  item,
  formatoAtual,
  titulo,
  textoValidade,
  showShoppingIndicator = false,
  shoppingIndicatorClass = "",
  note = DEFAULT_PROMOTION_NOTE,
}) {
  const precoAntesImpressao = ajustarPrecoPromocionalParaImpressao(item?.antes);
  const precoAtualImpressao = ajustarPrecoPromocionalParaImpressao(item?.atual);
  const desconto = Math.max(0, parseNumero(precoAntesImpressao) - parseNumero(precoAtualImpressao));
  const mostrarValidade = Boolean(String(textoValidade || "").trim());
  const mostrarRodapeExtra = mostrarValidade || showShoppingIndicator;

  return (
    <div className="label-inner">
      <div className="topbar">
        <img src={logo} alt="Expert" className="print-logo" />
      </div>

      <div className="content">
        <div className="topo">
          <div className="codigo">{item?.codigo}</div>
          <div className="titulo">{titulo}</div>
          <DescricaoAuto texto={item?.descricao} formatoEtiqueta={formatoAtual} />
        </div>

        <div className="precos">
          <div className="linha-preco">
            <PrecoAntesAuto valor={item?.antes} formatoEtiqueta={formatoAtual} />
          </div>

          <div className="linha-preco desconto-linha">
            <DescontoAuto valor={desconto} formatoEtiqueta={formatoAtual} />
          </div>

          <div className="linha-preco">
            <PrecoAtualAuto valor={item?.atual} formatoEtiqueta={formatoAtual} />
          </div>
        </div>

        <div className="rodape">
          <Barcode value={item?.ean} />

          {mostrarRodapeExtra ? (
            <div className="validade-row">
              {mostrarValidade ? <div className="validade">{textoValidade}</div> : null}
              {showShoppingIndicator ? (
                <span
                  className={`shopping-price-dot ${shoppingIndicatorClass}`.trim()}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          ) : null}

          <div className="nota">{note}</div>
        </div>
      </div>
    </div>
  );
}

export function CampaignLabel(props) {
  const { formatoAtual } = props;
  const etiquetaClassName = `label ${formatoAtual === "a5" ? "label-a5" : "label-a6"}`;

  if (formatoAtual === "a5") {
    return (
      <div className={etiquetaClassName}>
        <div className="label-a5-rotator">
          <CampaignLabelContent {...props} />
        </div>
      </div>
    );
  }

  return (
    <div className={etiquetaClassName}>
      <CampaignLabelContent {...props} />
    </div>
  );
}

export function renderCampaignLabel(item, formatoAtual, options = {}) {
  return (
    <CampaignLabel
      key={item?.id || `${item?.codigo || "item"}-${formatoAtual}`}
      item={item}
      formatoAtual={formatoAtual}
      titulo={options.titulo || ""}
      textoValidade={options.textoValidade || ""}
      showShoppingIndicator={Boolean(options.showShoppingIndicator)}
      shoppingIndicatorClass={options.shoppingIndicatorClass || ""}
      note={options.note || DEFAULT_PROMOTION_NOTE}
    />
  );
}
