# Force Quote Dossier Serious Runtime v3

## Problema

O PDF gerado ainda mostra o runtime antigo:

```text
- 24 páginas
- cliente como —
- fotografias não encontradas
- descrições genéricas
- características genéricas
```

Ou seja, o backend ativo ainda não está a usar o gerador sério/enriquecido.

## O que este patch faz

Este patch não tenta pequenos replaces frágeis. Ele reescreve diretamente o runtime do módulo de dossiers:

```text
server/routes/quoteDossiers.js
server/services/quote-dossiers/quoteDossierEnrichmentService.js
server/services/quote-dossiers/quoteDossierPdfService.js
server/services/quote-dossiers/quoteDossierTrustedSources.js
server/services/quote-dossiers/quoteDossierWebEnrichmentService.js
```

Também copia as imagens curadas para:

```text
server/services/quote-dossiers/assets
```

## Prova de que o Render está atualizado

Depois do deploy, abrir:

```text
https://etiquetasprom.onrender.com/api/orcamentos-dossiers/version
```

Resultado esperado:

```json
{
  "ok": true,
  "version": "quote-dossier-serious-runtime-v3"
}
```

Se não aparecer esta versão, o Render ainda está com código antigo ou o deploy não pegou.

## Aplicar

Na raiz do projeto:

```powershell
node scripts/maintenance/force-quote-dossier-serious-runtime-v3.mjs
```

Validar:

```powershell
cd server
node --check routes/quoteDossiers.js
node --check services/quote-dossiers/quoteDossierEnrichmentService.js
node --check services/quote-dossiers/quoteDossierPdfService.js
node --check services/quote-dossiers/quoteDossierTrustedSources.js
node --check services/quote-dossiers/quoteDossierWebEnrichmentService.js
npm start
```

## Commit recomendado

```powershell
git add scripts/maintenance/force-quote-dossier-serious-runtime-v3.mjs `
        scripts/maintenance/assets/quote-dossier-products `
        docs/FORCE_QUOTE_DOSSIER_SERIOUS_RUNTIME_V3.md `
        server/routes/quoteDossiers.js `
        server/services/quote-dossiers/quoteDossierEnrichmentService.js `
        server/services/quote-dossiers/quoteDossierPdfService.js `
        server/services/quote-dossiers/quoteDossierTrustedSources.js `
        server/services/quote-dossiers/quoteDossierWebEnrichmentService.js `
        server/services/quote-dossiers/assets

git commit -m "fix: force serious quote dossier runtime"
git push origin main
```

## Render envs

Para a parte web automática:

```text
QUOTE_DOSSIER_WEB_ENRICHMENT=1
QUOTE_DOSSIER_SERPER_API_KEY=<chave>
```

ou:

```text
QUOTE_DOSSIER_WEB_ENRICHMENT=1
QUOTE_DOSSIER_BRAVE_SEARCH_API_KEY=<chave>
```

Sempre manter:

```text
JSON_BODY_LIMIT=80mb
URLENCODED_BODY_LIMIT=80mb
```
