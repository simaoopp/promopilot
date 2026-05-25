# Estado atual — Staging Resend Inbound

## Ambiente aprovado

```text
Google Cloud project: etiquetas-prom-staging-2026
Region: europe-southwest1
Branch: staging
Cloud Build Trigger: etiquetas-prom-inbound-staging
Cloud Build Service Account: cb-deploy-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
Cloud Run Service: etiquetas-prom-inbound-webhook-staging
Cloud Run Runtime Service Account: cr-runtime-staging@etiquetas-prom-staging-2026.iam.gserviceaccount.com
Supabase organization_id: 7b787773-e003-4efe-8e20-4a4439dd9e78
Outbound email domain: send.promopilot.pt
```

## Testes já validados

```text
Cloud Build staging: SUCCESS
Cloud Run staging criado no projeto correto
Webhook Resend -> Cloud Run staging: POST 202
Cloud Run usa NODE_ENV=staging
Cloud Run usa secrets -staging
Trigger usa cb-deploy-staging
Runtime usa cr-runtime-staging
Projeto errado etiquetas-prom-staging sem trigger ativo
Envio via PromoPilot testado com 3 emails, um por loja
```

## Modo seguro recomendado

Depois de testes de envio, manter:

```text
CAMPAIGN_EMAIL_SEND_ENABLED=0
```

Para testar envio controlado:

```text
CAMPAIGN_EMAIL_SEND_ENABLED=1
```

apenas quando os três secrets de loja apontarem para emails de teste.
