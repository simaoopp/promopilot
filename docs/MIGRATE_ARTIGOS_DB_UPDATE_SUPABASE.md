# Atualização de artigos DB -> Supabase

## Objetivo

Atualizar a tabela `public.articles` no Supabase com o ficheiro JSON gerado a partir do `DB.ods`, sem destruir informação enriquecida já existente.

Este script foi feito para o caso:

```text
- artigos.json é a base atual para Supabase;
- DB.ods é a base comercial atualizada;
- alterar preços;
- alterar descrição e código de barras quando vierem diferentes no DB.ods;
- adicionar novos artigos apenas com formato 00.000.000.00000;
- não apagar artigos antigos;
- não sobrescrever campos oficiais, técnicos ou IA em artigos existentes.
```

## Script criado

```text
scripts/migrate-artigos-db-update-to-supabase.mjs
```

## NPM script

```bash
npm run migrate:articles-db-update
```

## Campos atualizados em artigos existentes

Só estes campos são enviados ao Supabase nos artigos que já existem:

```text
descricao
pvp1
pvp2
pvp3
codigo_barras
search_terms
```

`search_terms` é derivado técnico para manter a pesquisa rápida coerente quando muda descrição/código de barras.

## Campos preservados em artigos existentes

O script não envia estes campos nos updates parciais, logo preserva o que já existir no Supabase:

```text
fonte_oficial
raw_hash
ultima_atualizacao
titulo_oficial
descricao_oficial
caracteristicas_tecnicas
documentos_oficiais
resumo_vendedor
observacoes_ia
marca
modelo
brand
categoria
subcategory
texto_grounding
```

## Novos artigos

Novos artigos são inseridos apenas se `artigo` respeitar:

```text
00.000.000.00000
```

Exemplos aceites:

```text
01.801.008.00050
02.818.003.01346
```

Exemplos ignorados:

```text
*50250939001
50250939001
ABC
01.801
```

## Antes de executar

Garantir no `.env` ou `server/.env`:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

A chave tem de ser service role, porque a tabela tem RLS ativa.

## Migration SQL opcional

Foi incluída uma migration compatível:

```text
supabase/migrations/20260620_article_db_update_columns.sql
```

Ela garante que existem:

```text
pvp1
pvp3
search_terms
índices de pesquisa
```

## Como executar

Colocar o JSON atualizado no projeto, por exemplo:

```text
src/data/artigos.json
```

ou manter outro caminho, por exemplo:

```text
artigos_atualizado_supabase.json
```

### Dry-run

```bash
npm run migrate:articles-db-update -- src/data/artigos.json --dry-run
```

ou:

```bash
npm run migrate:articles-db-update -- artigos_atualizado_supabase.json --dry-run
```

### Execução real

```bash
npm run migrate:articles-db-update -- src/data/artigos.json
```

ou:

```bash
npm run migrate:articles-db-update -- artigos_atualizado_supabase.json
```

## PVP2 numeric/text

O script começa por enviar `pvp2` como texto.

Se o Supabase responder que `pvp2` é `numeric`, o script volta a tentar automaticamente com conversão portuguesa:

```text
14,99 -> 14.99
1.299,99 -> 1299.99
```

Também podes forçar:

```bash
ARTICLE_PVP2_MODE=numeric npm run migrate:articles-db-update -- src/data/artigos.json
```

## Commit sugerido

```bash
git add scripts/maintenance/apply-article-db-update-migration-script.mjs \
        scripts/migrate-artigos-db-update-to-supabase.mjs \
        docs/MIGRATE_ARTIGOS_DB_UPDATE_SUPABASE.md \
        supabase/migrations/20260620_article_db_update_columns.sql \
        package.json

git commit -m "feat: add safe article db update migration"
git push origin main
```
