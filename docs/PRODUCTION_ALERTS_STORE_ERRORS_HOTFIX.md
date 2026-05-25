# Production alerting hotfix — per-store campaign failures

This patch adds structured error logging to the Resend inbound webhook when one or more store-level campaign processing steps fail but the webhook still returns HTTP 202.

Why this is needed:

- `processAutomaticCampaignEmail` catches per-store errors such as PDF generation failures, missing store recipient emails, or Resend send failures.
- Those failures are saved in the campaign row, but without an explicit log line Google Cloud log-based metrics cannot alert reliably.
- This patch logs one line with prefix:

```text
[resend-inbound] Store processing errors:
```

The JSON payload includes:

- messageId
- subject
- organizationId
- storeErrors
- errors[] with storeKey, store, totalItems and error

Expected alert filters can match:

```text
[resend-inbound] Store processing errors
Falha ao gerar PDF
Resend API falhou
Resend API timeout
Email da loja
API de email não configurada
```

Rollout:

1. Apply to staging first.
2. Run smoke check.
3. Deploy staging.
4. Send a controlled bad test if needed.
5. Promote to main/production.
6. Create Google Cloud log-based metrics and alert policies.
