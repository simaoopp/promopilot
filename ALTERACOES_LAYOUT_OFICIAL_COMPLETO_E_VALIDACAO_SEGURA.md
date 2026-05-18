# Alterações – etiqueta automática alinhada ao motor real de Etiquetas Campanha

## Objetivo
Fazer com que o PDF automático enviado por email use a mesma base técnica das etiquetas da página **Etiquetas Campanha**, incluindo estrutura HTML, CSS, auto-ajuste de texto, EAN sem número visível e validação protegida dos preços.

## Referências replicadas

### Frontend / página Etiquetas Campanha
- `src/components/campaign/CampaignLabel.jsx`
- `src/components/Barcode.jsx`
- `src/features/campaign/manual/ManualCampaignPrintArea.jsx`
- `src/features/campaign/manual/manualCampaignUtils.js`
- `src/utils/useAutoFontSize.js`
- `src/utils/promotionPricing.js`
- `src/utils/campaignTitleRules.js`
- `src/styles/tokens.css`
- `src/styles/print.css`

## Ficheiros alterados

### `server/services/automatic-campaigns/labelHtmlService.js`
- Passou a gerar a mesma árvore HTML usada pelas etiquetas da página manual:
  - `.print-area`
  - `.sheet.sheet-a6`
  - `.sheet.sheet-a5`
  - `.label.label-a6`
  - `.label.label-a5`
  - `.label-a5-rotator`
  - `.label-inner`
  - `.topbar`
  - `.content`
  - `.topo`
  - `.precos`
  - `.rodape`
- Passou a carregar diretamente:
  - `src/styles/tokens.css`
  - `src/styles/print.css`
- Força a cor principal da etiqueta para `#ec6707`.
- Força fundo branco nas etiquetas/folhas.
- Replicou a lógica do `useAutoFontSize` no browser/Playwright, com proteção extra contra sobreposição entre topo, preços e rodapé.
- Replicou a lógica de validade da página manual.
- Replicou a lógica de preços promocionais para impressão.

### `server/services/automatic-campaigns/ean13Svg.js`
- O EAN passa a ser gerado com geometria compatível com o `Barcode.jsx`:
  - EAN13
  - `height=20`
  - `width=1`
  - `margin=0`
  - número escondido por defeito
- O SVG já não imprime o número por baixo, igual ao componente React `Barcode` com `showValue=false`.

### `server/services/automatic-campaigns/priceRulesService.js`
- Adicionada validação protegida de preço:
  - rejeita EAN como preço
  - rejeita código de artigo como preço
  - rejeita números contínuos muito longos
  - rejeita preços fora de intervalo razoável
  - rejeita valores sem formato de preço válido
- Mantém a regra:
  - `preço referência = maior(PVP2 ANTES, PV3)`
  - `preço promoção = PVP2 ATUAL`
  - só imprime se `PVP2 ATUAL < preço referência`

### `server/services/automatic-campaigns/campaignEmailParser.js`
- Passou a usar a validação protegida de preços.
- Reforço para impedir que campos como EAN, código de artigo ou números deslocados sejam usados como PVP.

## Resultado
- PDF automático mais fiel à etiqueta manual.
- Cor principal correta: `#ec6707`.
- EAN sem número visível, como no frontend.
- Auto-ajuste de texto aplicado a descrição, preço antigo, desconto e preço atual.
- Maior proteção contra parsing errado de preços.
- Evita etiquetas sem desconto e evita etiquetas com EAN no lugar do preço.

## Variáveis Render
Não há novas ENV obrigatórias.
Mantém `CAMPAIGN_PDF_ALLOW_APPROX_FALLBACK` ausente ou `0`, para impedir fallback visual aproximado.
