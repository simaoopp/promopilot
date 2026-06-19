# Quote Dossier Manual Runtime v7

## Decisão sénior

Este patch deixa de fazer micro-ajustes no nome do cliente.

Ele reescreve de forma integral a parte crítica do runtime dos dossiers:

```text
1. pdfTextService.js
2. quoteDossierCustomerService.js
3. quoteDossiers.js
4. fallback no quoteDossierParser.js
```

## Problema confirmado

No PDF gerado, o cliente continua vazio:

```text
Cliente —
```

fileciteturn40file0

Mas no ORC original, o cliente correto é:

```text
VASCO OLIVEIRA MENDES
```

junto ao bloco `Exmo.(s) Sr.(s)`. fileciteturn38file1

## Causa técnica

O módulo usava um só texto para tudo.

Mas num PDF Primavera:

```text
- texto por coordenadas é melhor para artigos;
- texto bruto é melhor para cabeçalhos/cliente/morada;
- spatial rows são melhores para o bloco Exmo.(s) Sr.(s).
```

## Correção v7

Agora o backend extrai e usa:

```text
text              -> texto por coordenadas para artigos
rawText           -> texto bruto pdf-parse para cliente
combinedText      -> junção de ambos
customerCandidate -> cliente extraído por posição espacial junto ao Exmo.(s) Sr.(s)
```

A rota resolve o cliente por esta ordem:

```text
1. customerCandidate espacial
2. extractCustomerFromQuoteText(rawText + combinedText + text)
3. parsedDossier.customerName validado
```

## Manual puro

Mantém a decisão atual:

```text
- sem IA;
- sem Serper;
- sem pesquisa web;
- artigos, EAN, referência, quantidade e valores vêm do ORC;
- foto, descrição e características são preenchidas manualmente pelo utilizador.
```

## Aplicar no StackBlitz

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/apply-quote-dossier-manual-runtime-v7.mjs
```

Validar sintaxe:

```bash
cd server
node --check routes/quoteDossiers.js
node --check services/quote-dossiers/quoteDossierCustomerService.js
node --check services/quote-dossiers/pdfTextService.js
node --check services/quote-dossiers/quoteDossierParser.js
```

Validar build:

```bash
cd ~/simaoopp/ETIQUETASPROM
npm run build
```

## Teste local antes do commit

Se tiveres o PDF no StackBlitz:

```bash
node scripts/maintenance/test-quote-dossier-v7.mjs "ORC EXP1E 11797.pdf"
```

Esperado:

```json
{
  "finalCustomer": "VASCO OLIVEIRA MENDES",
  "budgetNumber": "ORC.EXP1E/11797",
  "items": 3
}
```

## Commit

```bash
git add scripts/maintenance/apply-quote-dossier-manual-runtime-v7.mjs \
        scripts/maintenance/test-quote-dossier-v7.mjs \
        docs/QUOTE_DOSSIER_MANUAL_RUNTIME_V7.md \
        server/routes/quoteDossiers.js \
        server/services/quote-dossiers/quoteDossierCustomerService.js \
        server/services/quote-dossiers/pdfTextService.js \
        server/services/quote-dossiers/quoteDossierParser.js

git commit -m "fix: harden manual quote dossier runtime"
git push origin main
```

Depois redeploy do backend no Render.

## Prova de deploy

```text
https://etiquetasprom.onrender.com/api/orcamentos-dossiers/version
```

Esperado:

```json
{
  "version": "quote-dossier-manual-runtime-v7",
  "mode": "manual"
}
```

Depois voltar a carregar o ORC original e clicar em `Extrair orçamento`.
