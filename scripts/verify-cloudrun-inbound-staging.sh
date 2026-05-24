#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-etiquetas-prom-prod}"
REGION="${REGION:-europe-southwest1}"
SERVICE="${SERVICE:-etiquetas-prom-inbound-webhook-staging}"

printf '\n== Cloud Run service ==\n'
gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='table(metadata.name,status.url,spec.template.spec.serviceAccountName)'

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

if ! grep -A1 'name: CAMPAIGN_EMAIL_SEND_ENABLED' <<<"$ENV_YAML" | grep -q 'value: "0"\|value: 0'; then
  echo 'ERRO: CAMPAIGN_EMAIL_SEND_ENABLED devia estar 0 no primeiro ciclo de staging'
  exit 1
fi

if ! grep -A1 'name: AUTOMATIC_CAMPAIGN_BUCKET' <<<"$ENV_YAML" | grep -q 'automatic-campaign-pdfs-staging'; then
  echo 'ERRO: bucket não parece ser de staging'
  exit 1
fi

if grep -q 'automatic-campaign-pdfs$\|supabase-url:latest\|supabase-service-role-key:latest\|resend-api-key:latest\|resend-webhook-secret:latest' <<<"$ENV_YAML"; then
  echo 'ERRO: foram encontrados indícios de configuração/secrets de produção'
  exit 1
fi

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
printf '\n== Health ==\n'
curl -fsS "$URL/health" || curl -fsS "$URL/api/health" || true
printf '\n\nOK: validação básica concluída. URL do webhook Resend staging:\n%s/api/webhooks/resend/inbound\n' "$URL"
