# Fix Orcamentos Dossiers unused upload constants

## Problema

A Netlify falhou porque `CI=true` trata warnings de ESLint como erro:

```text
src/pages/OrcamentosDossiers.jsx
Line 15:7   'MAX_QUOTE_PDF_SIZE_BYTES' is assigned a value but never used
Line 17:10  'formatFileSize' is defined but never used
```

## Causa

O patch do limite de upload tentou adicionar uma validação frontend, mas a validação não entrou no bloco certo. Ficaram só a constante e a função, sem uso.

## Correção

Este patch remove as declarações órfãs:

```js
const MAX_QUOTE_PDF_SIZE_BYTES = ...
function formatFileSize(...)
```

O limite real do upload continua resolvido no backend/Render com:

```text
JSON_BODY_LIMIT=80mb
URLENCODED_BODY_LIMIT=80mb
```

## Aplicar

Na raiz do projeto:

```powershell
node scripts/maintenance/fix-orcamentos-dossiers-unused-upload-constants.mjs
npm run build
```

## Commit recomendado

```powershell
git add scripts/maintenance/fix-orcamentos-dossiers-unused-upload-constants.mjs `
        docs/FIX_ORCAMENTOS_DOSSIERS_UNUSED_UPLOAD_CONSTANTS.md `
        src/pages/OrcamentosDossiers.jsx

git commit -m "fix: remove unused quote dossier upload constants"
git push origin main
```
