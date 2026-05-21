diff -ruN /mnt/data/readme_orig/ETIQUETASPROM-main/README.md /mnt/data/readme_work/ETIQUETASPROM-main/README.md
--- /mnt/data/readme_orig/ETIQUETASPROM-main/README.md	2026-05-21 02:25:54.000000000 +0000
+++ /mnt/data/readme_work/ETIQUETASPROM-main/README.md	2026-05-21 02:59:12.796307995 +0000
@@ -1,105 +1,482 @@
-# Expert Administração
+# Etiquetas Prom
 
-Aplicação interna para pesquisa de artigos, criação de campanhas promocionais, impressão de etiquetas e enriquecimento de produto com IA.
+Aplicação interna para gestão de artigos, criação de campanhas promocionais e emissão de etiquetas. O projeto está preparado para dois fluxos principais:
 
-## O que foi melhorado nesta versão
-- API protegida com autenticação Supabase
-- catálogo migrado para **base de dados Supabase**
-- importação de artigos por script (`scripts/import-artigos-to-supabase.mjs`)
-- `ToastProvider` para feedback não bloqueante
-- helper central de impressão (`src/utils/print.js`)
-- healthcheck da API (`GET /api/health`)
-- `.env.example` completo
-- `manifest.json`, `README` e `Dockerfile` corrigidos
-- QA estático automatizado (`npm run qa:static`)
-
-## Stack
-- Frontend: React + React Router + Supabase Auth
-- Backend: Express + Playwright + Gemini + Supabase
-- Base de dados: Supabase Postgres
+1. **Etiquetas manuais**, usadas diretamente na aplicação.
+2. **Etiquetas automáticas**, recebidas por email, processadas em Cloud Run e enviadas automaticamente para as lojas.
 
