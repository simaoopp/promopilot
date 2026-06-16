# Fix Orcamentos Dossiers async const

## Problema

A build da Netlify falhou com:

```text
SyntaxError: src/pages/OrcamentosDossiers.jsx: Missing semicolon. (15:5)

async const MAX_QUOTE_PDF_SIZE_BYTES = 45 * 1024 * 1024;
      ^
```

## Causa

O patch anterior inseriu constantes antes de `function fileToBase64`, mas nesse ficheiro a função era:

```js
async function fileToBase64(...)
```

Como a inserção entrou entre `async` e `function`, o ficheiro ficou inválido:

```js
async const MAX_QUOTE_PDF_SIZE_BYTES = ...
```

## Correção

Este patch troca:

```js
async const MAX_QUOTE_PDF_SIZE_BYTES = ...
```

por:

```js
const MAX_QUOTE_PDF_SIZE_BYTES = ...
```

E garante que a função fica:

```js
async function fileToBase64(...)
```

## Aplicar

Na raiz do projeto:

```powershell
node scripts/maintenance/fix-orcamentos-dossiers-async-const.mjs
npm run build
```

## Commit recomendado

```powershell
git add scripts/maintenance/fix-orcamentos-dossiers-async-const.mjs `
        docs/FIX_ORCAMENTOS_DOSSIERS_ASYNC_CONST.md `
        src/pages/OrcamentosDossiers.jsx

git commit -m "fix: repair quote dossier upload size syntax"
git push origin main
```
