# Migração de Gmail/IMAP para Resend Inbound

## Objetivo

Substituir o fluxo antigo:

```text
Gmail IMAP → Cloud Run Job → PDF → Resend
```

por um fluxo acionado por webhook:

```text
Resend Inbound → Cloud Run Service → PDF → Resend
```

Isto remove a dependência de contas Gmail gratuitas, app passwords e IMAP.

## O que mudou no código

- Novo endpoint assinado:
  - `POST /api/webhooks/resend/inbound`
- Verificação de assinatura Svix/Resend via `RESEND_WEBHOOK_SECRET`.
- Processamento direto pelo pipeline existente de campanhas automáticas.
- `CAMPAIGN_RESEND_INBOUND_ENABLED=1` desativa o comportamento IMAP permanente.
- Novo Dockerfile:
  - `Dockerfile.cloudrun-inbound`
- Novo build/deploy:
  - `cloudbuild.inbound.yaml`

## Fora do código

1. No Resend, ativa Receiving/Inbound.
2. Usa domínio gerido `*.resend.app` se ainda não tiveres domínio próprio.
3. Cria um webhook para:

```text
https://<cloud-run-service-url>/api/webhooks/resend/inbound
```

4. Copia o signing secret do webhook para o Secret Manager:

```text
resend-webhook-secret
```

5. Cria/deploya o Cloud Run Service com `cloudbuild.inbound.yaml`.
6. Pausa o Scheduler IMAP antigo.
7. Envia um email de teste para o endereço inbound do Resend.
8. Confirma logs do Cloud Run Service e email recebido nas lojas.

## Env principal do Cloud Run Service

```env
CAMPAIGN_RESEND_INBOUND_ENABLED=1
RESEND_WEBHOOK_SECRET=<secret>
CAMPAIGN_EMAIL_SEND_ENABLED=1
CAMPAIGN_EMAIL_PROVIDER=resend
CAMPAIGN_DEFAULT_ORGANIZATION_ID=<organization_id>
```

Secrets necessários:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
```

## Importante

O endpoint é público porque o Resend precisa chamá-lo, mas fica protegido pela assinatura Svix/Resend. Sem assinatura válida, responde `401`.
