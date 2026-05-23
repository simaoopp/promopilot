# Homepage e pesquisa de artigos estáveis

Esta versão remove a pesquisa automática de artigos da homepage.

## Porquê

A homepage é uma página de entrada e não deve disparar queries de catálogo sem uma ação explícita do utilizador. Em produção, pesquisas genéricas como `menu`, `lego` ou termos curtos podem cair em `statement timeout` no Supabase quando a base ainda está fria ou quando o índice ainda está em manutenção.

## Comportamento novo

- A homepage chama apenas `/api/ping` para warmup leve.
- O input da homepage não consulta `/api/artigos` enquanto o utilizador escreve.
- Ao pressionar Enter, o utilizador é enviado para `/Etiquetas?search=<termo>`.
- A página de Etiquetas continua a ser o ponto oficial para pesquisa de artigos.
- Se o Supabase devolver `57014 statement timeout`, a API devolve resposta vazia controlada em vez de 500.

## Resultado esperado

- Sem erro visual na homepage por causa de sugestões.
- Sem logs recorrentes de `Erro em GET /api/artigos` causados por pesquisas automáticas da homepage.
- Pesquisa real continua disponível na página de Etiquetas.

## Próximo passo opcional

Para uma homepage com sugestões instantâneas, criar uma tabela pequena e pré-calculada, por exemplo `homepage_article_suggestions`, com 20 a 50 artigos frequentes por organização. A homepage deve ler essa tabela, não pesquisar o catálogo inteiro.
