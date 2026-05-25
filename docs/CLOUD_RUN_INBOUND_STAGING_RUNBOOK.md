# Runbook sénior — Cloud Run Inbound Staging

## Estado validado

Este runbook documenta o staging isolado do webhook Resend Inbound.

Ambiente oficial:

```text
Projeto Google Cloud: etiquetas-prom-staging-2026
Região: europe-southwest1
Branch: staging
Cloud Build Trigger: etiquetas-prom-inbound-staging
Cloud Build service account: cb-deploy-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
Cloud Run Service: etiquetas-prom-inbound-webhook-staging
Cloud Run runtime service account: cr-runtime-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
Supabase: staging
Resend: mesma conta, webhook staging separado
```

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

---

## 1. Regras de segurança

```text
main -> produção
staging -> Google Cloud staging
```

Nunca usar secrets, service accounts ou triggers de produção no projeto staging.

O projeto staging oficial é:

```text
etiquetas-prom-staging-2026
```

O projeto `etiquetas-prom-staging`, se existir, não deve ter triggers ativos para este fluxo.

---

## 2. Secrets obrigatórios no Secret Manager

Secrets esperados no projeto `etiquetas-prom-staging-2026`:

```text
supabase-url-staging
supabase-publishable-key-staging
supabase-service-role-key-staging
resend-api-key-staging
resend-webhook-secret-staging
campaign-store-email-angra-staging
campaign-store-email-praia-staging
campaign-store-email-valados-staging
```

Criar, se necessário:

```bash
PROJECT_ID=etiquetas-prom-staging-2026

for SECRET in \
  supabase-url-staging \
  supabase-publishable-key-staging \
  supabase-service-role-key-staging \
  resend-api-key-staging \
  resend-webhook-secret-staging \
  campaign-store-email-angra-staging \
  campaign-store-email-praia-staging \
  campaign-store-email-valados-staging; do
  gcloud secrets create "$SECRET" \
    --replication-policy=automatic \
    --project="$PROJECT_ID" || true
done
```

Adicionar ou rodar valores:

```bash
printf '%s' '<SUPABASE_URL_STAGING>' | gcloud secrets versions add supabase-url-staging --data-file=- --project=etiquetas-prom-staging-2026
printf '%s' '<SUPABASE_PUBLISHABLE_KEY_STAGING>' | gcloud secrets versions add supabase-publishable-key-staging --data-file=- --project=etiquetas-prom-staging-2026
printf '%s' '<SUPABASE_SERVICE_ROLE_KEY_STAGING>' | gcloud secrets versions add supabase-service-role-key-staging --data-file=- --project=etiquetas-prom-staging-2026
printf '%s' '<RESEND_API_KEY_STAGING>' | gcloud secrets versions add resend-api-key-staging --data-file=- --project=etiquetas-prom-staging-2026
printf '%s' '<RESEND_WEBHOOK_SECRET_STAGING>' | gcloud secrets versions add resend-webhook-secret-staging --data-file=- --project=etiquetas-prom-staging-2026
printf '%s' '<EMAIL_TESTE>' | gcloud secrets versions add campaign-store-email-angra-staging --data-file=- --project=etiquetas-prom-staging-2026
printf '%s' '<EMAIL_TESTE>' | gcloud secrets versions add campaign-store-email-praia-staging --data-file=- --project=etiquetas-prom-staging-2026
printf '%s' '<EMAIL_TESTE>' | gcloud secrets versions add campaign-store-email-valados-staging --data-file=- --project=etiquetas-prom-staging-2026
```

---

## 3. Permissões da service account runtime

A service account runtime do Cloud Run staging precisa ler os secrets:

```bash
PROJECT_ID=etiquetas-prom-staging-2026
RUNTIME_SA="cr-runtime-staging@${PROJECT_ID}.iam.gserviceaccount.com"

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
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID"
done
```

---

## 4. Artifact Registry

Repositório esperado:

```text
europe-southwest1-docker.pkg.dev/etiquetas-prom-staging-2026/etiquetas-prom
```

Criar, se necessário:

```bash
gcloud artifacts repositories create etiquetas-prom \
  --repository-format=docker \
  --location=europe-southwest1 \
  --description="Docker images for Etiquetas Prom staging" \
  --project=etiquetas-prom-staging-2026 || true
```

