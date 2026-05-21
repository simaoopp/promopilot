# Limpeza automática de promoções automáticas com mais de 5 dias

## Objetivo

As campanhas/etiquetas automáticas geradas por email passam a ter retenção curta: **5 dias**.

Quando uma campanha automática ultrapassa esse prazo, o sistema remove:

1. a linha correspondente em `automatic_campaigns`;
2. os PDFs associados no bucket Supabase Storage `automatic-campaign-pdfs`, quando existirem caminhos guardados em `pdfs.*Path`.

## Onde corre

A limpeza corre automaticamente no início de cada execução do worker one-shot:

```text
Cloud Scheduler → Cloud Run Job → limpeza de expiradas → leitura IMAP → processamento de emails novos
```

A limpeza não bloqueia o processamento de emails se houver uma falha temporária ao apagar PDFs do storage. Se a eliminação da linha na base de dados falhar, o erro é reportado.

## Variáveis de ambiente

```env
AUTOMATIC_CAMPAIGN_HISTORY_DAYS=5
AUTOMATIC_CAMPAIGN_CLEANUP_ENABLED=1
AUTOMATIC_CAMPAIGN_CLEANUP_DAYS=5
AUTOMATIC_CAMPAIGN_CLEANUP_BATCH_SIZE=100
```

### Significado

- `AUTOMATIC_CAMPAIGN_HISTORY_DAYS=5`: novas campanhas recebem `expires_at = now + 5 dias`.
- `AUTOMATIC_CAMPAIGN_CLEANUP_ENABLED=1`: ativa a limpeza automática.
- `AUTOMATIC_CAMPAIGN_CLEANUP_DAYS=5`: apaga campanhas com `created_at` superior a 5 dias ou `expires_at` ultrapassado.
- `AUTOMATIC_CAMPAIGN_CLEANUP_BATCH_SIZE=100`: remove no máximo 100 campanhas por execução para evitar operações grandes.

## Endpoint manual

Também existe endpoint protegido para limpeza manual:

```http
POST /api/campanhas-automaticas/limpar-expiradas
```

Payload opcional:

```json
{
  "dryRun": true,
  "maxAgeDays": 5,
  "batchSize": 100
}
```

Usa `dryRun: true` primeiro para ver o que seria removido sem apagar nada.

## Supabase migration

Foi adicionada a migration:

```text
supabase/migrations/20260521_automatic_campaigns_cleanup_5_days.sql
```

Ela altera o default de `expires_at` para 5 dias e adiciona índices úteis para a limpeza.
