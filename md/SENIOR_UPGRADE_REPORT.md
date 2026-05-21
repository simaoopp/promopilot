# Senior Upgrade — estabilidade, catálogo grande e Cloud Run

## Objetivo

Preparar o projeto para uso real com:

- catálogo Supabase grande, com ~250 mil artigos;
- Render leve, sem worker pesado;
- Cloud Run Job idempotente para emails/PDFs;
- Playwright alinhado com a imagem Docker;
- deploy Cloud Build que preserva envs e secrets do Job;
- menor risco de emails ficarem marcados como lidos quando o PDF falha.

## Alterações principais

### 1. Paginação Supabase corrigida

O Supabase devolve no máximo 1000 linhas por pedido por defeito. O código pedia páginas de 5000/10000, mas recebia apenas 1000, saltando artigos entre offsets.

Agora:

- `ARTICLES_CACHE_PAGE_SIZE` fica limitado a 1000;
- `ARTICLES_CACHE_CONCURRENCY` fica limitado e conservador;
- `listArticles()` nunca pede mais de 1000 linhas;
- `listAllArticles()` avança offsets de 1000 em 1000;
- o endpoint de catálogo devolve também `loaded` para distinguir total esperado vs total carregado.

Ficheiros:

- `server/services/articleRepository.js`
- `server/routes/articles.js`
- `.env.example`
- `render/env-after-cloudrun.example`

### 2. Redução de carga no frontend

Foi removido o preload automático do catálogo completo no login/app. Com centenas de milhares de artigos, carregar tudo no arranque não é adequado.

A homepage passa a pesquisar por API quando o utilizador escreve, evitando descarregar o catálogo inteiro só para sugestões.

Ficheiros:

- `src/App.js`
- `src/context/AuthContext.jsx`
- `src/pages/Homepage.jsx`
- `src/services/catalogoPesquisaService.js`
- `src/services/artigosService.js`

### 3. Cloud Run Job mais idempotente

O `cloudbuild.yaml` passou a definir envs e secrets do Cloud Run Job no deploy. Assim, um novo push no GitHub não recria o Job sem configuração.

Também foi removido o bloco `images:` redundante, porque o build já faz `docker push` explicitamente.

Ficheiro:

- `cloudbuild.yaml`

### 4. Playwright alinhado com Docker

O `playwright` foi fixado sem `^` para evitar upgrades automáticos que quebram a imagem Docker.

Estado final:

- `server/package.json`: `playwright: 1.59.1`
- `Dockerfile.cloudrun-worker`: `mcr.microsoft.com/playwright:v1.59.1-jammy`

Isto evita o erro de runtime em que o pacote procura um Chromium diferente do existente na imagem.

### 5. Worker de email mais seguro

O worker deixa de marcar emails como lidos se alguma loja falhar no processamento/geração/envio. Isto evita perder emails quando existe erro temporário de PDF, Supabase ou Resend.

Também foi recomendado `CAMPAIGN_REPROCESS_ERRORED=1` no Cloud Run para permitir recuperação automática de campanhas que tenham ficado em erro.

Ficheiro:

- `server/workers/campaignEmailWorker.js`

## Env recomendadas

### Render

```env
CAMPAIGN_EMAIL_WORKER_ENABLED=0
CAMPAIGN_EMAIL_WORKER_RUN_ON_START=0
CAMPAIGN_EMAIL_SEND_ENABLED=0
WARM_ARTICLES_CACHE=0
NODE_OPTIONS=--max-old-space-size=384
ARTICLES_CACHE_PAGE_SIZE=1000
ARTICLES_CACHE_CONCURRENCY=2
ARTICLES_SUPABASE_MAX_ROWS=1000
```

### Cloud Run Job

O `cloudbuild.yaml` já define envs normais e mapeia secrets:

```env
CAMPAIGN_IMAP_PASS=campaign-imap-pass:latest
RESEND_API_KEY=resend-api-key:latest
SUPABASE_URL=supabase-url:latest
SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest
SUPABASE_PUBLISHABLE_KEY=supabase-publishable-key:latest
```

## Validação executada

```bash
npm --prefix server run smoke
npm run qa:static
```

Ambos passaram sem falhas críticas.

## Nota operacional

Depois de aplicar este pacote no GitHub:

1. Fazer push para `main`.
2. Confirmar Cloud Build verde.
3. Confirmar Cloud Run Job atualizado.
4. Executar manualmente o Job uma vez.
5. Confirmar PDF/email real.
6. Manter Scheduler a cada 10 minutos ou 15 minutos.

Para uma versão event-driven, o próximo passo é substituir Scheduler por Gmail API Watch + Pub/Sub + Cloud Run Service leve.
