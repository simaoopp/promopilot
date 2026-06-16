# Módulo MVP — Dossiers de Orçamento no main

## Objetivo

Adicionar ao `main` um módulo operacional para transformar um PDF de orçamento Primavera/ORC num dossier técnico organizado.

Exemplo de uso:

```text
Orçamentos → carregar PDF ORC → extrair equipamentos → adicionar fotografias → gerar PDF organizado
```

## O que o MVP faz

Backend:

```text
POST /api/orcamentos-dossiers/extract
POST /api/orcamentos-dossiers/generate
```

Frontend:

```text
/OrcamentosDossiers
```

Fluxo:

```text
1. Carregar PDF do orçamento original.
2. Extrair número do orçamento, cliente, data, total e linhas de artigos.
3. Identificar artigos, descrições, EANs, quantidades e valores.
4. Rever/editar cada equipamento.
5. Carregar fotografia manual por equipamento.
6. Gerar PDF organizado com capa/resumo e uma página por equipamento.
```

## Limitação assumida do MVP

As fotografias ainda não são pesquisadas automaticamente na web.

Nesta primeira versão:

```text
- a app extrai os produtos;
- o utilizador adiciona a foto correta por equipamento;
- a app gera o dossier PDF final.
```

Isto evita erros comerciais por imagem/característica errada. Mais tarde pode ser adicionado enriquecimento automático com cache por EAN.

## Nova dependência backend

```text
pdf-parse
```

Depois de aplicar o patch, correr:

```powershell
cd server
npm install
```

## Como aplicar

Na raiz do projeto main:

```powershell
node scripts/maintenance/add-quote-dossiers-mvp-main.mjs
```

Depois:

```powershell
cd server
npm install
npm run smoke
npm start
```

Noutro terminal:

```powershell
cd C:\projetos\ExpertAdmin\ETIQUETASPROM
npm run build
npm start
```

## Validação

Abrir:

```text
/OrcamentosDossiers
```

Testar com o orçamento:

```text
ORC.EXP1E/11699
```

Resultado esperado:

```text
✅ extrai 6 equipamentos;
✅ identifica EANs;
✅ permite editar descrição/características;
✅ permite carregar foto por equipamento;
✅ gera PDF final;
✅ PDF abre em nova aba;
✅ é possível descarregar o PDF.
```

## Commit recomendado

```powershell
git add scripts/maintenance/add-quote-dossiers-mvp-main.mjs `
        docs/QUOTE_DOSSIERS_MVP_MAIN.md `
        server/package.json `
        server/app.js `
        server/routes/quoteDossiers.js `
        server/services/quote-dossiers `
        src/App.js `
        src/components/Sidebar.jsx `
        src/pages/OrcamentosDossiers.jsx `
        src/services/quoteDossierService.js `
        src/styles/quoteDossiers.css `
        src/styles/styles.css

git commit -m "feat: add quote dossier generator MVP"
git push origin main
```

## Próximas melhorias

```text
1. Guardar histórico de dossiers no Supabase.
2. Cache por EAN com imagem/características.
3. Pesquisa automática assistida por IA/web.
4. Branding por cliente.
5. Envio do dossier por email ao cliente.
6. Conversão para proposta comercial mais bonita.
```
