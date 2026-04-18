# Expert Administração

Aplicação interna para pesquisa de artigos, criação de campanhas promocionais, impressão de etiquetas e enriquecimento de produto com IA.

## O que foi melhorado nesta versão
- API protegida com autenticação Supabase
- catálogo migrado para **base de dados Supabase**
- importação de artigos por script (`scripts/import-artigos-to-supabase.mjs`)
- `ToastProvider` para feedback não bloqueante
- helper central de impressão (`src/utils/print.js`)
- healthcheck da API (`GET /api/health`)
- `.env.example` completo
- `manifest.json`, `README` e `Dockerfile` corrigidos
- QA estático automatizado (`npm run qa:static`)

## Stack
- Frontend: React + React Router + Supabase Auth
- Backend: Express + Playwright + Gemini + Supabase
- Base de dados: Supabase Postgres

## Variáveis de ambiente

### Frontend
```env
REACT_APP_SUPABASE_URL=https://teu-projeto.supabase.co
REACT_APP_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
REACT_APP_API_BASE_URL=https://teu-backend.example.com
```

> `REACT_APP_SUPABASE_ANON_KEY` continua a ser aceite como fallback para compatibilidade, mas a preferência deve ser `REACT_APP_SUPABASE_PUBLISHABLE_KEY`.

### Backend
```env
SUPABASE_URL=https://teu-projeto.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
ARTICLES_TABLE=articles
GEMINI_API_KEY=xxx
CORS_ORIGINS=https://teu-site.netlify.app,http://localhost:3000,http://localhost:8888
PORT=3001
```

## Como configurar a tabela de artigos no Supabase
1. Abre o SQL Editor no Supabase.
2. Executa o conteúdo de `supabase/migrations/20260418_create_articles.sql`.
3. Confirma que a tabela `public.articles` foi criada.

## Como importar os artigos do JSON para a base de dados
1. Garante que `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão definidas no ambiente local.
2. Corre:

```bash
npm install
npm run seed:articles
```

O script vai ler `src/data/artigos.json` e fazer `upsert` por batches para `public.articles`.

## Arranque local
### Frontend
```bash
npm install
npm start
```

### Backend
```bash
cd server
npm install
npm start
```

## QA recomendado antes de publicar
### QA estático
```bash
npm run qa:static
```

### Testes frontend
```bash
npm run test:ci
```

### Smoke tests manuais
- login com utilizador válido
- fluxo obrigatório de onboarding
- homepage a carregar artigos
- popup de IA
- criação de campanha manual
- criação de campanha por Excel
- impressão de etiquetas
- histórico por loja
- `GET /api/health`

## Notas de arquitetura
- o frontend já não deve importar `src/data/artigos.json` diretamente
- a tabela `articles` é consumida pelo backend
- a atualização dos artigos enriquecidos é feita no backend e persistida no Supabase
- as tabelas `profiles` e `campaigns` continuam a ser acedidas diretamente pelo cliente Supabase

## Próximos passos recomendados
- dividir `Homepage`, `EtiquetasCampanha` e `EtiquetasCampanhaExcel` em componentes menores
- acrescentar testes de integração para a API
- acrescentar E2E com Playwright
- mover `profiles` e `campaigns` para uma camada de API se precisares de auditoria/controlo mais forte
