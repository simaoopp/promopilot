# Migração de artigos sem restrição de formato

## Objetivo

Atualizar o script de migração para inserir todos os artigos novos vindos do JSON, sem filtrar pelo formato:

```text
00.000.000.00000
```

Isto permite inserir também artigos como:

```text
*50250939001
50250939001
peças/referências especiais
```

## O que muda

Antes:

```text
Artigos novos só eram inseridos se tivessem formato 00.000.000.00000
```

Agora:

```text
Todos os artigos novos são inseridos
```

## O que continua igual

Em artigos existentes, o script continua a atualizar apenas:

```text
descricao
pvp1
pvp2
pvp3
codigo_barras
search_terms
```

Não apaga artigos antigos e não sobrescreve campos enriquecidos/oficiais/IA.

## Aplicar

```bash
cd ~/simaoopp/ETIQUETASPROM
node scripts/maintenance/apply-migrate-all-articles-no-restrictions.mjs
npm run build
```

## Executar

```bash
ARTICLE_DB_UPDATE_BATCH_SIZE=50 NODE_OPTIONS=--dns-result-order=ipv4first npm run migrate:articles-db-update -- src/data/artigos.json --dry-run
```

Depois, execução real:

```bash
ARTICLE_DB_UPDATE_BATCH_SIZE=50 NODE_OPTIONS=--dns-result-order=ipv4first npm run migrate:articles-db-update -- src/data/artigos.json
```
