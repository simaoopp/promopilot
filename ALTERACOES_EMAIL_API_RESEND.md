# Alterações — Envio por API Resend

## Objetivo

Substituir o envio SMTP das campanhas automáticas por uma API HTTPS, evitando os `Connection timeout` nas portas SMTP 465/587 no Render.

## Ficheiros alterados

- `server/services/automatic-campaigns/config.js`
  - Adicionadas variáveis `CAMPAIGN_EMAIL_PROVIDER`, `RESEND_API_KEY`, `CAMPAIGN_EMAIL_FROM_ADDRESS`, `CAMPAIGN_EMAIL_REPLY_TO`, `CAMPAIGN_EMAIL_API_TIMEOUT_MS` e `CAMPAIGN_EMAIL_API_DEBUG`.
  - Adicionada função `hasEmailApiConfig()`.

- `server/services/automatic-campaigns/emailSenderService.js`
  - Adicionado envio por Resend API via `fetch` HTTPS.
  - Mantido envio SMTP como fallback/legado com `CAMPAIGN_EMAIL_PROVIDER=smtp`.
  - Anexos PDF enviados em Base64.
  - Assunto mantém o padrão `PROMOÇÃO - Etiquetas de campanha - Loja`.

- `server/routes/automaticCampaigns.js`
  - Config endpoint agora devolve `emailProvider` e `emailApiConfigured`.
  - Adicionada rota `POST /api/campanhas-automaticas/testar-email`.
  - Mantida rota `POST /api/campanhas-automaticas/testar-smtp` por compatibilidade.

- `.env.example`
  - Atualizado para usar `CAMPAIGN_EMAIL_PROVIDER=resend` por defeito.
  - SMTP ficou opcional/legado.

- `README_AUTOMACAO_CAMPANHAS.md`
  - Adicionada documentação do envio por API.

## ENV principal

```env
CAMPAIGN_EMAIL_PROVIDER=resend
RESEND_API_KEY=COLOCAR_RESEND_API_KEY
CAMPAIGN_EMAIL_FROM_ADDRESS=Etiquetas Promo <onboarding@resend.dev>
CAMPAIGN_EMAIL_REPLY_TO=etiquetasprom@gmail.com
```
