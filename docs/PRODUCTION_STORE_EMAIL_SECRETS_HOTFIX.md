# Production hotfix — store email secrets for Resend inbound

## Context

The production inbound Cloud Run service reads store recipient emails from these environment variables:

- `CAMPAIGN_STORE_EMAIL_PRAIA`
- `CAMPAIGN_STORE_EMAIL_ANGRA`
- `CAMPAIGN_STORE_EMAIL_VALADOS`

The code uses these variables when sending automatic campaign PDFs per store. If one is missing, the flow can fail with messages such as `Email da praia não configurado`.

## Permanent fix

Production Cloud Build now maps those environment variables from Secret Manager in `cloudbuild.inbound.yaml`:

- `campaign-store-email-praia` → `CAMPAIGN_STORE_EMAIL_PRAIA`
- `campaign-store-email-angra` → `CAMPAIGN_STORE_EMAIL_ANGRA`
- `campaign-store-email-valados` → `CAMPAIGN_STORE_EMAIL_VALADOS`

## Required one-time Google Cloud setup

Run in the production project before deploying this hotfix.

```bash
PROJECT_ID=etiquetas-prom-prod
REGION=europe-southwest1
RUNTIME_SA="cloud-run-campaign-worker@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"

for SECRET in \
  campaign-store-email-praia \
  campaign-store-email-angra \
  campaign-store-email-valados; do
  gcloud secrets create "$SECRET" --replication-policy=automatic --project="$PROJECT_ID" || true
done
```

Add the real email values without exposing them in git or chat:

```bash
printf '%s' 'EMAIL_REAL_PRAIA' | gcloud secrets versions add campaign-store-email-praia --data-file=- --project="$PROJECT_ID"
printf '%s' 'EMAIL_REAL_ANGRA' | gcloud secrets versions add campaign-store-email-angra --data-file=- --project="$PROJECT_ID"
printf '%s' 'EMAIL_REAL_VALADOS' | gcloud secrets versions add campaign-store-email-valados --data-file=- --project="$PROJECT_ID"
```

Grant the Cloud Run runtime account access to those secrets:

```bash
for SECRET in \
  campaign-store-email-praia \
  campaign-store-email-angra \
  campaign-store-email-valados; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID"
done
```

## Validation after deploy

```bash
gcloud run services describe etiquetas-prom-inbound-webhook \
  --region=europe-southwest1 \
  --project=etiquetas-prom-prod \
  --format="yaml(spec.template.spec.containers[0].env)" | grep -A4 "CAMPAIGN_STORE_EMAIL"
```

Expected: all three store email variables should point to Secret Manager refs, not plain values.

```bash
gcloud run services logs read etiquetas-prom-inbound-webhook \
  --region=europe-southwest1 \
  --project=etiquetas-prom-prod \
  --limit=100
```

Expected: no more `Email da praia não configurado`.
