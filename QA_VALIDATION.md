# QA validation - entrega corrigida

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
- Refactor conservador:
  - Etiquetas partilham `src/components/campaign/CampaignLabel.jsx`.
  - Backend foi dividido em `config`, `middleware`, `routes` e `services`, deixando `server/index.js` apenas como composição da aplicação.
- Build de produção configurado com `.env.production` para evitar sourcemap warnings de dependências externas `@zxing`.

## QA executado

```bash
npm run validate:artigos-json
npm run test:ci
npm run qa:static
npm run build
cd server && npm run smoke
```

## Resultado

- `artigos.json válido: 68803 artigos`
- Testes frontend: 6 suites / 17 testes passados
- QA estático: sem falhas críticas
- Build React: compilado com sucesso
- Smoke test backend: `node --check` passou em todos os módulos principais
