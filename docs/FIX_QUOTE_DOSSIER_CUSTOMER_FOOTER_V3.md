# Fix Quote Dossier Customer/Footer v3

## Problema

O cliente foi extraído como cabeçalho da tabela:

```text
V/N.º Contrib. Requisição Desc. Cli. Desc. Fin. Condição Pagamento Data Vencimento Entdade
```

mas no orçamento original o cliente correto é:

```text
VASCO OLIVEIRA MENDES
```

O PDF original mostra `VASCO OLIVEIRA MENDES` junto ao bloco `Exmo.(s) Sr.(s)`, enquanto o PDF gerado colocou o cabeçalho de tabela no campo Cliente. fileciteturn38file1 fileciteturn38file0

Também continuavam a aparecer páginas vazias: no PDF gerado, depois de cada página útil há páginas só com rodapé/número de página. fileciteturn38file0

## Correção

Este patch:

```text
- força o parser a rejeitar linhas de cabeçalho como cliente;
- procura primeiro o nome imediatamente antes de Exmo.(s) Sr.(s);
- mantém procura abaixo de Exmo.(s) Sr.(s) como fallback;
- move o rodapé para dentro da área imprimível do PDFKit;
- usa lineBreak:false no cabeçalho/rodapé para evitar páginas automáticas vazias.
```

## Aplicar no StackBlitz

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/fix-quote-dossier-customer-footer-v3.mjs
```

Validar:

```bash
cd server
node --check services/quote-dossiers/quoteDossierParser.js
node --check services/quote-dossiers/quoteDossierPdfService.js
```

Build:

```bash
cd ~/simaoopp/ETIQUETASPROM
npm run build
```

## Commit

```bash
git add scripts/maintenance/fix-quote-dossier-customer-footer-v3.mjs \
        docs/FIX_QUOTE_DOSSIER_CUSTOMER_FOOTER_V3.md \
        server/services/quote-dossiers/quoteDossierParser.js \
        server/services/quote-dossiers/quoteDossierPdfService.js

git commit -m "fix: correct quote dossier customer and footer"
git push origin main
```

Depois redeploy do backend no Render.

## Resultado esperado

```text
Cliente: VASCO OLIVEIRA MENDES
1 página de resumo + 1 página por equipamento
sem 2 páginas vazias por cada página útil
```
