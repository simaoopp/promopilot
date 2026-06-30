# PromoPilot

Aplicação para gestão de campanhas, etiquetas, artigos e dossiers comerciais.

O projeto tem um frontend em React e uma API em Node.js/Express. A aplicação permite consultar artigos, preparar campanhas, gerar etiquetas, criar dossiers comerciais e processar campanhas recebidas por email.

## O que o sistema faz

- Pesquisa e valida artigos do catálogo.
- Cria campanhas promocionais.
- Gera etiquetas prontas a imprimir.
- Trabalha com etiquetas manuais e campanhas importadas por ficheiro.
- Cria dossiers comerciais a partir de orçamentos.
- Processa emails de campanha no backend.
- Gera PDFs e envia campanhas para as lojas.
- Usa Supabase para autenticação, dados e storage.

## Tecnologias usadas

- React
- React Router
- Supabase
- Node.js
- Express
- Playwright
- Resend
- PDFKit
- XLSX

## Estrutura principal

```txt
src/                 frontend React
server/              API e worker de campanhas
scripts/             scripts de importação, migração e validação
supabase/migrations  estrutura da base de dados
supabase/tests       testes SQL de permissões
public/              ficheiros públicos da aplicação
```

## Instalação

Instalar dependências do frontend:

```bash
npm install
```

Instalar dependências do backend:

```bash
cd server
npm install
cd ..
```

O projeto usa npm. Não misturar npm, yarn e pnpm no mesmo ambiente.

## Variáveis de ambiente

Copiar o ficheiro de exemplo:

```bash
cp .env.example .env.local
```

Preencher as variáveis necessárias no `.env.local`.

## Comandos principais

Iniciar o frontend:

```bash
npm start
```

Gerar build do frontend:

```bash
npm run build
```

Executar validação estática:

```bash
npm run qa:static
```

Iniciar o backend:

```bash
npm --prefix server start
```

Validar sintaxe do backend:

```bash
npm --prefix server run smoke
```

Executar validações principais:

```bash
npm run qa:all
```

## Base de dados

As migrations estão em:

```txt
supabase/migrations
```

Para preparar uma base nova:

1. Criar o projeto no Supabase.
2. Configurar as variáveis de ambiente.
3. Executar as migrations por ordem no SQL Editor.
4. Confirmar as policies de RLS.
5. Confirmar os buckets necessários no Supabase Storage.
6. Criar os utilizadores autorizados.

## Frontend

O frontend usa Supabase Auth e comunica com a API através de `REACT_APP_API_BASE_URL`.

Em desenvolvimento, normalmente fica:

```env
REACT_APP_API_BASE_URL=http://localhost:3001
```

Em produção, deve apontar para o domínio da API.

## Backend

O backend fica na pasta `server`.

Responsabilidades principais:

- autenticação das rotas;
- pesquisa e gestão de artigos;
- processamento de campanhas automáticas;
- geração de PDFs;
- envio de emails;
- webhooks de entrada;
- suporte aos dossiers comerciais.

## Campanhas por email

O processamento automático de campanhas deve estar desligado por defeito em ambientes novos.

Ativar apenas depois de configurar:

- caixa IMAP;
- provider de email;
- emails das lojas;
- bucket de PDFs;
- credenciais do Supabase;
- testes em ambiente controlado.

## Segurança

- `.env.local` não deve ir para o GitHub.
- `SUPABASE_SERVICE_ROLE_KEY` só deve existir em ambiente backend seguro.
- O frontend deve usar apenas chaves públicas do Supabase.
- As rotas sensíveis da API exigem autenticação.
- As migrations devem manter RLS ativa nas tabelas protegidas.
- Produção e staging devem usar credenciais separadas.

## Resolução rápida de problemas

Se o frontend não arrancar, confirmar que `npm install` foi executado na raiz do projeto.

Se o backend não arrancar, confirmar que `npm install` foi executado dentro de `server`.

Se houver erros de dependências, confirmar que o registry está correto:

```bash
npm config get registry
```

O valor esperado é:

```txt
https://registry.npmjs.org/
```

Se necessário, corrigir com:

```bash
npm config set registry https://registry.npmjs.org/
```

Se o login falhar, confirmar as variáveis do Supabase e as permissões do utilizador.

Se a pesquisa de artigos não devolver resultados, confirmar a tabela configurada em `ARTICLES_TABLE` e as migrations aplicadas.

Se os PDFs não forem gerados, confirmar as dependências do backend e a configuração do worker.

Se os emails não forem enviados, confirmar `RESEND_API_KEY`, remetente autorizado e emails das lojas.