-## Variáveis de ambiente
+A versão atual separa a aplicação principal do processamento pesado. O Render fica leve, responsável pela app/API. O Cloud Run fica com o trabalho pesado: ler emails, gerar PDFs com Playwright/Chromium, guardar no Supabase Storage e enviar por Resend.
+
+---
+
+## Estado atual da arquitetura
+
+```text
+Frontend React
+  ↓
+Backend Express no Render
+  ↓
+Supabase Auth + Supabase Postgres + Supabase Storage
+
+Gmail / IMAP
+  ↓
+Cloud Scheduler
+  ↓
+Cloud Run Job
+  ↓
+Playwright/Chromium → PDF oficial das etiquetas
+  ↓
+Supabase Storage + Resend
+```
+
+### Responsabilidades por ambiente
+
+**Render**
+
+- serve a aplicação e a API leve;
+- não deve correr o worker automático de emails;
+- não deve abrir Chromium;
+- não deve fazer polling IMAP;
+- não deve enviar as campanhas automáticas por Resend.
+
+**Cloud Run Job**
+
+- corre em modo one-shot;
+- lê no máximo um pequeno lote de emails por execução;
+- processa apenas emails relevantes;
+- gera os PDFs com o layout oficial através de Playwright;
+- envia as etiquetas por email;
+- limpa campanhas automáticas antigas.
+
+Esta separação evita crashes de memória no Render e mantém a geração de PDF com qualidade visual próxima da etiqueta manual.
+
+---
+
+## Stack principal
+
+- **Frontend:** React, React Router, Supabase Auth.
+- **Backend:** Node.js, Express, Supabase JS.
+- **PDF oficial:** Playwright/Chromium.
+- **Fallback PDF:** PDFKit, apenas como plano B controlado.
+- **Email automático:** IMAP/Gmail + Resend.
+- **Base de dados:** Supabase Postgres.
+- **Storage:** Supabase Storage.
+- **Deploy app/API:** Render.
+- **Deploy worker pesado:** Google Cloud Run Job.
+- **Build da imagem:** Cloud Build + Artifact Registry.
+
+---
+
+## Decisões técnicas importantes
+
+### 1. Playwright está fixado
+
+O worker usa Playwright `1.60.0` e a imagem Docker correspondente:
+
+```dockerfile
+FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS runner
+```
+
+Isto evita o erro em que o pacote Node pede uma versão de Chromium diferente da que existe dentro da imagem Docker.
+
+### 2. O worker é one-shot
+
+O Cloud Run Job não arranca um servidor e não fica em loop. Ele executa:
+
+```bash
+node scripts/runCampaignEmailWorker.js --send
+```
+
+Depois termina. Isto é mais barato, previsível e seguro do que manter um processo sempre ligado.
+
+### 3. O Render fica leve
+
+No Render, o worker deve ficar desligado:
+
+```env
+CAMPAIGN_EMAIL_WORKER_ENABLED=0
+CAMPAIGN_EMAIL_WORKER_RUN_ON_START=0
+CAMPAIGN_EMAIL_SEND_ENABLED=0
+WARM_ARTICLES_CACHE=0
+NODE_OPTIONS=--max-old-space-size=384
+```
+
+### 4. Catálogo grande não deve ser carregado inteiro no browser
+
+A base de dados pode ter centenas de milhares de artigos. A aplicação foi ajustada para evitar carregar tudo de uma vez. A paginação Supabase está limitada a 1000 linhas por pedido, porque esse é o limite seguro por request.
+
+```env
+ARTICLES_CACHE_PAGE_SIZE=1000
+ARTICLES_CACHE_CONCURRENCY=2
+ARTICLES_SUPABASE_MAX_ROWS=1000
+```
+
+Para uso real, a pesquisa deve ser feita server-side, devolvendo apenas os resultados necessários.
+
+### 5. Campanhas automáticas expiram em 5 dias
+
+As promoções automáticas são temporárias. Por defeito, campanhas automáticas com mais de 5 dias são removidas, incluindo PDFs associados no Storage quando possível.
+
+```env
+AUTOMATIC_CAMPAIGN_HISTORY_DAYS=5
+AUTOMATIC_CAMPAIGN_CLEANUP_ENABLED=1
+AUTOMATIC_CAMPAIGN_CLEANUP_DAYS=5
+AUTOMATIC_CAMPAIGN_CLEANUP_BATCH_SIZE=100
+```
+
+---
+
+## Estrutura relevante do projeto
+
+```text
+.
+├── src/                                  # frontend React
+│   ├── pages/                            # páginas principais
+│   ├── services/                         # serviços do frontend
+│   ├── shared/campaign-label/            # regras partilhadas das etiquetas
+│   └── utils/                            # formatters, regras de preço, impressão
+│
+├── server/                               # backend Express
+│   ├── routes/                           # rotas da API
+│   ├── services/automatic-campaigns/      # parser, PDF, storage, email, limpeza
+│   ├── workers/campaignEmailWorker.js     # worker automático
+│   └── scripts/runCampaignEmailWorker.js  # entrada one-shot do Cloud Run
+│
+├── supabase/migrations/                  # migrations SQL
+├── cloudrun/worker-env.example           # referência de envs do Cloud Run
+├── render/env-after-cloudrun.example     # referência de envs do Render
+├── Dockerfile.cloudrun-worker            # imagem do worker Cloud Run
+└── cloudbuild.yaml                       # build/deploy do Cloud Run Job
+```
+
+---
+
+## Configuração local
+
+### 1. Instalar dependências do frontend
+
+```bash
+npm install
+```
+
+### 2. Instalar dependências do backend
+
+```bash
+cd server
+npm install
+```
+
+### 3. Criar variáveis de ambiente
+
+Na raiz, usa `.env.example` como referência.
+
+Para desenvolvimento local, o frontend precisa pelo menos de:
 
-### Frontend
 ```env
 REACT_APP_SUPABASE_URL=https://teu-projeto.supabase.co
 REACT_APP_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
-REACT_APP_API_BASE_URL=https://teu-backend.example.com
+REACT_APP_API_BASE_URL=http://localhost:3001
 ```
 
-> `REACT_APP_SUPABASE_ANON_KEY` continua a ser aceite como fallback para compatibilidade, mas a preferência deve ser `REACT_APP_SUPABASE_PUBLISHABLE_KEY`.
+O backend precisa pelo menos de:
 
-### Backend
 ```env
 SUPABASE_URL=https://teu-projeto.supabase.co
 SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
 SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
-ARTICLES_TABLE=articles
-GEMINI_API_KEY=xxx
-CORS_ORIGINS=https://teu-site.netlify.app,http://localhost:3000,http://localhost:8888
+CORS_ORIGINS=http://localhost:3000
 PORT=3001
 ```
 
