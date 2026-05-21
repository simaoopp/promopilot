# Gap report executivo

## Produto resolve uma dor real

O produto já automatiza uma dor clara: criação e envio de etiquetas promocionais por loja, reduzindo trabalho manual e erro operacional.

## Estado atual

Está tecnicamente pronto para piloto controlado e agora inclui o caminho de ativação SaaS: staging, backfill de `organization_id`, RPCs por tenant e teste executável de isolamento. Ainda precisa de execução real desse runbook fora do repositório antes de venda ampla.

## Maiores riscos restantes

1. Aplicar backfill em produção sem staging aprovado.
2. Não definir `CAMPAIGN_DEFAULT_ORGANIZATION_ID` no Cloud Run depois do backfill.
3. Billing ainda manual.
4. Observabilidade ainda dependente de logs nativos.
5. Painel admin visual ainda inicial.

## Recomendação

Fazer primeiro 1 a 3 clientes piloto com onboarding assistido, contratos simples e monitorização próxima. Só depois automatizar billing self-service.
