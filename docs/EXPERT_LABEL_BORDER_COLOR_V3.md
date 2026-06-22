# Expert Label Border Color V3

## Objetivo

Corrigir as bordas/molduras das etiquetas que ainda ficaram verdes depois da remodelação PromoPilot.

## Cor correta

```text
#ec6707
```

## O que altera

- `src/styles/print.css`
- `server/services/automatic-campaigns/labelHtmlService.js`
- `server/services/automatic-campaigns/pdfGeneratorService.js`

## Corrige

- moldura A6
- moldura A5
- linha divisória/corte A5
- faixa superior
- fallback PDFKit no backend

## Validar

1. Abrir campanha manual.
2. Ver etiqueta A6: borda laranja `#ec6707`.
3. Ver etiqueta A5: borda laranja `#ec6707`.
4. Gerar/imprimir PDF.
5. Confirmar que não existe verde nas etiquetas.
