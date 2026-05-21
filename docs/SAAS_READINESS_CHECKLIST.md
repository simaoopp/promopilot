# Checklist sénior para evoluir Etiquetas Prom para SaaS

Este documento é uma checklist operacional. Não assume que o SaaS já está implementado. O objetivo é separar o que já existe, o que está parcialmente pronto e o que ainda precisa de trabalho antes de vender como SaaS real.

## 1. Multi-tenant

Estado atual: parcial.

Hoje o sistema está orientado a utilizador/loja. Para SaaS real, a fronteira de segurança principal deve ser a organização/cliente.

Checklist obrigatório:

- [ ] Criar `organizations`.
- [ ] Criar `organization_members`.
- [ ] Criar `stores` por organização.
- [ ] Criar `invitations`.
- [ ] Criar `subscriptions`.
- [ ] Criar `usage_events`.
- [ ] Criar `audit_logs`.
- [ ] Adicionar `organization_id` a campanhas, lojas, templates, PDFs, histórico, automações e configurações.
- [ ] Migrar dados existentes para uma organização inicial.
- [ ] Reescrever RLS por `organization_id`.
- [ ] Testar isolamento entre Cliente A e Cliente B.

Critério de aceitação: um owner/admin de uma organização nunca consegue ler, alterar ou apagar dados de outra organização.

## 2. Modelo recomendado

Recomendação: base partilhada com `organization_id`.

É a melhor opção inicial porque reduz custo e complexidade. Base separada por cliente só deve ser considerada para enterprise.

## 3. Roles recomendadas

| Role | Uso |
| --- | --- |
| owner | controla organização, billing e membros críticos |
| admin | gere lojas, campanhas, utilizadores e configurações |
| manager | cria/aprova campanhas |
| store_user | vê/imprime campanhas da loja |
| viewer | consulta apenas |
| support | acesso temporário auditado |

## 4. Segurança backend

Estado atual: bom para produção controlada, incompleto para SaaS multi-tenant.

Checklist:

- [x] Service role fora do frontend.
- [x] Service role fora do Render para o fluxo normal.
- [x] Worker pesado isolado no Cloud Run.
- [x] Bucket de PDFs privado.
- [x] RLS ativa em tabelas críticas.
- [ ] RLS por `organization_id`.
- [ ] Zod/Joi/Yup em todos os endpoints críticos.
- [ ] Resposta de erro padronizada com `requestId`.
- [ ] Rate limit por IP, user e organização.
- [ ] Logs estruturados com `organization_id`, `user_id`, `request_id`.
- [ ] Testes automatizados de permissão/RLS.

## 5. Storage/PDFs

Checklist:

- [x] Bucket privado.
- [x] Limpeza automática de campanhas antigas.
- [ ] Paths por organização: `/{organization_id}/campaigns/{campaign_id}/...`.
- [ ] Signed URLs com expiração curta.
- [ ] Registo de quem gerou PDF.
- [ ] Registo de quem descarregou/imprimiu, quando aplicável.

## 6. Billing e planos

Estado atual: não implementado.

Checklist:

- [ ] Planos.
- [ ] Trials.
- [ ] Subscrições.
- [ ] Limites por plano.
- [ ] Usage events.
- [ ] Stripe ou Paddle.
- [ ] Webhooks de pagamento.
- [ ] Bloqueio por pagamento falhado.
- [ ] Página de billing.

## 7. Observabilidade

Estado atual: básico.

Checklist:

- [ ] Sentry ou equivalente.
- [ ] Uptime monitor.
- [ ] Alertas de erro 500.
- [ ] Alertas de falha do Cloud Run Job.
- [ ] Métricas de emails processados.
- [ ] Métricas de PDFs gerados.
- [ ] Request ID em API.
- [ ] Dashboard técnico.

## 8. Backups e recuperação

Estado atual: depende da configuração Supabase.

Checklist:

- [ ] Backup automático confirmado.
- [ ] Teste real de restore.
- [ ] Política de retenção.
- [ ] Exportação de dados por cliente.
- [ ] Processo de eliminação de dados.
- [ ] RPO definido.
- [ ] RTO definido.

## 9. CI/CD

Estado atual: parcial.

Checklist:

- [x] Cloud Build para worker.
- [x] Smoke test backend.
- [x] QA estático.
- [ ] Lint obrigatório.
- [ ] Testes unitários em CI.
- [ ] Testes E2E em CI.
- [ ] Staging antes de produção.
- [ ] Aprovação manual para produção.
- [ ] Rollback documentado.
- [ ] Secret scan.

## 10. Produto SaaS mínimo

O produto só deve ser anunciado como SaaS sénior quando tiver:

- [ ] Multi-tenant real.
- [ ] RLS testada por organização.
- [ ] Storage por organização.
- [ ] Staging separado.
- [ ] Backups testados.
- [ ] Observabilidade e alertas.
- [ ] Painel admin interno.
- [ ] Billing ou gestão manual de planos.
- [ ] Auditoria.
- [ ] Onboarding.
- [ ] Limites por plano.
- [ ] Testes E2E críticos.
