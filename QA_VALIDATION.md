# QA validation - entrega corrigida/refatorada + otimização de catálogo

Data: 2026-05-10

## Alterações principais

- Corrigido `src/data/artigos.json`; JSON válido com 68.803 artigos.
- Mapeados `pvp1`, `pvp2` e `pvp3` no backend em `server/services/articleRepository.js`.
- Atualizados scripts de importação/migração para preservar `pvp1` e `pvp3`.
- Adicionados scripts no `package.json`:
  - `validate:artigos-json`
  - `repair:artigos-json`
  - `migrate:article-prices`
- Adicionado parser/teste para preços portugueses com vírgula decimal, evitando casos como `10,99 -> NaN`.
- Homepage, modal de artigo, página de etiquetas e criação manual de campanha passam a expor `PVP1`, `PVP2` e `PVP3` onde o preço base é mostrado.

## Otimização de performance do catálogo/artigos

Objetivo: reduzir drasticamente o tempo de carregamento do catálogo ao entrar no programa e evitar dezenas/centenas de pedidos sequenciais ao backend.

### Backend

- Criada rota dedicada `GET /api/artigos/catalogo` para devolver o catálogo completo numa única chamada autenticada.
- Criada cache em memória no servidor em `server/services/articleRepository.js`:
  - TTL configurável por `ARTICLES_CACHE_TTL_MS`.
  - Page size configurável por `ARTICLES_CACHE_PAGE_SIZE`.
  - Deduplicação de pedidos concorrentes através de `allArticlesCache.promise`.
- Adicionado warm-up automático da cache no arranque do backend:
  - Ativo por defeito.
  - Pode ser desligado com `WARM_ARTICLES_CACHE=0`.
- Adicionada rota `GET /api/artigos/cache-status` para diagnóstico.
- A rota antiga `GET /api/artigos` continua compatível e aumenta o limite máximo de página de 500 para 1000.
- Adicionado `compression` ao backend para comprimir respostas grandes, especialmente o catálogo completo.

### Frontend

- Criada cache persistente em IndexedDB:
  - `src/services/artigosPersistentCache.js`
  - Guarda o catálogo completo localmente no browser.
  - TTL local de 12 horas.
- `loadAllArtigos()` passou a usar estratégia stale-while-revalidate:
  1. usa cache em memória se existir;
  2. usa IndexedDB quase instantaneamente nas visitas seguintes;
  3. atualiza o catálogo em segundo plano através do backend;
  4. cai automaticamente para paginação antiga se a rota nova não existir.
- O catálogo começa a pré-carregar mais cedo, logo após sessão autenticada no `AuthContext`, enquanto o perfil ainda carrega.
- `catalogoPesquisaService` atualiza o índice de pesquisa quando recebe dados frescos em segundo plano.

## Refactor senior executado nesta versão

### Frontend - campanha manual

`src/pages/EtiquetasCampanha.jsx` foi reduzido de ~1705 linhas para 794 linhas.

Lógica e UI foram separadas para:

- `src/features/campaign/manual/manualCampaignUtils.js`
- `src/features/campaign/manual/ManualCampaignToolbar.jsx`
- `src/features/campaign/manual/ManualCampaignTable.jsx`
- `src/features/campaign/manual/ManualCreateCampaignModal.jsx`
- `src/features/campaign/manual/InvalidCampaignItemsModal.jsx`
- `src/features/campaign/manual/ManualCampaignPrintArea.jsx`
- `src/features/campaign/common/ResumoCard.jsx`

### Frontend - campanha Excel

`src/pages/EtiquetasCampanhaExcel.jsx` foi reduzido de ~1851 linhas para 760 linhas.

Lógica e UI foram separadas para:

- `src/features/campaign/excel/excelCampaignUtils.js`
- `src/features/campaign/excel/ExcelCampaignToolbar.jsx`
- `src/features/campaign/excel/ExcelCampaignTable.jsx`
- `src/features/campaign/excel/ExcelInvalidItemsModal.jsx`
- `src/features/campaign/excel/ExcelCampaignPrintArea.jsx`
- `src/features/campaign/excel/ShoppingPriceSelector.jsx`

### Backend

`server/index.js` fica como bootstrap simples. A composição da app e diagnóstico de runtime estão separados para:

- `server/app.js`
- `server/bootstrap/runtimeInfo.js`

O smoke test do backend valida os módulos principais.

## QA executado

```bash
npm run validate:artigos-json
npm run qa:static
npm run test:ci
npm run build
cd server && npm run smoke
```

## Resultado

- `artigos.json válido: 68803 artigos`
- QA estático: sem falhas críticas
- Testes frontend: 6 suites / 17 testes passados
- Build React: compilado com sucesso (`.env.production` desativa source maps para build mais rápido e menor)
- Smoke test backend: `node --check` passou em todos os módulos principais
- `server npm audit`: 0 vulnerabilidades

## Nota técnica

A primeira abertura absoluta ainda depende da rede e do primeiro aquecimento da cache, mas deixa de fazer mais de 100 pedidos sequenciais no browser. A partir da segunda entrada no mesmo browser, o catálogo é carregado a partir do IndexedDB e atualizado em segundo plano.
