# Alterações - layout igual ao manual e filtro de descontos válidos

## Objetivo
Alinhar os PDFs gerados automaticamente e enviados por email com o ficheiro gerado manualmente na página **Etiquetas Campanha**.

## Referência visual usada
- `frommanual.pdf`: referência correta do layout manual.
- `etiquetas-valados-fwd-resumo-alteracoes_pv2_18-05-26.pdf`: PDF automático antigo, com layout diferente.

## Alterações feitas

### 1) Layout automático igual ao manual
Ficheiros alterados:
- `server/services/automatic-campaigns/labelHtmlService.js`
- `server/services/automatic-campaigns/pdfGeneratorService.js`

O PDF automático passa a usar o mesmo modelo visual do manual:
- cor laranja `#ec6707`, igual ao token `--color-primary` do site;
- moldura grossa laranja;
- barra superior laranja com logo;
- grelha A6 2x2;
- A5 com duas etiquetas por página e rotação igual à impressão manual;
- código, título, descrição, preços, código de barras, validade e nota posicionados como no manual;
- auto-fit de texto para descrições e preços.

### 2) Filtro profissional de descontos válidos
Ficheiros alterados:
- `server/services/automatic-campaigns/priceRulesService.js`
- `server/services/automatic-campaigns/automaticCampaignProcessor.js`

Nova regra:
- `preço atual = PVP2 ATUAL`;
- `preço referência = maior(PVP2 ANTES, PV3)`;
- só entra para PDF/email se `PVP2 ATUAL < preço referência`.

Ou seja:
- se `PVP2 ATUAL` for menor, imprime;
- se for igual, ignora;
- se for maior, ignora.

Isto evita etiquetas com `-0€` ou sem desconto real.

## Validação técnica
- `npm --prefix server run smoke` executado com sucesso.
- Testada a regra de filtro com casos de menor, igual e maior.

## Render
Não foram adicionadas novas variáveis de ambiente.
Mantêm-se as mesmas ENV atuais de IMAP, Resend e worker.
