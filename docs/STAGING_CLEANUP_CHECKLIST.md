# Checklist — Limpeza pós-validação do staging

## Objetivo

Deixar o projeto `etiquetas-prom-staging-2026` limpo, com apenas os recursos necessários.

Manter:

```text
Cloud Build deployer:
cb-deploy-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com

Cloud Run runtime:
cr-runtime-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com

Cloud Run Service:
etiquetas-prom-inbound-webhook-staging

Cloud Build Trigger:
etiquetas-prom-inbound-staging

Artifact Registry:
etiquetas-prom
```

Não apagar a Compute Engine default service account.

---

## 1. Voltar staging para modo seguro

Depois do teste de envio, garantir:

```text
CAMPAIGN_EMAIL_SEND_ENABLED=0
```

Preferência sénior: alterar no `cloudbuild.inbound.staging.yaml`, fazer commit na branch `staging` e deixar o trigger redeployar.

Travão imediato, se necessário:

```bash
gcloud run services update etiquetas-prom-inbound-webhook-staging \
  --region=europe-southwest1 \
  --project=etiquetas-prom-staging-2026 \
  --update-env-vars=CAMPAIGN_EMAIL_SEND_ENABLED=0
```

Depois confirmar:

```bash
gcloud run services describe etiquetas-prom-inbound-webhook-staging \
  --region=europe-southwest1 \
  --project=etiquetas-prom-staging-2026 \
  --format="yaml(spec.template.spec.containers[0].env)" | grep CAMPAIGN_EMAIL_SEND_ENABLED -A2
```

---

## 2. Confirmar contas em uso

Trigger:

```bash
gcloud builds triggers list \
  --project=etiquetas-prom-staging-2026 \
  --region=europe-southwest1 \
  --format="table(name,filename,serviceAccount)"
```

Esperado:

```text
cb-deploy-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
```

Cloud Run:

```bash
gcloud run services describe etiquetas-prom-inbound-webhook-staging \
  --region=europe-southwest1 \
  --project=etiquetas-prom-staging-2026 \
  --format="value(spec.template.spec.serviceAccountName)"
```

Esperado:

```text
cr-runtime-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
```

---

## 3. Listar service accounts criadas

```bash
gcloud iam service-accounts list \
  --project=etiquetas-prom-staging-2026 \
  --format="table(displayName,email,disabled)"
```

Manter:

```text
cb-deploy-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
cr-runtime-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
```

Possíveis duplicadas a apagar depois de confirmação:

```text
cloud-build-deployer-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
cloud-run-runtime-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
```

Não apagar:

```text
<PROJECT_NUMBER>-compute@developer.gserviceaccount.com
```

---

## 4. Verificar se as duplicadas ainda têm IAM

```bash
PROJECT_ID=etiquetas-prom-staging-2026

for SA in \
  cloud-build-deployer-staging@${PROJECT_ID}.iam.gserviceaccount.com \
  cloud-run-runtime-staging@${PROJECT_ID}.iam.gserviceaccount.com; do
  echo "== $SA =="
  gcloud projects get-iam-policy "$PROJECT_ID" \
    --flatten="bindings[].members" \
    --filter="bindings.members:${SA}" \
    --format="table(bindings.role,bindings.members)"
  gcloud iam service-accounts get-iam-policy "$SA" \
    --project="$PROJECT_ID" || true
done
```

Se não estiverem em uso, apagar:

```bash
gcloud iam service-accounts delete \
  cloud-build-deployer-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com \
  --project=etiquetas-prom-staging-2026

gcloud iam service-accounts delete \
  cloud-run-runtime-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com \
  --project=etiquetas-prom-staging-2026
```

---

## 5. Confirmar que o projeto errado não tem trigger

```bash
gcloud builds triggers list \
  --project=etiquetas-prom-staging \
  --region=europe-southwest1 \
  --format="table(id,name,disabled,filename)"
```

Esperado: vazio.

Não apagar o projeto errado sem validar que não tem recursos úteis.

---

## 6. Confirmar secrets finais

```bash
gcloud secrets list \
  --project=etiquetas-prom-staging-2026
```

Esperados:

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

---

## 7. Verificação final automática

```bash
PROJECT_ID=etiquetas-prom-staging-2026 \
REGION=europe-southwest1 \
SERVICE=etiquetas-prom-inbound-webhook-staging \
./scripts/verify-cloudrun-inbound-staging.sh
```

Resultado esperado:

```text
OK: validação básica concluída.
```
