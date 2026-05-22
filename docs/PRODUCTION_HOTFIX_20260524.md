# Hotfix 2026-05-24 — impressão, pesquisa e inbound email

## Corrigido

1. Modo automático A5/A6
   - Agora imprime sempre todas as folhas A6 primeiro.
   - Depois imprime as folhas A5.

2. Pesquisa de artigos
   - Limite visual reduzido para resultados úteis.
   - Timeout controlado no frontend.
   - RPC otimizada para evitar `count(*)` sobre catálogos grandes.
   - Índices adicionais para `organization_id + artigo/codigo_barras` e trigram.

3. Email automático
   - Preparado para Resend Inbound via webhook.
   - Gmail/IMAP deixa de ser obrigatório.

## Migration a aplicar

```text
supabase/migrations/20260524_fast_article_search_resend_inbound.sql
```

Aplicar primeiro em staging. Em produção, aplicar depois de backup.

## Deploy novo

- Render: deploy normal para correções frontend/backend leves.
- Cloud Run Service inbound: usar `cloudbuild.inbound.yaml`.
- Cloud Scheduler antigo: pausar quando Resend Inbound estiver validado.
