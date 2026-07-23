# PromoPilot Real Logo Pages V2

Este patch corrige o caso em que o favicon já aparece, mas o logótipo real não aparece nas páginas.

## Problema corrigido

A interface ainda podia estar a usar:
- o símbolo artificial `PP` do componente `PromoPilotMark`
- `src/favicon.png` no login
- CSS antigo para logos quadrados
- textos/alt antigos de `Expert`

## O que altera

- `src/logo.png`
- `src/favicon.png`
- `src/assets/promopilot-logo.png`
- `public/logo192.png`
- `public/logo512.png`
- `public/favicon.ico`
- `src/components/brand/PromoPilotMark.jsx`
- `src/components/brand/PromoPilotBrand.jsx`
- `src/App.js`
- `src/components/Sidebar.jsx`
- `src/pages/Login.jsx`
- `public/index.html`
- `public/manifest.json`
- adiciona CSS direto em `src/styles/styles.css`

## Aplicar

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/apply-promopilot-real-logo-pages-v2.mjs
npm run build
```

## Validar

- login mostra o logótipo real
- topbar mostra o logótipo real
- sidebar mostra o logótipo real
- splash/loading usa o logótipo real
- favicon continua correto
