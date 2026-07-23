# Fix Quote Dossier Customer RawText v6

## Confirmação no código

No ZIP enviado, o frontend está correto: ele usa `extractedDossier.customerName` para preencher o campo Cliente.

A rota backend também tenta usar:

```js
extractCustomerFromQuoteText(extracted.text)
```

O problema provável está no texto que chega a `extracted.text`.

## Causa provável

O `pdfTextService` usa texto por coordenadas para reconstruir a tabela de artigos. Isso é bom para os artigos, mas pode perder ou baralhar a zona do cliente.

No ORC original, o cliente correto aparece claramente como:

```text
VASCO OLIVEIRA MENDES
```

junto ao bloco `Exmo.(s) Sr.(s)`. fileciteturn38file1

Mas no PDF gerado o cliente continua como:

```text
Cliente —
```

fileciteturn40file0

## Correção

Este patch altera `pdfTextService.js` para devolver dois textos:

```text
text      -> texto por coordenadas, usado para artigos
rawText   -> texto bruto de pdf-parse, melhor para cliente/morada
combinedText -> junção dos dois para debug/fallback
```

Depois a rota procura o cliente em:

```js
extracted.text + extracted.rawText + extracted.combinedText
```

sem mudar o parser dos artigos.

## Aplicar no StackBlitz

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/fix-quote-dossier-customer-rawtext-v6.mjs
```

Validar:

```bash
cd server
node --check routes/quoteDossiers.js
node --check services/quote-dossiers/pdfTextService.js
```

Build:

```bash
cd ~/simaoopp/ETIQUETASPROM
npm run build
```

## Commit

```bash
git add scripts/maintenance/fix-quote-dossier-customer-rawtext-v6.mjs \
        docs/FIX_QUOTE_DOSSIER_CUSTOMER_RAWTEXT_V6.md \
        server/routes/quoteDossiers.js \
        server/services/quote-dossiers/pdfTextService.js

git commit -m "fix: use raw pdf text for quote customer extraction"
git push origin main
```

Depois redeploy do backend no Render.

## Depois do deploy

Voltar a carregar o PDF original e clicar em `Extrair orçamento`.

A resposta de `/extract` deve trazer:

```json
{
  "customerDebug": {
    "final": "VASCO OLIVEIRA MENDES",
    "hasRawText": true
  }
}
```

E o campo Cliente deve preencher antes de gerar o PDF.
