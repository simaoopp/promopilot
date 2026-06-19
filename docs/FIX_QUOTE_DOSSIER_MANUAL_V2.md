# Fix Quote Dossier Manual v2

## Problemas corrigidos

O PDF gerado ainda apresentava:

```text
- Cliente como —
- Observação indesejada sobre pronto pagamento
- páginas em branco/partidas
```

No PDF enviado pelo utilizador, o resumo mostra `Cliente —` e a paginação vem partida em 12 páginas para apenas 4 páginas reais de conteúdo. fileciteturn37file0

## Correções

### 1. Observações

Remove automaticamente qualquer observação relacionada com:

```text
pronto pagamento
condição de pagamento
```

Mantém apenas observações úteis, como:

```text
Instalação incluída.
Instalação de lavandaria incluída.
Extensão de garantia / MAPFRE.
```

### 2. PDF sem páginas em branco

O footer estava a ser desenhado antes do conteúdo, o que fazia o PDFKit criar páginas separadas para cabeçalho/rodapé/conteúdo.

Agora:

```text
1. cria página
2. desenha cabeçalho
3. desenha conteúdo
4. desenha rodapé
```

Resultado esperado:

```text
1 página de resumo + 1 página por equipamento
```

Sem páginas em branco intermédias.

### 3. Cliente

O parser passa a procurar o cliente:

```text
- acima de Exmo.(s) Sr.(s)
- abaixo de Exmo.(s) Sr.(s)
- nas linhas anteriores ao bloco Orçamentos OR ORC....
```

Isto melhora os casos em que a extração por coordenadas troca a ordem das colunas.

## Aplicar no StackBlitz

Na raiz:

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/fix-quote-dossier-manual-v2.mjs
```

Validar:

```bash
cd server
node --check routes/quoteDossiers.js
node --check services/quote-dossiers/quoteDossierParser.js
node --check services/quote-dossiers/quoteDossierPdfService.js
```

Frontend:

```bash
cd ~/simaoopp/ETIQUETASPROM
npm run build
```

## Commit

```bash
git add scripts/maintenance/fix-quote-dossier-manual-v2.mjs \
        docs/FIX_QUOTE_DOSSIER_MANUAL_V2.md \
        server/routes/quoteDossiers.js \
        server/services/quote-dossiers/quoteDossierParser.js \
        server/services/quote-dossiers/quoteDossierPdfService.js

git commit -m "fix: polish manual quote dossier output"
git push origin main
```

Depois redeploy do backend no Render.
