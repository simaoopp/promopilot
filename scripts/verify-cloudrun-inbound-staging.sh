#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-etiquetas-prom-staging-2026}"
REGION="${REGION:-europe-southwest1}"
SERVICE="${SERVICE:-etiquetas-prom-inbound-webhook-staging}"
EXPECTED_RUNTIME_SA="${EXPECTED_RUNTIME_SA:-cr-runtime-staging@${PROJECT_ID}.iam.gserviceaccount.com}"
EXPECTED_ORG_ID="${EXPECTED_ORG_ID:-7b787773-e003-4efe-8e20-4a4439dd9e78}"

printf '\n== Cloud Run service ==\n'
gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='table(metadata.name,status.url,spec.template.spec.serviceAccountName)'

SERVICE_ACCOUNT="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
if [[ "$SERVICE_ACCOUNT" != "$EXPECTED_RUNTIME_SA" ]]; then
  echo "ERRO: runtime service account inesperada: $SERVICE_ACCOUNT"
  echo "Esperado: $EXPECTED_RUNTIME_SA"
  exit 1
fi

printf '\n== Environment variables/secrets visible metadata ==\n'
gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='yaml(spec.template.spec.containers[0].env)'

printf '\n== Sanity checks ==\n'
ENV_YAML="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='yaml(spec.template.spec.containers[0].env)')"

required=(
  'NODE_ENV'
  'CAMPAIGN_RESEND_INBOUND_ENABLED'
  'CAMPAIGN_EMAIL_SEND_ENABLED'
  'AUTOMATIC_CAMPAIGN_BUCKET'
  'CAMPAIGN_DEFAULT_ORGANIZATION_ID'
  'SUPABASE_URL'
  'SUPABASE_SERVICE_ROLE_KEY'
  'RESEND_API_KEY'
  'RESEND_WEBHOOK_SECRET'
  'CAMPAIGN_STORE_EMAIL_ANGRA'
  'CAMPAIGN_STORE_EMAIL_PRAIA'
  'CAMPAIGN_STORE_EMAIL_VALADOS'
)

for key in "${required[@]}"; do
  if ! grep -q "name: ${key}" <<<"$ENV_YAML"; then
    echo "ERRO: falta ${key} no Cloud Run staging"
    exit 1
  fi
done

if ! grep -A1 'name: NODE_ENV' <<<"$ENV_YAML" | grep -q 'value: staging'; then
  echo 'ERRO: NODE_ENV não está staging'
  exit 1
fi

if ! grep -A1 'name: CAMPAIGN_RESEND_INBOUND_ENABLED' <<<"$ENV_YAML" | grep -q "value: '1'\|value: 1"; then
  echo 'ERRO: CAMPAIGN_RESEND_INBOUND_ENABLED devia estar 1'
  exit 1
fi

if ! grep -A1 'name: CAMPAIGN_EMAIL_SEND_ENABLED' <<<"$ENV_YAML" | grep -q "value: '0'\|value: 0"; then
  echo 'AVISO: CAMPAIGN_EMAIL_SEND_ENABLED não está 0. Isto só é aceitável durante teste controlado.'
fi

if ! grep -A1 'name: AUTOMATIC_CAMPAIGN_BUCKET' <<<"$ENV_YAML" | grep -q 'automatic-campaign-pdfs-staging'; then
  echo 'ERRO: bucket não parece ser de staging'
  exit 1
fi

if ! grep -A1 'name: CAMPAIGN_DEFAULT_ORGANIZATION_ID' <<<"$ENV_YAML" | grep -q "$EXPECTED_ORG_ID"; then
  echo 'ERRO: CAMPAIGN_DEFAULT_ORGANIZATION_ID inesperado'
  echo "Esperado: $EXPECTED_ORG_ID"
  exit 1
fi

for secret in \
  supabase-url-staging \
  supabase-publishable-key-staging \
  supabase-service-role-key-staging \
  resend-api-key-staging \
  resend-webhook-secret-staging \
  campaign-store-email-angra-staging \
  campaign-store-email-praia-staging \
  campaign-store-email-valados-staging; do
  if ! grep -q "name: ${secret}" <<<"$ENV_YAML"; then
    echo "ERRO: secret ${secret} não encontrado na configuração do Cloud Run"
    exit 1
  fi
done

if grep -q 'automatic-campaign-pdfs$\|supabase-url:latest\|supabase-service-role-key:latest\|resend-api-key:latest\|resend-webhook-secret:latest' <<<"$ENV_YAML"; then
  echo 'ERRO: foram encontrados indícios de configuração/secrets de produção'
  exit 1
fi

printf '\n== Trigger sanity ==\n'
gcloud builds triggers list \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='table(name,filename,serviceAccount)'

printf '\n== Wrong project trigger check ==\n'
gcloud builds triggers list \
  --project='etiquetas-prom-staging' \
  --region="$REGION" \
  --format='table(id,name,disabled,filename)' || true

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
printf '\nOK: validação básica concluída. URL do webhook Resend staging:\n%s/api/webhooks/resend/inbound\n' "$URL"
