# Staging e testes de permissões multi-tenant

## Objetivo

Provar que um cliente nunca consegue ver, alterar ou apagar dados de outro cliente.

## Cenário obrigatório

- Organização A
- Organização B
- Owner A
- Owner B
- Store user A
- Store user B

## Testes manuais mínimos

1. Owner A lista organizações: vê A, não vê B.
2. Owner B lista organizações: vê B, não vê A.
3. Store user A lista campanhas: vê apenas A/loja permitida.
4. Store user B lista campanhas: vê apenas B/loja permitida.
5. User A tenta abrir PDF path de B: falha.
6. User B tenta abrir PDF path de A: falha.
7. User A tenta chamar API com header `X-Organization-Id` de B: falha.
8. Admin plataforma consegue listar tenants para suporte.
9. Ações admin escrevem em `audit_logs`.
10. Jobs são filtrados por `organization_id`.

## Critério de aprovação

Só passar a produção quando todos os testes acima estiverem verdes em staging.
