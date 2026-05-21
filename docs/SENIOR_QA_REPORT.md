# QA sénior — relatório atual

## Resumo executivo

O projeto está mais seguro e operacionalmente mais maduro do que uma app interna comum. O fluxo de emails automáticos está bem separado no Cloud Run Job. A pesquisa de artigos foi redesenhada para não depender de service role no Render.

Ainda não é SaaS multi-tenant completo. Está numa fase boa para produção controlada e preparação de SaaS.

## Resultado de QA feito neste pacote

Comandos executados:

```bash
npm --prefix server run smoke
npm run qa:static
```

Resultado esperado neste pacote: sem falhas críticas.

## Pontos fortes encontrados

- Worker automático isolado no Cloud Run.
- Render sem service role para operação normal.
- Bucket de PDFs privado.
- RLS ativa.
- Admin único via `profiles.role`.
- Pesquisa de artigos por RPC controlada.
- Catálogo completo bloqueado para users normais.
- Limpeza automática de campanhas antigas.
- Playwright alinhado com Docker em `1.60.0`.

## Riscos ainda existentes

### 1. Ainda não é multi-tenant real

O produto ainda não tem `organization_id` como fronteira de dados em todas as entidades importantes.

Risco: vender a múltiplas empresas antes disso aumenta risco de isolamento imperfeito.

### 2. IA ainda depende do Render

A funcionalidade Gemini ainda deve ser migrada para um Cloud Run Service próprio se quiseres remover a key do Render.

### 3. Docker usa `npm install --no-package-lock` no worker

Isto foi usado para contornar erro de `npm ci` no build. Funciona, mas a forma ideal é regenerar um `package-lock.json` saudável e voltar a `npm ci`.

### 4. Testes E2E ainda faltam

Faltam testes automatizados para:

- login;
- permissões;
- PDF;
- campanhas por email;
- user normal vs admin;
- isolamento SaaS futuro.

## Classificação atual

Para app interna/prod controlada: 9/10.

Para SaaS multi-cliente real: 6/10.

Para chegar a SaaS sénior: executar o plano em `docs/SAAS_MIGRATION_PLAN.md`.

## Execução feita nesta entrega

Data: 2026-05-21.

Executado:

```bash
npm --prefix server run smoke
npm run qa:static
```

Resultado:

```text
Backend smoke: passou.
QA estático: passou sem falhas críticas.
```

Não foi executado `npm run build` do frontend neste ambiente porque a validação completa de build depende de instalação das dependências do frontend. Deve ser executado no teu ambiente/CI antes de deploy final.
