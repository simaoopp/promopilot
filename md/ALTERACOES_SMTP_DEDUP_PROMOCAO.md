# Alterações - SMTP, título PROMOÇÃO e deduplicação

## Objetivo
Alinhar a automação das campanhas para produção:

- O título das campanhas automáticas no histórico/PDF passa a ser `PROMOÇÃO` por predefinição.
- A automação deixa de usar o assunto do email, como `Resumo Alterações_PV2_...`, como título visível.
- A deduplicação fica ativa por predefinição para evitar campanhas repetidas.
- O envio SMTP fica mais robusto, com timeout configurável, logs e fallback automático entre 465/SSL e 587/STARTTLS.

## Ficheiros alterados

- `server/services/automatic-campaigns/config.js`
- `server/services/automatic-campaigns/emailSenderService.js`
- `server/services/automatic-campaigns/automaticCampaignProcessor.js`
- `server/services/automatic-campaigns/automaticCampaignRepository.js`
- `server/routes/automaticCampaigns.js`
- `.env.example`

## Novas ENV principais

```env
CAMPAIGN_DEFAULT_TITLE=PROMOÇÃO
CAMPAIGN_TITLE_FROM_EMAIL=0
CAMPAIGN_DEDUPE_ENABLED=1
CAMPAIGN_DEDUPE_BY_SUBJECT=1
CAMPAIGN_REPROCESS_ERRORED=0
CAMPAIGN_SMTP_CONNECTION_TIMEOUT_MS=30000
CAMPAIGN_SMTP_GREETING_TIMEOUT_MS=30000
CAMPAIGN_SMTP_SOCKET_TIMEOUT_MS=60000
CAMPAIGN_SMTP_FALLBACK_ENABLED=1
CAMPAIGN_SMTP_FALLBACKS=465:ssl,587:starttls
CAMPAIGN_SMTP_DEBUG=1
```

## Nota sobre SMTP timeout
Se o Render continuar a devolver `Connection timeout` tanto em 465 como em 587, o problema é de conectividade de saída SMTP do ambiente/conta. O código agora tenta ambos os modos e grava no histórico/logs qual tentativa falhou.
