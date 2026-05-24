# Runbook sénior — Cloud Run Inbound Staging

## Objetivo

Criar um staging real para o webhook Resend Inbound, sem tocar em produção e sem reutilizar secrets de produção.

Fluxo correto:

```text
branch staging
  -> Cloud Build Trigger: etiquetas-prom-inbound-staging
  -> cloudbuild.inbound.staging.yaml
  -> Cloud Run Service: etiquetas-prom-inbound-webhook-staging
  -> Supabase staging
  -> Resend webhook staging
```

Não confundir com `cloudbuild.staging.yaml`: esse ficheiro faz deploy de um Cloud Run Job/worker, não de um serviço HTTP para a Resend.

## 1. Secrets obrigatórios no Secret Manager

Criar estes secrets no projeto Google Cloud usado para staging:

```bash
gcloud secrets create supabase-url-staging --replication-policy=automatic
gcloud secrets create supabase-publishable-key-staging --replication-policy=automatic
gcloud secrets create supabase-service-role-key-staging --replication-policy=automatic
gcloud secrets create resend-api-key-staging --replication-policy=automatic
gcloud secrets create resend-webhook-secret-staging --replication-policy=automatic
gcloud secrets create campaign-store-email-angra-staging --replication-policy=automatic
gcloud secrets create campaign-store-email-praia-staging --replication-policy=automatic
gcloud secrets create campaign-store-email-valados-staging --replication-policy=automatic
```

Adicionar os valores:

```bash
printf '%s' '<SUPABASE_URL_STAGING>' | gcloud secrets versions add supabase-url-staging --data-file=-
printf '%s' '<SUPABASE_PUBLISHABLE_KEY_STAGING>' | gcloud secrets versions add supabase-publishable-key-staging --data-file=-
printf '%s' '<SUPABASE_SERVICE_ROLE_KEY_STAGING>' | gcloud secrets versions add supabase-service-role-key-staging --data-file=-
printf '%s' '<RESEND_API_KEY_STAGING>' | gcloud secrets versions add resend-api-key-staging --data-file=-
printf '%s' '<RESEND_WEBHOOK_SECRET_STAGING>' | gcloud secrets versions add resend-webhook-secret-staging --data-file=-
printf '%s' '<EMAIL_TESTE>' | gcloud secrets versions add campaign-store-email-angra-staging --data-file=-
printf '%s' '<EMAIL_TESTE>' | gcloud secrets versions add campaign-store-email-praia-staging --data-file=-
printf '%s' '<EMAIL_TESTE>' | gcloud secrets versions add campaign-store-email-valados-staging --data-file=-
```

## 2. Permissões da service account runtime

A service account do Cloud Run staging precisa ler os secrets:

```bash
PROJECT_ID=etiquetas-prom-prod
SA="cloud-run-campaign-worker-staging@${PROJECT_ID}.iam.gserviceaccount.com"

for SECRET in \
  supabase-url-staging \
  supabase-publishable-key-staging \
  supabase-service-role-key-staging \
  resend-api-key-staging \
  resend-webhook-secret-staging \
  campaign-store-email-angra-staging \
  campaign-store-email-praia-staging \
  campaign-store-email-valados-staging; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${SA}" \
    --role='roles/secretmanager.secretAccessor'
done
```

## 3. Artifact Registry

Se o repositório ainda não existir:

```bash
gcloud artifacts repositories create etiquetas-prom \
  --repository-format=docker \
  --location=europe-southwest1
```

## 4. Deploy manual de validação

Usar o `organization_id` real do Supabase staging:

```bash
gcloud builds submit \
  --config=cloudbuild.inbound.staging.yaml \
  --substitutions=_DEFAULT_ORGANIZATION_ID='<ORG_ID_STAGING>'
```

Por segurança, o primeiro deploy deixa:

```text
CAMPAIGN_EMAIL_SEND_ENABLED=0
```

Assim o webhook processa e gera registos/PDFs, mas não envia emails reais.

## 5. Criar Cloud Build Trigger staging

Configuração recomendada:

```text
Nome: etiquetas-prom-inbound-staging
Branch: ^staging$
Build config: cloudbuild.inbound.staging.yaml
Substitution obrigatória: _DEFAULT_ORGANIZATION_ID=<ORG_ID_STAGING>
```

Não usar `cloudbuild.inbound.yaml` no trigger de staging. Esse ficheiro continua reservado para produção.

## 6. Validar Cloud Run staging

Executar:

```bash
PROJECT_ID=etiquetas-prom-prod \
REGION=europe-southwest1 \
SERVICE=etiquetas-prom-inbound-webhook-staging \
./scripts/verify-cloudrun-inbound-staging.sh
```

Checklist esperada:

```text
NODE_ENV=staging
CAMPAIGN_RESEND_INBOUND_ENABLED=1
CAMPAIGN_EMAIL_SEND_ENABLED=0
AUTOMATIC_CAMPAIGN_BUCKET=automatic-campaign-pdfs-staging
Secrets com sufixo -staging
Sem secrets de produção
```

## 7. Configurar webhook na Resend staging

Usar o URL devolvido pelo script:

```text
https://<cloud-run-url>/api/webhooks/resend/inbound
```

Copiar o signing secret desse webhook para:

```text
resend-webhook-secret-staging
```

## 8. Primeiro teste funcional

Enviar um email de campanha de teste para o inbound da Resend staging.

Validar:

```text
Cloud Run logs sem 500
Webhook responde 202
Registo criado no Supabase staging
PDF criado no bucket automatic-campaign-pdfs-staging
Nenhum email enviado porque CAMPAIGN_EMAIL_SEND_ENABLED=0
```

## 9. Segundo teste com envio controlado

Quando o primeiro teste passar, alterar temporariamente para:

```text
CAMPAIGN_EMAIL_SEND_ENABLED=1
```

Apenas se os secrets `campaign-store-email-*-staging` apontarem para emails de teste.

## 10. Critério de conclusão

Staging só fica aprovado quando:

```text
1. main continua intocado
2. trigger staging só observa branch staging
3. Cloud Run Service staging usa apenas Supabase/Resend/secrets staging
4. webhook Resend staging gera PDF sem erro
5. envio real só acontece para emails de teste
6. produção não recebe alterações experimentais
```
