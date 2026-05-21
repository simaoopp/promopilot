# Alterações – motor partilhado das etiquetas de campanha

## Objetivo
Eliminar divergências entre a etiqueta manual da página **Etiquetas Campanha** e a etiqueta automática enviada por email.

A solução agora centraliza as regras críticas num módulo partilhado, usado pelo frontend e pelo backend.

## Novo módulo partilhado

Criado em:

```txt
src/shared/campaign-label/
```

Ficheiros adicionados:

```txt
formatters.js
campaignTitleRules.js
promotionPricing.js
formatRules.js
autoFontRules.js
barcodeRules.js
validity.js
labelConstants.js
index.js
package.json
```

## O que ficou partilhado

### Formatação e parsing

```txt
parseNumero
formatarEuro
normalizarTexto
```

### Preços promocionais

```txt
ajustarPrecoPromocionalParaImpressao
formatarEuroPromocional
preço antes
preço atual
desconto real
validação contra EAN no lugar de preço
```

### Modo automático A5/A6

```txt
obterFormatoAutomaticoEtiqueta
obterFormatoEtiquetaItem
buildAutomaticPrintPages
buildManualCampaignPrintPages
```

### Auto ajuste de texto

```txt
getCampaignLabelAutoFontRange
fitTextElement
buildCampaignAutoFontBrowserScript
```

A etiqueta manual continua a usar React Hook, mas o cálculo base vem do mesmo módulo.
A etiqueta automática usa o script equivalente antes do Playwright gerar o PDF.

### Código de barras

```txt
BARCODE_RENDER_DEFAULTS
normalizeEan13
buildEan13Bits
```

Configuração igual à etiqueta manual:

```txt
EAN13
displayValue=false
height=20
width=1
margin=0
```

### Validade

```txt
obterTextoValidade
campanhaSemDataDefinida
```

### Cor oficial

```txt
EXPERT_ORANGE=#ec6707
```

## Frontend alterado

```txt
src/utils/formatters.js
src/utils/promotionPricing.js
src/utils/campaignTitleRules.js
src/utils/useAutoFontSize.js
src/components/Barcode.jsx
src/features/campaign/manual/manualCampaignUtils.js
```

Estes ficheiros agora usam/reexportam o módulo partilhado.

## Backend alterado

```txt
server/services/automatic-campaigns/numberUtils.js
server/services/automatic-campaigns/formatRulesService.js
server/services/automatic-campaigns/priceRulesService.js
server/services/automatic-campaigns/ean13Svg.js
server/services/automatic-campaigns/labelHtmlService.js
```

O PDF automático agora usa as mesmas regras base da etiqueta manual.

## Proteções adicionadas

- não imprime artigos sem desconto real;
- não aceita EAN como preço;
- não aceita código de artigo como preço;
- não aceita números longos contínuos como preço;
- não imprime `-0€`;
- esconde o número do EAN, como no componente manual;
- força a cor `#ec6707` e fundo branco no PDF automático;
- não usa fallback aproximado salvo se explicitamente ativado.

## Validação

Executado:

```bash
npm --prefix server run smoke
```

Resultado: passou.
