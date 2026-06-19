# Fix Quote Dossier Customer/CORS v4

## Problemas

O PDF já deixou de sair partido, mas:

```text
Cliente ainda aparece como —
```

No orçamento original, o cliente correto é:

```text
VASCO OLIVEIRA MENDES
```

junto ao bloco `Exmo.(s) Sr.(s)`. fileciteturn38file1

Também surgiram erros no browser:

```text
No 'Access-Control-Allow-Origin' header...
502 Bad Gateway
```

Isto costuma ser sintoma de erro/crash no backend ou resposta do gateway Render, não um problema real de CORS quando a app Express está viva.

## Correção

Este patch:

```text
- cria quoteDossierCustomerService.js;
- extrai cliente de forma robusta;
- rejeita cabeçalhos como V/N.º Contrib. / Requisição / Condição Pagamento;
- reescreve routes/quoteDossiers.js em modo manual v4;
- devolve erros JSON controlados sempre que possível;
- mantém sem IA/Serper/web;
- mantém pronto pagamento fora das observações.
```

## Aplicar no StackBlitz

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/fix-quote-dossier-customer-cors-v4.mjs
```

Validar:

```bash
cd server
node --check routes/quoteDossiers.js
node --check services/quote-dossiers/quoteDossierCustomerService.js
```

Build:

```bash
cd ~/simaoopp/ETIQUETASPROM
npm run build
```

## Commit

```bash
git add scripts/maintenance/fix-quote-dossier-customer-cors-v4.mjs \
        docs/FIX_QUOTE_DOSSIER_CUSTOMER_CORS_V4.md \
        server/routes/quoteDossiers.js \
        server/services/quote-dossiers/quoteDossierCustomerService.js

git commit -m "fix: robust manual quote dossier customer extraction"
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
  "version": "quote-dossier-manual-runtime-v4",
  "mode": "manual"
}
```

## Validação esperada

Recarregar o orçamento original e clicar novamente em `Extrair orçamento`.

Resultado esperado:

```text
Cliente: VASCO OLIVEIRA MENDES
Observações: Instalação incluída.
PDF: 4 páginas, sem páginas vazias.
```

Importante: depois do deploy, é necessário clicar novamente em `Extrair orçamento`, porque o PDF gerado usa o cliente que ficou no estado do formulário.
