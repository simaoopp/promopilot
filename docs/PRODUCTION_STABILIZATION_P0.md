# Prioridade 0 — fecho de estabilização da produção atual

Objetivo: fechar a produção controlada da Expert antes de avançar para mudanças SaaS maiores.

## Estado no código deste pacote

- Resend Inbound existe como endpoint público assinado: `POST /api/webhooks/resend/inbound`.
- O endpoint é registado antes de `express.json`, preservando o raw body para validação Svix/Resend.
- O modo `CAMPAIGN_RESEND_INBOUND_ENABLED=1` impede que o worker IMAP permanente arranque sem necessidade.
- Homepage faz apenas warmup leve em `/api/ping`; não pesquisa artigos automaticamente.
- `/api/artigos` devolve resposta degradada controlada quando Supabase devolve `57014 statement timeout`.
- `article_search_index` existe com rebuild, trigger de sincronização e RPC index-first.
- Campanhas automáticas usam dedupe por `email_message_id` + loja e, opcionalmente, por assunto + loja.
- PDFs automáticos são guardados em bucket privado, em path por organização/data/email/loja.
- Limpeza automática remove linhas e PDFs expirados com retenção padrão de 5 dias.

## Correções pequenas incluídas neste fecho

- Alinhado o teste de `buildArtigosCatalogoPath()` com o limite real de 1000 linhas por página.
- Corrigido aviso de boot quando `SUPABASE_SERVICE_ROLE_KEY` não existe no Render/API normal: a pesquisa normal de artigos continua via RPC autenticada; ficam indisponíveis apenas rotas/processos que precisam de service role.
- Clarificada documentação/env: service role não deve estar no frontend nem no Render normal da API pública; deve ficar em Cloud Run/Secret Manager quando necessário.

## Checklist final de produção

### 1. Resend Inbound oficial

Confirmar no Cloud Run Service inbound:

```bash
gcloud run services describe etiquetas-prom-inbound-webhook \
  --region=europe-southwest1 \
  --format='value(status.url)'
```

Confirmar envs/secrets efetivos:

```bash
gcloud run services describe etiquetas-prom-inbound-webhook \
  --region=europe-southwest1 \
  --format='yaml(spec.template.spec.containers[0].env)'
```

Obrigatório:

```text
NODE_ENV=production
CAMPAIGN_RESEND_INBOUND_ENABLED=1
CAMPAIGN_EMAIL_WORKER_ENABLED=0
CAMPAIGN_EMAIL_SEND_ENABLED=1
CAMPAIGN_EMAIL_PROVIDER=resend
CAMPAIGN_DEFAULT_ORGANIZATION_ID=<uuid real da Expert>
SUPABASE_URL via Secret Manager
SUPABASE_PUBLISHABLE_KEY via Secret Manager
SUPABASE_SERVICE_ROLE_KEY via Secret Manager
RESEND_API_KEY via Secret Manager
RESEND_WEBHOOK_SECRET via Secret Manager
```

### 2. Gmail/IMAP antigo pausado

Se ainda existir Cloud Scheduler/Job antigo, pausar:

```bash
gcloud scheduler jobs list --location=europe-southwest1
```

Depois:

```bash
gcloud scheduler jobs pause <job-imap-antigo> --location=europe-southwest1
```

Critério: não pode haver processamento recorrente por IMAP em paralelo com o webhook Resend.

### 3. Sem erro 500 recorrente

Ver últimas 24h do inbound:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="etiquetas-prom-inbound-webhook" AND severity>=ERROR' \
  --freshness=24h \
  --limit=100 \
  --format=json
```

Ver últimas 24h do Render/API através do painel Render ou logs equivalentes. Critério: sem padrão recorrente de `500`, `statement timeout`, `Assinatura inválida` em emails válidos, falha de PDF ou falha de envio.

### 4. Pesquisa de artigos sem timeout crítico

Executar na API com sessão real de utilizador:

```bash
curl -H "Authorization: Bearer <USER_JWT>" \
  'https://<api-render>/api/artigos?q=smeg&limit=30&includeCount=0'