-## Como configurar a tabela de artigos no Supabase
-1. Abre o SQL Editor no Supabase.
-2. Executa o conteúdo de `supabase/migrations/20260418_create_articles.sql`.
-3. Confirma que a tabela `public.articles` foi criada.
-
-## Como importar os artigos do JSON para a base de dados
-1. Garante que `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão definidas no ambiente local.
-2. Corre:
+As chaves reais nunca devem ser commitadas.
 
-```bash
-npm install
-npm run seed:articles
-```
-
-O script vai ler `src/data/artigos.json` e fazer `upsert` por batches para `public.articles`.
+---
 
 ## Arranque local
+
 ### Frontend
+
 ```bash
-npm install
 npm start
 ```
 
 ### Backend
+
 ```bash
 cd server
-npm install
 npm start
 ```
 
-## QA recomendado antes de publicar
-### QA estático
+### Worker automático em modo teste
+
+Sem enviar emails:
+
+```bash
+cd server
+npm run worker:campaigns:dry-run
+```
+
+Com envio real:
+
+```bash
+cd server
+npm run worker:campaigns:send
+```
+
+Usa o envio real apenas com variáveis IMAP, Resend e Supabase corretamente configuradas.
+
+---
+
+## Supabase
+
+### Migrations principais
+
+Executa as migrations em `supabase/migrations/` pela ordem natural dos ficheiros.
+
+As migrations relevantes incluem:
+
+- criação da tabela `articles`;
+- campos de preço adicionais;
+- bucket de PDFs automáticos;
+- tabela `automatic_campaigns`;
+- retenção/limpeza de campanhas automáticas com 5 dias.
+
+A migration da limpeza é:
+
+```text
+supabase/migrations/20260521_automatic_campaigns_cleanup_5_days.sql
+```
+
+### Importação de artigos
+
+Com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` definidos:
+
+```bash
+npm run seed:articles
+```
+
+Para catálogos grandes, evita carregar tudo no browser. Usa pesquisa server-side e paginação controlada.
+
+---
+
+## Render
+
+Depois de mover o processamento automático para Cloud Run, o Render deve ficar com a configuração leve.
+
+Usa como base:
+
+```text
+render/env-after-cloudrun.example
+```
+
+Configuração crítica:
+
+```env
+CAMPAIGN_EMAIL_WORKER_ENABLED=0
+CAMPAIGN_EMAIL_WORKER_RUN_ON_START=0
+CAMPAIGN_EMAIL_SEND_ENABLED=0
+WARM_ARTICLES_CACHE=0
+NODE_OPTIONS=--max-old-space-size=384
+```
+
+Se estas variáveis estiverem erradas, o Render pode voltar a tentar ler IMAP, abrir Chromium ou enviar emails. Isso não é desejado.
+
+---
+
+## Cloud Run Job
+
+O Cloud Run Job é responsável pelas campanhas automáticas recebidas por email.
+
+### Serviços Google usados
+
+- Cloud Run Jobs;
+- Cloud Build;
+- Artifact Registry;
+- Cloud Scheduler;
+- Secret Manager.
+
+### Região recomendada
+
+Para Portugal, o Job e o Artifact Registry ficam em Madrid:
+
+```text
+europe-southwest1
+```
+
+O Cloud Scheduler pode não disponibilizar essa região. Nesse caso, usa uma região europeia suportada, por exemplo:
+
+```text
+europe-west1
+```
+
+### Secrets necessários
+
+Cria estes secrets no Secret Manager:
+
+```text
+campaign-imap-pass
+resend-api-key
+supabase-url
+supabase-service-role-key
+supabase-publishable-key
+```
+
+O worker lê estes secrets como variáveis:
+
+```env
+CAMPAIGN_IMAP_PASS
+RESEND_API_KEY
+SUPABASE_URL
+SUPABASE_SERVICE_ROLE_KEY
+SUPABASE_PUBLISHABLE_KEY
+```
+
+### Service account do Job
+
+A service account de runtime deve ser:
+
+```text
+cloud-run-campaign-worker@<PROJECT_ID>.iam.gserviceaccount.com
+```
+
+Ela só precisa de acesso aos secrets:
+
+```text
+Secret Manager Secret Accessor
+```
+
+### Cloud Build
+
+O deploy do worker é feito por `cloudbuild.yaml`.
+
+Fluxo:
+
+```text
+push para main
+  ↓
+Cloud Build
+  ↓
+Docker build
+  ↓
+Artifact Registry
+  ↓
+Cloud Run Job deploy
+```
+
+O `cloudbuild.yaml` também define as envs e os secrets do Job para evitar que um deploy futuro apague configurações feitas manualmente.
+
+---
+
+## Scheduler recomendado
+
+Como o volume esperado é baixo, normalmente até 2 emails por dia, não é necessário correr a cada minuto.
+
+Recomendado:
+
+```cron
+*/10 * * * *
+```
+
+Se precisares de reação mais rápida:
+
+```cron
+*/5 * * * *
+```
+
+Evita `* * * * *` sem necessidade. Funciona, mas cria muitas execuções vazias.
+
+Uma arquitetura ainda mais avançada seria usar Gmail API Watch + Pub/Sub + Cloud Run Service para executar apenas quando chega email novo. Essa abordagem é mais eficiente, mas exige OAuth, Pub/Sub, persistência de `historyId` e renovação periódica do watch.
+
+---
+
+## Limpeza automática de campanhas
+
+A limpeza corre no início de cada execução do Cloud Run Job.
+
+Ela remove campanhas automáticas expiradas com base em:
+
+- `expires_at` ultrapassado;
+- ou `created_at` com mais de `AUTOMATIC_CAMPAIGN_CLEANUP_DAYS` dias.
+
+Também existe endpoint manual protegido:
+
+```http
+POST /api/campanhas-automaticas/limpar-expiradas
+```
+
+Payload recomendado para teste:
+
+```json
+{
+  "dryRun": true,
+  "maxAgeDays": 5,
+  "batchSize": 100
+}
+```
+
+Usa `dryRun: true` antes de apagar definitivamente.
+
+---
+
+## Qualidade e validação
+
+Antes de publicar alterações, corre:
+
 ```bash
 npm run qa:static
+npm --prefix server run smoke
 ```
 
