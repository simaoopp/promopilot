# PromoPilot Product UI V2

Remodelação visual e funcional de produto para o `main`.

## Objetivo

Deixar o SaaS com identidade PromoPilot e uma interface mais sénior, profissional e útil para loja.

## O que muda

- Identidade centralizada em `src/brand/promopilot.js`
- Marca visual própria em `src/components/brand/PromoPilotMark.jsx`
- Splash screen PromoPilot
- Login redesenhado como landing operacional
- Topbar e sidebar redesenhadas
- Homepage convertida em cockpit operacional
- Ações rápidas mais claras:
  - Criar campanha
  - Catálogo de artigos
  - Scan em loja
  - Dossiers de orçamento
  - Importação Excel
- Histórico e resumo com apresentação mais limpa
- Camada visual moderna em `src/styles/promopilot.css`

## O que não muda

A lógica de negócio continua intacta:

- Etiquetas de campanha
- Catálogo e scan
- Importação Excel
- Orçamentos / Dossiers
- Autenticação
- Migração de artigos

## Aplicar

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/apply-promopilot-product-ui-v2.mjs
npm run build
```

## Validar no browser

- Login aparece como PromoPilot
- Homepage tem cockpit operacional
- Menu lateral abre e fecha
- Criar campanha abre corretamente
- Catálogo abre corretamente
- Dossiers abre corretamente
- Importação Excel abre corretamente
- Mobile mantém layout utilizável

## Commit sugerido

```bash
git add src/App.js \
        src/brand/promopilot.js \
        src/components/brand/PromoPilotMark.jsx \
        src/components/Sidebar.jsx \
        src/pages/Login.jsx \
        src/pages/Homepage.jsx \
        src/components/home/HomeHero.jsx \
        src/components/home/HomeQuickActions.jsx \
        src/components/home/HomeSummarySection.jsx \
        src/components/home/HomeHistorySection.jsx \
        src/components/home/HomeAutomaticCampaignHistorySection.jsx \
        src/styles/styles.css \
        src/styles/promopilot.css \
        scripts/maintenance/apply-promopilot-product-ui-v2.mjs \
        docs/PROMOPILOT_PRODUCT_UI_V2.md

git commit -m "feat: redesign main interface for PromoPilot"
git push origin main
```
