# Pesquisa instantânea de artigos

Esta versão deixa a pesquisa de artigos preparada para catálogos grandes sem voltar a carregar o catálogo completo no browser e sem fazer `ILIKE '%termo%'` diretamente sobre `public.articles` a cada tecla.

## O que mudou

A pesquisa passa a usar uma tabela leve e indexada:

```text
public.article_search_index
```

Essa tabela contém só os campos necessários para pesquisa/listagem rápida, já normalizados e indexados:

- `organization_id`
- `artigo`
- `codigo_barras`
- `descricao`
- `marca/modelo/brand`
- preços principais
- `search_text`
- `search_compact`
- `search_vector`

A app continua a chamar a mesma RPC:

```sql
public.search_articles_for_labels(p_query, p_limit, p_offset, p_organization_id)
```

mas a RPC agora pesquisa primeiro no índice, com limite rígido e sem contagem exata global.

## Porque isto é mais rápido

A versão antiga podia fazer pesquisas com `ILIKE` em várias colunas da tabela principal de artigos. Em catálogos com cerca de 250k artigos, isso pode demorar e causar timeout.

A versão nova faz:

1. procura exata por artigo/EAN;
2. procura por prefixo em artigo/EAN;
3. procura por prefixo em descrição/marca/modelo;
4. full-text search;
5. fallback trigram limitado.

A pesquisa devolve apenas os melhores resultados. Não tenta calcular o total real de todos os matches.

## Migration obrigatória

Aplicar no Supabase produção/staging:

```text
supabase/migrations/20260525_instant_article_search_index.sql
```

Essa migration:

- cria `article_search_index`;
- cria índices btree/GIN/trigram;
- cria `rebuild_article_search_index()`;
- cria trigger para manter o índice sincronizado quando `articles` muda;
- substitui a RPC de pesquisa por uma versão index-first;
- força timeout SQL curto para evitar queries longas.

## Depois de aplicar

Confirmar o índice:

```sql
select count(*) from public.article_search_index;
```

Deve ficar próximo do total de artigos com `organization_id`.

Testar:

```sql
select *
from public.search_articles_for_labels('samsun', 20, 0, null);
```

No SQL Editor pode falhar por autenticação dependendo do contexto. O teste real é no site com login.

## Operação

Se algum dia importares muitos artigos por SQL direto e quiseres reconstruir o índice manualmente:

```sql
select public.rebuild_article_search_index(null);
```

Para uma organização específica:

```sql
select public.rebuild_article_search_index('<organization_id>'::uuid);
```

## Resultado esperado

- Código/EAN exato: muito rápido.
- Pesquisa por texto: bounded, sem timeout habitual.
- Homepage e páginas de etiquetas deixam de depender de catálogo completo.
- Sem `SUPABASE_SERVICE_ROLE_KEY` no Render.
