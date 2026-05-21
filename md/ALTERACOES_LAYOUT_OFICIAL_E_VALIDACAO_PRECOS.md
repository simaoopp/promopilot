# Alterações — layout oficial das Etiquetas Campanha e validação protegida

## Objetivo
Garantir que as etiquetas automáticas geradas em PDF e enviadas por email usam o mesmo HTML/CSS base da página **Etiquetas Campanha** e que só entram artigos com desconto real e preços corretamente identificados.

## Alterações principais

### 1. Layout oficial reutilizado no backend
Ficheiro alterado:

- `server/services/automatic-campaigns/labelHtmlService.js`

O backend deixou de usar CSS manual aproximado e passou a carregar diretamente:

- `src/styles/tokens.css`
- `src/styles/print.css`

A estrutura HTML gerada no backend foi alinhada com o componente usado na página manual:

- `src/components/campaign/CampaignLabel.jsx`
- `src/features/campaign/manual/ManualCampaignPrintArea.jsx`

Isto garante que o PDF automático usa as mesmas classes e estrutura:

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

### 2. Geração de PDF exige Playwright para estilo exato
Ficheiro alterado:

- `server/services/automatic-campaigns/pdfGeneratorService.js`

O PDF oficial passa a ser gerado por Playwright, renderizando o mesmo HTML/CSS das etiquetas.

Para evitar enviar PDFs com visual errado, o fallback aproximado por PDFKit só é usado se esta ENV for ativada explicitamente:

```env
CAMPAIGN_PDF_ALLOW_APPROX_FALLBACK=1
```

Por defeito, se o Playwright/Chromium falhar, o processamento grava erro em vez de enviar um PDF diferente do layout oficial.

### 3. Código de barras igual ao frontend
Ficheiro alterado:

- `server/services/automatic-campaigns/ean13Svg.js`

O SVG do EAN deixou de imprimir o valor numérico por baixo por defeito, aproximando o comportamento do componente React `Barcode.jsx`, que usa `showValue=false`.

### 4. Parser protegido contra colunas desalinhadas
Ficheiro alterado:

- `server/services/automatic-campaigns/campaignEmailParser.js`

O parser deixou de depender apenas de posições fixas. Agora identifica cada linha por estrutura:

1. código de artigo válido;
2. EAN válido;
3. tripla de preços válida logo após o EAN;
4. sequência protegida de lojas `AE`, `AEA`, `AEV`, `A10`, `A1E`;
5. datas e informação da campanha.

Proteções adicionadas:

- rejeita EAN usado como preço;
- rejeita código de artigo usado como preço;
- rejeita preços absurdamente altos;
- rejeita linhas sem descrição válida;
- rejeita linhas sem sequência de lojas válida;
- rejeita linhas com preços inválidos.

### 5. Só imprime artigos com desconto real
Ficheiro alterado:

- `server/services/automatic-campaigns/priceRulesService.js`

Regra final:

```txt
preço atual = PVP2 ATUAL
preço referência = maior(PVP2 ANTES, PV3)

entra no PDF apenas se:
PVP2 ATUAL < preço referência
```

Casos ignorados:

- preço atual igual ao preço referência;
- preço atual maior que o preço referência;
- preços inválidos;
- EAN ou outros números longos interpretados como preço.

## Validação técnica
Executado:

```bash
npm --prefix server run smoke
```

Resultado: passou.
