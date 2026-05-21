# QA Report - Expert Administração

## Score
**7.4 / 10**

## Executive summary
The app already has a solid base: protected routes, Supabase auth, a usable article search flow, automated frontend tests, and a production build that completes successfully.

The main weak point was **catalog and search performance on first use**. The first lookup was paying too much startup cost because the catalog was being fetched and prepared too late, repeated on multiple screens, and one page was even duplicating the same catalog request.

## Main issues found
1. **Homepage first-search latency**
   - catalog preload started too late (`requestIdleCallback` / delayed path)
   - first interaction could still trigger cold loading

2. **Repeated catalog work across screens**
   - homepage, labels page, and campaign page prepared/fetched the same catalog separately
   - extra CPU and network/database load for the same data

3. **Duplicate catalog fetch in `EtiquetasCampanha.jsx`**
   - the page had the same `syncCatalogo` effect duplicated
   - that caused unnecessary double loading

4. **Database/API overhead during full catalog preload**
   - full catalog pagination was requesting exact counts on every page
   - that is wasteful for preload flows where only `hasMore` matters

5. **EAN search support was not optimized enough in UX/performance terms**
   - the homepage placeholder already referenced EAN, but exact EAN lookup was not explicitly optimized/shared
   - suggestion cards did not surface EAN clearly

## Improvements implemented
### Performance / data loading
- Added **global shared catalog search service**: `src/services/catalogoPesquisaService.js`
- Catalog now **preloads as soon as the app is ready after login**
- Homepage, labels page, and campaign page now **reuse the same prepared catalog in memory**
- Removed repeated per-page catalog preparation where possible
- Added **exact-match indexes** for:
  - article code
  - barcode / EAN
  - model
- Added in-flight request deduplication in `artigosService`

### Backend/API optimization
- Added `includeCount=0` support to `/api/artigos`
- `loadAllArtigos()` now preloads pages **without exact count** to reduce DB work
- Backend now computes `hasMore` without forcing exact count on preload pages

### Functional fixes
- Fixed duplicated catalog loading in `src/pages/EtiquetasCampanha.jsx`
- Homepage search now benefits from the shared prepared catalog immediately
- Homepage suggestions now display **EAN** when available
- Exact EAN lookup is now optimized through shared search indexes

### Test coverage added
- Added `src/utils/articleSearch.test.js`
  - exact EAN lookup
  - exact article-code priority
  - description search regression coverage

## Validation executed
### Frontend tests
- `npm run test:ci` ✅
- Result: **5 test suites passed / 15 tests passed**

### Static QA
- `npm run qa:static` ✅

### Production build
- `npm run build` ✅
- Build passes successfully
- Note: there are **non-blocking source map warnings** from `@zxing/browser` dependency files

### Backend smoke
- `cd server && npm run smoke` ✅

## Files changed
- `src/App.js`
- `src/components/home/HomeHero.jsx`
- `src/pages/Etiquetas.jsx`
- `src/pages/EtiquetasCampanha.jsx`
- `src/pages/Homepage.jsx`
- `src/services/artigosService.js`
- `src/services/catalogoPesquisaService.js` *(new)*
- `src/styles/home.css`
- `src/utils/articleSearch.js`
- `src/utils/articleSearch.test.js` *(new)*
- `server/index.js`
- `server/services/articleRepository.js`

## Residual notes
- The app still has **large page components**, especially `EtiquetasCampanha.jsx`
- Build warnings from `@zxing/browser` are external dependency warnings, not runtime failures
- If you want the next step, I would recommend:
  1. splitting `EtiquetasCampanha.jsx` into smaller components/hooks
  2. adding E2E tests for homepage search, EAN search, and campaign creation
  3. adding performance instrumentation for catalog preload time
