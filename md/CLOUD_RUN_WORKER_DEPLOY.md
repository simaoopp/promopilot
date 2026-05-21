# Deploy sénior do worker de campanhas no Google Cloud Run Jobs

Este projeto foi preparado para a arquitetura:

- **Render**: app/API leve, sem worker de emails e sem Chromium.
- **Cloud Run Job**: processamento pesado de emails, Playwright/Chromium, PDF e envio por Resend.

## 1. O que mudou no código

- `server/scripts/runCampaignEmailWorker.js` agora é one-shot e suporta:
  - `--send`
  - `--dry-run`
  - `--no-send`
  - `--force`
- `server/package.json` tem:
  - `npm run worker:campaigns`
  - `npm run worker:campaigns:send`
  - `npm run worker:campaigns:dry-run`
- `Dockerfile.cloudrun-worker` arranca diretamente o worker one-shot.
- `server/services/automatic-campaigns/inboxService.js` foi otimizado para primeiro ler metadata IMAP e só descarregar o email completo depois de passar filtros de assunto/remetente/visto.
- `server/services/automatic-campaigns/pdfGeneratorService.js` suporta `CAMPAIGN_PDF_ENGINE=playwright|pdfkit`.

## 2. Comando local

Dentro de `server`:

```bash
npm run smoke
npm run worker:campaigns:dry-run
npm run worker:campaigns:send
```

## 3. Build da imagem

Na raiz do projeto:

```bash
gcloud builds submit \
  --tag europe-southwest1-docker.pkg.dev/PROJECT_ID/etiquetas-prom/email-worker:latest \
  --file Dockerfile.cloudrun-worker
```

Substitui `PROJECT_ID` pelo ID real do projeto Google Cloud.

## 4. Criar Cloud Run Job

Configuração recomendada inicial:

```text
Name: etiquetas-prom-email-worker
Region: europe-southwest1
Image: europe-southwest1-docker.pkg.dev/PROJECT_ID/etiquetas-prom/email-worker:latest
Tasks: 1
Parallelism: 1
Retries: 0
Timeout: 15 minutes
CPU: 1
Memory: 2 GiB
Command: deixar vazio
Args: deixar vazio
```

O `CMD` já está no Dockerfile:

```bash
npm run worker:campaigns:send
```

## 5. Variáveis de ambiente

Usa `cloudrun/worker-env.example` como base.

Segredos que devem ir para Secret Manager:

```text
CAMPAIGN_IMAP_PASS
RESEND_API_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```

## 6. Scheduler

Começar com execução de 10 em 10 minutos:

```text
*/10 * * * *
Timezone: Europe/Lisbon
```

Depois de validar estabilidade, podes ajustar a frequência.

## 7. Render

No Render, usar `render/env-after-cloudrun.example` e remover envs de:

- IMAP
- Resend
- Playwright
- worker automático

O Render deve ficar com:

```env
CAMPAIGN_EMAIL_WORKER_ENABLED=0
CAMPAIGN_EMAIL_WORKER_RUN_ON_START=0
CAMPAIGN_EMAIL_SEND_ENABLED=0
WARM_ARTICLES_CACHE=0
```

## 8. Checklist de validação

1. `npm run smoke` passa.
2. Build Docker termina sem erro.
3. Cloud Run Job executa manualmente.
4. Logs mostram `Execução one-shot concluída`.
5. PDF é gerado via Playwright.
6. PDF é carregado no Supabase Storage.
7. Email é enviado por Resend.
8. Email original é marcado como visto se `CAMPAIGN_EMAIL_MARK_SEEN=1`.
9. Scheduler fica ativo só depois de teste manual bem-sucedido.
