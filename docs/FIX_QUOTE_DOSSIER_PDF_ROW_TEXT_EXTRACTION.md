# Fix Quote Dossier PDF Row Text Extraction

## Problema

O orçamento já extrai dados principais, mas continua com:

```text
0 equipamento(s)
```

E no Render aparecem warnings:

```text
Warning: TT: undefined function: 32
```

## Causa provável

O warning `TT: undefined function: 32` vem do motor PDF/pdf.js usado por `pdf-parse`. Normalmente não é fatal.

O problema real é que `pdf-parse` pode devolver a tabela Primavera em ordem de colunas ou com quebras diferentes. Assim, o parser recebe texto desordenado e não consegue reconstruir as linhas dos artigos.

## Correção

Este patch altera:

```text
server/services/quote-dossiers/pdfTextService.js
```

para tentar primeiro uma extração por posições com o `pdf.js` embutido no `pdf-parse`.

A nova extração:

```text
1. lê os itens de texto com coordenadas X/Y;
2. agrupa por linhas;
3. ordena de cima para baixo e da esquerda para a direita;
4. gera texto mais parecido com a tabela visual do PDF;
5. mantém fallback para pdf-parse.
```

## Aplicar

Na raiz:

```powershell
node scripts/maintenance/fix-quote-dossier-pdf-row-text-extraction.mjs
```

Validar backend:

```powershell
cd server
node --check services/quote-dossiers/pdfTextService.js
npm start
```

Depois recarregar o PDF na página `/OrcamentosDossiers`.

## Render

Depois do commit/push, fazer redeploy do backend no Render.

Manter envs:

```text
JSON_BODY_LIMIT=80mb
URLENCODED_BODY_LIMIT=80mb
```

## Resultado esperado

Para `FSilva 11853.pdf`:

```text
Equipamentos: 8
Total: 9 139,92
```

## Commit recomendado

```powershell
git add scripts/maintenance/fix-quote-dossier-pdf-row-text-extraction.mjs `
        docs/FIX_QUOTE_DOSSIER_PDF_ROW_TEXT_EXTRACTION.md `
        server/services/quote-dossiers/pdfTextService.js

git commit -m "fix: extract quote pdf text by row positions"
git push origin main
```
