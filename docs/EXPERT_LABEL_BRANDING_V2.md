# Expert Label Branding V2

## Objetivo

Manter a aplicação com identidade PromoPilot, mas garantir que as etiquetas de campanha continuam com a identidade antiga **Expert**.

## Decisão de produto

- Interface/app: PromoPilot
- Etiquetas promocionais: Expert
- Cor oficial das etiquetas: `#ec6707`

## O que este patch corrige

- O preview das etiquetas deixa de usar o logo PromoPilot.
- As etiquetas A6 usam novamente o logo Expert, centrado e bem proporcionado.
- As etiquetas A5 usam o logo Expert com proporção própria para o formato maior.
- A geração automática por backend/HTML/PDF usa o logo Expert.
- O fallback PDFKit também desenha faixa laranja `#ec6707` e logo Expert.

## Ficheiros alterados

- `src/assets/expert-label-logo.png`
- `src/components/campaign/CampaignLabel.jsx`
- `src/styles/print.css`
- `server/services/automatic-campaigns/labelHtmlService.js`
- `server/services/automatic-campaigns/pdfGeneratorService.js`

## Validar

1. Criar uma campanha manual.
2. Ver preview A6.
3. Ver preview A5.
4. Imprimir/gerar PDF.
5. Confirmar:
   - faixa laranja `#ec6707`
   - logo Expert
   - sem logo PromoPilot nas etiquetas
   - PromoPilot continua apenas na app/login/topbar/sidebar
