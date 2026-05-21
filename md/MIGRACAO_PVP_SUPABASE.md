# Migração segura de PVP1/PVP2/PVP3 para Supabase

Esta migração serve para atualizar a base existente sem apagar nem sobrescrever dados arquivados.

## O que altera

- Adiciona as colunas `pvp1` e `pvp3` à tabela `public.articles`.
- Para artigos que já existem no Supabase, atualiza apenas `pvp1`, `pvp2` e `pvp3`, e só quando algum desses valores estiver diferente.
- Para artigos que ainda não existem, insere o artigo completo a partir do JSON.
- Não altera `fonte_oficial`, `titulo_oficial`, `descricao_oficial`, `caracteristicas_tecnicas`, `documentos_oficiais`, `resumo_vendedor`, `observacoes_ia`, `marca`, `modelo`, `categoria`, etc. nos artigos existentes.

## Passo 1 — Supabase SQL Editor

Executar uma vez:

```sql
alter table public.articles
  add column if not exists pvp1 text not null default '',
  add column if not exists pvp3 text not null default '';
```

Ou executar o ficheiro:

```txt
supabase/migrations/20260510_add_pvp1_pvp3_to_articles.sql
```

## Passo 2 — colocar o JSON atualizado

Coloca o JSON atualizado em:

```txt
src/data/artigos.json
```

Também podes passar outro caminho diretamente ao script.

## Passo 3 — testar sem gravar

```bash
npm run migrate:article-prices -- --dry-run
```

## Passo 4 — executar a migração

```bash
npm run migrate:article-prices
```

Ou com caminho explícito:

```bash
node scripts/migrate-artigos-prices-to-supabase.mjs ./artigos_atualizado.json
```

## Variáveis necessárias

No `server/.env` ou `.env`:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ARTICLES_TABLE=articles
```

Usa sempre `SUPABASE_SERVICE_ROLE_KEY` apenas no backend/local, nunca no frontend.
