# Fix Quote Dossier Customer v5

## Problema

O PDF final já está com 4 páginas e sem páginas vazias, mas o cliente continua como:

```text
Cliente —
```

No orçamento original, o cliente correto é:

```text
VASCO OLIVEIRA MENDES
```

junto ao bloco `Exmo.(s) Sr.(s)`. fileciteturn38file1

## Causa provável

O parser ainda está a devolver cliente vazio ou inválido, e a rota está a usar esse valor antes do fallback robusto.

## Correção

Este patch:

```text
- reescreve quoteDossierCustomerService.js;
- dá prioridade ao nome junto de Exmo.(s) Sr.(s);
- rejeita cabeçalhos como V/N.º Contrib., Requisição, Desc. Cli., Condição Pagamento;
- força a rota a usar primeiro extractCustomerFromQuoteText(extracted.text);
- adiciona fallback também dentro do parser.
```

## Aplicar no StackBlitz

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/fix-quote-dossier-customer-v5.mjs
```

Validar:

```bash
cd server
node --check routes/quoteDossiers.js
node --check services/quote-dossiers/quoteDossierCustomerService.js
node --check services/quote-dossiers/quoteDossierParser.js
```

Build:

```bash
cd ~/simaoopp/ETIQUETASPROM
npm run build
```

## Commit

```bash
git add scripts/maintenance/fix-quote-dossier-customer-v5.mjs \
        docs/FIX_QUOTE_DOSSIER_CUSTOMER_V5.md \
        server/routes/quoteDossiers.js \
        server/services/quote-dossiers/quoteDossierCustomerService.js \
        server/services/quote-dossiers/quoteDossierParser.js

git commit -m "fix: prioritize quote customer extraction"
git push origin main
```

Depois redeploy do backend no Render.

## Depois do deploy

Na página:

```text
/OrcamentosDossiers
```

faz obrigatoriamente:

```text
1. escolher novamente o ORC original;
2. clicar em Extrair orçamento;
3. confirmar que o campo Cliente mostra VASCO OLIVEIRA MENDES;
4. só depois gerar o PDF.
```

O PDF enviado ainda mostra cliente vazio, mas a paginação já ficou correta com 4 páginas. fileciteturn40file0
