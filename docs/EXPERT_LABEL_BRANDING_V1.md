# Expert Label Branding V1

## Objetivo

Voltar a separar a identidade visual das etiquetas da identidade global do PromoPilot.

## O que este patch faz

- repõe o logótipo **Expert** nas etiquetas de campanha;
- mantém a cor principal das etiquetas em **#ec6707**;
- evita que a troca do `src/logo.png` para PromoPilot altere também as etiquetas;
- aplica a correção tanto no preview do frontend como na geração HTML/PDF do backend.

## Ficheiros alterados

- `src/assets/expert-label-logo.png`
- `src/components/campaign/CampaignLabel.jsx`
- `server/services/automatic-campaigns/labelHtmlService.js`
- `server/services/automatic-campaigns/pdfGeneratorService.js`
