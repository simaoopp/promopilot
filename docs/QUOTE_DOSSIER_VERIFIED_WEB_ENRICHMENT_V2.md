# Quote Dossier Verified Web Enrichment v2

## Objetivo

Automatizar o enriquecimento para todo o catálogo, indo buscar informação e fotografias a:

```text
1. sites oficiais da marca;
2. sites verificados/retalhistas confiáveis;
3. fallback genérico apenas quando não há fonte segura.
```

## Importante

Esta versão não faz scraping solto da internet.

Ela usa:

```text
- allowlist de domínios oficiais por marca;
- allowlist de retalhistas verificados;
- busca por EAN/referência;
- prioridade a fonte oficial;
- download controlado de imagem;
- timeout e limite de tamanho;
- fallback seguro.
```

## Novas envs do backend

No Render/backend:

```text
QUOTE_DOSSIER_WEB_ENRICHMENT=1
QUOTE_DOSSIER_SERPER_API_KEY=<chave Serper opcional>
```

ou, em alternativa:

```text
QUOTE_DOSSIER_WEB_ENRICHMENT=1
QUOTE_DOSSIER_BRAVE_SEARCH_API_KEY=<chave Brave Search opcional>
```

Mantém também:

```text
JSON_BODY_LIMIT=80mb
URLENCODED_BODY_LIMIT=80mb
```

## Fluxo técnico

Para cada item do orçamento:

```text
1. tenta catálogo curado/local por EAN;
2. se não encontrar, pesquisa fonte oficial da marca;
3. se não encontrar, pesquisa sites verificados;
4. abre as páginas permitidas;
5. extrai JSON-LD Product, meta tags, imagem e características;
6. descarrega imagem principal;
7. marca a fonte usada no item;
8. se nada for encontrado, usa fallback genérico e indica baixa confiança.
```

## Domínios oficiais/validados incluídos

Marcas:

```text
AEG
Bosch
Candy
Caso
Electrolux
LG
Samsung
Siemens
Teka
Whirlpool
Zanussi
```

Retalhistas verificados:

```text
worten.pt
radiopopular.pt
kuantokusta.pt
fnac.pt
elcorteingles.pt
mediamarkt.pt
amazon.es
```

## Aplicar

Na raiz:

```powershell
node scripts/maintenance/apply-quote-dossier-verified-web-enrichment-v2.mjs
```

Validar:

```powershell
cd server
node --check routes/quoteDossiers.js
node --check services/quote-dossiers/quoteDossierTrustedSources.js
node --check services/quote-dossiers/quoteDossierWebEnrichmentService.js
node --check services/quote-dossiers/quoteDossierEnrichmentService.js
npm start
```

## Commit recomendado

```powershell
git add scripts/maintenance/apply-quote-dossier-verified-web-enrichment-v2.mjs `
        docs/QUOTE_DOSSIER_VERIFIED_WEB_ENRICHMENT_V2.md `
        server/routes/quoteDossiers.js `
        server/services/quote-dossiers/quoteDossierTrustedSources.js `
        server/services/quote-dossiers/quoteDossierWebEnrichmentService.js `
        server/services/quote-dossiers/quoteDossierEnrichmentService.js

git commit -m "feat: enrich quote dossiers from verified sources"
git push origin main
```

Depois fazer redeploy do backend no Render.

## Próxima fase recomendada

Adicionar cache persistente em Supabase:

```text
quote_product_enrichment_cache
```

Campos:

```text
ean
reference
brand
title
category
description
features
image_url
image_storage_path
source_url
source_domain
source_type
confidence
last_checked_at
approved_at
approved_by
```

Assim a primeira pesquisa pode demorar, mas as seguintes ficam instantâneas e auditáveis.