---

## 5. Cloud Build Trigger staging

Configuração final:

```text
Nome: etiquetas-prom-inbound-staging
Região: europe-southwest1
Branch: ^staging$
Build config: cloudbuild.inbound.staging.yaml
Service account: cb-deploy-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
Substitution obrigatória:
_DEFAULT_ORGANIZATION_ID=7b787773-e003-4efe-8e20-4a4439dd9e78
```

Validar:

```bash
gcloud builds triggers list \
  --project=etiquetas-prom-staging-2026 \
  --region=europe-southwest1 \
  --format="table(name,filename,serviceAccount)"
```

O projeto errado não deve ter trigger ativo:

```bash
gcloud builds triggers list \
  --project=etiquetas-prom-staging \
  --region=europe-southwest1 \
  --format="table(id,name,disabled,filename)"
```

---

## 6. Cloud Run Service staging

Serviço esperado:

```text
etiquetas-prom-inbound-webhook-staging
```

Validar:

```bash
gcloud run services describe etiquetas-prom-inbound-webhook-staging \
  --region=europe-southwest1 \
  --project=etiquetas-prom-staging-2026 \
  --format="value(spec.template.spec.serviceAccountName)"
```

Resultado esperado:

```text
cr-runtime-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
```

Validar envs:

```bash
gcloud run services describe etiquetas-prom-inbound-webhook-staging \
  --region=europe-southwest1 \
  --project=etiquetas-prom-staging-2026 \
  --format="yaml(spec.template.spec.containers[0].env)"
```

Checklist esperada:

```text
NODE_ENV=staging
CAMPAIGN_RESEND_INBOUND_ENABLED=1
CAMPAIGN_EMAIL_SEND_ENABLED=0 em modo seguro
AUTOMATIC_CAMPAIGN_BUCKET=automatic-campaign-pdfs-staging
CAMPAIGN_DEFAULT_ORGANIZATION_ID=7b787773-e003-4efe-8e20-4a4439dd9e78
Secrets com sufixo -staging
Sem secrets de produção
```

---

## 7. Webhook Resend staging

URL atual do serviço:

```bash
gcloud run services describe etiquetas-prom-inbound-webhook-staging \
  --region=europe-southwest1 \
  --project=etiquetas-prom-staging-2026 \
  --format="value(status.url)"
```

Endpoint para a Resend:

```text
https://<cloud-run-url>/api/webhooks/resend/inbound
```

Evento:

```text
email.received
```

Depois de criar/alterar o webhook staging na Resend, copiar o signing secret desse webhook para:

```text
resend-webhook-secret-staging
```

Exemplo:

```bash
printf '%s' '<RESEND_WEBHOOK_SECRET_STAGING>' | \
gcloud secrets versions add resend-webhook-secret-staging \
  --data-file=- \
  --project=etiquetas-prom-staging-2026
```

Depois correr novamente o trigger de staging para redeploy.

---

## 8. Teste funcional seguro

Com `CAMPAIGN_EMAIL_SEND_ENABLED=0`:

```text
Resend staging -> Cloud Run staging -> Supabase staging -> PDF/storage
```

Validações:

```text
Cloud Run responde 202
Sem erro 500 nos logs
Registo criado no Supabase staging
Campanha automática associada ao organization_id correto
PDF criado no bucket automatic-campaign-pdfs-staging, se o email tiver dados válidos
Nenhum email enviado
```

Logs:

```bash
gcloud run services logs read etiquetas-prom-inbound-webhook-staging \
  --region=europe-southwest1 \
  --project=etiquetas-prom-staging-2026 \
  --limit=300
```

---

## 9. Teste com envio controlado

Só usar `CAMPAIGN_EMAIL_SEND_ENABLED=1` quando:

```text
campaign-store-email-angra-staging
campaign-store-email-praia-staging
campaign-store-email-valados-staging
```

apontam para emails de teste.

Resultado esperado se os três apontam para o mesmo email de teste:

```text
3 emails recebidos, um por loja
```

Depois do teste, voltar a `CAMPAIGN_EMAIL_SEND_ENABLED=0` no YAML e fazer deploy pelo trigger para evitar drift.

---

## 10. Limpeza após validação

Ver `docs/STAGING_CLEANUP_CHECKLIST.md`.