```

Critérios:

```text
HTTP 200
ok=true
searchTimedOut=false em pesquisas normais
items devolvido em tempo aceitável
sem erro visual no frontend
```

Se aparecer `searchTimedOut=true`, a produção continua controlada, mas o índice/backfill deve ser revisto antes de considerar P0 fechado.

### 5. Homepage sem pesquisa pesada automática

No browser/devtools, abrir a homepage e confirmar:

```text
Deve existir GET /api/ping.
Não deve existir GET /api/artigos enquanto o utilizador apenas abre ou escreve na homepage.
Ao pressionar Enter, navega para /Etiquetas?search=<termo>.
```

### 6. `article_search_index` completo

Executar no Supabase SQL Editor:

```sql
select
  (select count(*) from public.articles where organization_id is not null) as articles_with_org,
  (select count(*) from public.article_search_index) as indexed_rows;
```

Se os números não baterem, reconstruir:

```sql
select public.rebuild_article_search_index(null);
```

Confirmar trigger:

```sql
select tgname, tgenabled
from pg_trigger
where tgname = 'articles_article_search_index_sync';
```

Critério:

```text
indexed_rows = articles_with_org
trigger enabled = O
```

### 7. Seleção na página Etiquetas

Teste manual obrigatório:

```text
1. Abrir /Etiquetas.
2. Pesquisar termo A.
3. Selecionar 2 artigos.
4. Pesquisar termo B.
5. Selecionar 1 artigo.
6. Voltar ao termo A.
7. Confirmar que os 2 artigos continuam selecionados.
8. Clicar “Copiar selecionados”.
```

Critério:

```text
A seleção é mantida por chave estável artigo/armazém/EAN e não se perde ao mudar resultados visíveis.
```

### 8. PDFs chegam às lojas certas

Enviar email real de campanha para o endereço inbound Resend e confirmar:

```sql
select
  id,
  organization_id,
  store,
  status,
  email_message_id,
  email_subject,
  pdfs,
  error_message,
  created_at
from public.automatic_campaigns
order by created_at desc
limit 10;
```

Critério:

```text
1 linha por loja com artigos.
status = sent ou processed conforme CAMPAIGN_EMAIL_SEND_ENABLED.
pdfs contém path/email da loja correta.
error_message vazio.
```

### 9. Não duplicar o mesmo email

Reenviar exatamente o mesmo webhook/email de teste ou repetir o evento no Resend, se disponível.

Critério SQL:

```sql
select email_message_id, store, count(*)
from public.automatic_campaigns
where created_at > now() - interval '24 hours'
group by email_message_id, store
having count(*) > 1;
```

Resultado esperado: zero linhas.

### 10. Limpeza automática 5 dias

Confirmar retenção:

```sql
select column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'automatic_campaigns'
  and column_name = 'expires_at';
```

Confirmar candidatos antigos:

```sql
select count(*)
from public.automatic_campaigns
where created_at < now() - interval '5 days'
   or expires_at < now();
```

Depois de o webhook correr, a limpeza aplicacional deve remover linhas e PDFs expirados. Se houver candidatos persistentes, executar uma chamada real ao inbound ou correr o worker/script em ambiente seguro com limpeza ativa.

### 11. Tag estável no GitHub

Quando todos os pontos acima estiverem verdes durante 24–48h:

```bash
git status
git tag -a production-stable-p0-2026-05-24 -m "Produção Expert estável após Resend Inbound e pesquisa controlada"
git push origin production-stable-p0-2026-05-24
```

## Critério final de fecho

```text
Produção sem erros recorrentes durante 24–48h.
Resend Inbound é o fluxo oficial.
IMAP antigo está pausado.
Pesquisa de artigos não gera timeout crítico.
Homepage não dispara pesquisa pesada.
article_search_index completo e sincronizado.
PDFs chegam às lojas certas.
Campanhas antigas são limpas.
Tag estável criada no GitHub.
```
