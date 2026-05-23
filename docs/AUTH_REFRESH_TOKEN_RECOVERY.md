# Recuperação de sessão Supabase inválida

## Contexto

Durante a validação de produção da Prioridade 0 foi observado no browser:

```text
Failed to load resource: the server responded with a status of 400 ()
AuthApiError: Invalid Refresh Token: Refresh Token Not Found
```

Este erro vem do Supabase Auth/GoTrue no frontend. Não é erro 500 da aplicação, não é falha do Cloud Run, não é falha do Resend Inbound e não indica problema no processamento de PDFs.

## Causa provável

O browser ainda tinha uma sessão Supabase antiga em `localStorage`, mas o refresh token dessa sessão já não existia no GoTrue. Isto pode acontecer depois de logout noutra aba/dispositivo, rotação de sessão, limpeza/revogação de sessões, alteração de utilizador ou tokens antigos preservados após deploys.

## Correção aplicada

Foi adicionada recuperação defensiva para refresh tokens inválidos:

- deteção de mensagens `Invalid Refresh Token`, `Refresh Token Not Found`, `refresh_token_not_found` e `refresh_token_already_used`;
- limpeza local das chaves Supabase em `localStorage`;
- `signOut({ scope: "local" })` defensivo sem bloquear o utilizador;
- `AuthContext` deixa de tratar este caso como erro inesperado;
- `artigosService` limpa a sessão local se a pesquisa tentar obter token com sessão expirada.

Ficheiros alterados:

```text
src/utils/supabaseAuthRecovery.js
src/context/AuthContext.jsx
src/services/artigosService.js
```

## Comportamento esperado

Quando acontecer:

1. A app limpa a sessão local inválida.
2. O utilizador fica sem sessão ativa no frontend.
3. O utilizador deve iniciar sessão novamente.
4. O erro não deve ficar em loop após refresh da página.

## Critério de aceitação

```text
Uma sessão antiga pode gerar no máximo um 400 de Auth no browser.
Depois da limpeza local ou novo login, o erro não deve repetir.
```

Se o erro continuar a repetir depois de logout/login limpo, validar:

- se há duas abas abertas a competir pela sessão;
- se o utilizador existe e não foi removido no Supabase Auth;
- se a app está a apontar para o Supabase URL/key corretos;
- se não existe mistura entre produção e staging no mesmo domínio.
