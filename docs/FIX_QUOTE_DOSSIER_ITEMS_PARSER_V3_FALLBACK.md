# Fix Quote Dossier Items Parser v3 — Fallback por EAN

## Problema

O orçamento já extrai:

```text
Cliente correto
Data correta
Total correto
```

mas continua com:

```text
0 equipamento(s)
```

## Causa

O texto extraído pelo motor de PDF pode variar conforme o ambiente. Em alguns casos, os códigos de artigo ou colunas da tabela não chegam ao parser no formato previsto, mesmo que visualmente existam no PDF.

## Correção v3

Este patch adiciona três estratégias de extração:

```text
1. Parser principal por código de artigo 02.xxx.xxx.xxxxx
2. Fallback por EAN, usando a linha anterior ao EAN como linha do produto
3. Fallback por regex em tabela achatada
```

Assim, mesmo que a tabela venha com quebras diferentes, o parser usa o EAN como âncora.

## Resultado esperado para FSilva 11853

```text
Orçamento: ORC.EXP1E/11853
Cliente: FLORIANO JOSE SILVA
Data: 2026-06-11
Total: 9 139,92
Equipamentos: 8
```

## Aplicar

Na raiz:

```powershell
node scripts/maintenance/fix-quote-dossier-items-parser-v3-fallback.mjs
```

Validar backend:

```powershell
cd server
node --check services/quote-dossiers/quoteDossierParser.js
npm start
```

Depois recarregar o PDF na página.

## Commit recomendado

```powershell
git add scripts/maintenance/fix-quote-dossier-items-parser-v3-fallback.mjs `
        docs/FIX_QUOTE_DOSSIER_ITEMS_PARSER_V3_FALLBACK.md `
        server/services/quote-dossiers/quoteDossierParser.js

git commit -m "fix: add ean fallback to quote dossier parser"
git push origin main
```
