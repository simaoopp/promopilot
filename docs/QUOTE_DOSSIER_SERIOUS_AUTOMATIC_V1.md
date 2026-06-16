# Quote Dossier Serious Automatic v1

## Objetivo

Transformar o módulo de dossiers técnicos num gerador automático mais próximo do documento manual de referência.

O orçamento original `ORC.EXP1E/11699` contém 6 equipamentos com EANs, preços e total 3.204,94 €. O dossier manual de referência tem uma capa/resumo e uma página por equipamento com fotografia, descrição geral e principais características. fileciteturn34file0 fileciteturn34file2

## O que este patch faz

Backend:

```text
- adiciona quoteDossierEnrichmentService.js;
- enriquece automaticamente os itens por EAN;
- adiciona fotos curadas dos 6 equipamentos do exemplo Décio/11699;
- adiciona descrições e características técnicas curadas;
- substitui o PDFKit template por um layout mais estável e próximo do modelo manual;
- evita páginas em branco;
- gera resumo + página por equipamento + nota final.
```

## Produtos curados nesta v1

```text
8059019105536 - CANDY CA38FL7N20WXB
8434778019674 - TEKA HLB 8300 BK
8434778012491 - TEKA IZC 64010 BK MSS
7333394034669 - AEG FSB34707Z
8806097163985 - SAMSUNG RS70F64KETEF
8806097064466 - SAMSUNG DV90DG52A0AEEP
```

## Limite honesto da v1

Esta versão faz enriquecimento automático com catálogo curado local.

Para artigos novos, sem catálogo, gera conteúdo genérico e marca como `generic_fallback`.

A fase seguinte deve ligar a:

```text
- catálogo interno Supabase/articles;
- imagens dos artigos;
- scraping/API oficial com validação;
- cache por EAN;
- painel para aprovar/sobrescrever correspondências.
```

## Aplicar

Na raiz:

```powershell
node scripts/maintenance/apply-quote-dossier-serious-automatic-v1.mjs
```

Validar backend:

```powershell
cd server
node --check routes/quoteDossiers.js
node --check services/quote-dossiers/quoteDossierEnrichmentService.js
node --check services/quote-dossiers/quoteDossierPdfService.js
npm start
```

Validar frontend:

```powershell
npm run build
npm start
```

## Validação esperada

Carregar `ORC SR. DECIO`.

Resultado esperado:

```text
6 artigos reconhecidos
fotos carregadas automaticamente
descrições técnicas completas
PDF gerado com 8 páginas aprox.
sem páginas em branco
layout mais próximo do documento manual
```

## Commit recomendado

```powershell
git add scripts/maintenance/apply-quote-dossier-serious-automatic-v1.mjs `
        scripts/maintenance/assets/quote-dossier-products `
        docs/QUOTE_DOSSIER_SERIOUS_AUTOMATIC_V1.md `
        server/routes/quoteDossiers.js `
        server/services/quote-dossiers/quoteDossierEnrichmentService.js `
        server/services/quote-dossiers/quoteDossierPdfService.js `
        server/services/quote-dossiers/assets

git commit -m "feat: add automatic quote dossier enrichment"
git push origin main
```

Depois fazer redeploy do backend no Render.