-### Testes frontend
+Se alterares frontend, também corre:
+
 ```bash
-npm run test:ci
+npm run build
 ```
 
-### Smoke tests manuais
-- login com utilizador válido
-- fluxo obrigatório de onboarding
-- homepage a carregar artigos
-- popup de IA
-- criação de campanha manual
-- criação de campanha por Excel
-- impressão de etiquetas
-- histórico por loja
-- `GET /api/health`
-
-## Notas de arquitetura
-- o frontend já não deve importar `src/data/artigos.json` diretamente
-- a tabela `articles` é consumida pelo backend
-- a atualização dos artigos enriquecidos é feita no backend e persistida no Supabase
-- as tabelas `profiles` e `campaigns` continuam a ser acedidas diretamente pelo cliente Supabase
-
-## Próximos passos recomendados
-- dividir `Homepage`, `EtiquetasCampanha` e `EtiquetasCampanhaExcel` em componentes menores
-- acrescentar testes de integração para a API
-- acrescentar E2E com Playwright
-- mover `profiles` e `campaigns` para uma camada de API se precisares de auditoria/controlo mais forte
+Se alterares regras de etiqueta, valida sempre:
+
+1. geração manual;
+2. geração automática;
+3. PDF recebido por email;
+4. impressão real em A4;
+5. comparação visual com a etiqueta manual.
+
+---
+
+## Checklist de produção
+
+Antes de considerar uma versão pronta para uso real:
+
+- Render com worker desligado;
+- Cloud Run Job executa manualmente com sucesso;
+- Scheduler ativo;
+- secrets configurados no Secret Manager;
+- Resend envia corretamente;
+- Gmail IMAP autentica com app password;
+- Supabase Storage recebe PDFs;
+- PDFs automáticos têm layout correto;
+- limpeza de 5 dias ativa;
+- logs sem erros recorrentes;
+- orçamento/billing monitorizado no Google Cloud.
+
+---
+
+## Notas operacionais
+
+- Não publicar `.env` nem chaves reais no GitHub.
+- Não ativar fallback aproximado em produção se o objetivo for layout fiel.
+- Não correr o worker de email no Render e no Cloud Run ao mesmo tempo.
+- Não aumentar `CAMPAIGN_EMAIL_MAX_MESSAGES` sem necessidade.
+- Não carregar 250 mil artigos no browser.
+- Usar `dry-run` sempre que estiveres a testar limpeza ou alterações de processamento.
+
+---
+
+## Documentos complementares
+
+- `CLOUD_RUN_WORKER_DEPLOY.md`
+- `LIMPEZA_AUTOMATICA_PROMOCOES_5_DIAS.md`
+- `SENIOR_UPGRADE_REPORT.md`
+- `README_AUTOMACAO_CAMPANHAS.md`
+
+Este README descreve o estado atual recomendado do projeto. Se a arquitetura mudar, este ficheiro deve ser atualizado na mesma alteração de código.
