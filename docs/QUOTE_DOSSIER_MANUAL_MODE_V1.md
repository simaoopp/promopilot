# Quote Dossier Manual Mode v1

## Decisão

O módulo de dossiers deixa de usar IA, Serper ou enriquecimento web automático.

O novo fluxo é:

```text
1. Utilizador carrega o PDF do orçamento.
2. A aplicação extrai apenas os dados do orçamento:
   - número;
   - cliente;
   - data;
   - total;
   - artigos;
   - referência/EAN;
   - quantidade;
   - valor;
   - observações detectáveis.
3. O utilizador carrega manualmente:
   - fotografia de cada artigo;
   - descrição geral;
   - principais características.
4. A aplicação gera o PDF final organizado.
```

## Porquê

O último PDF gerado ainda trazia enriquecimento automático/online e placeholders de fotografia, além de fonte final automática. O objetivo agora é um fluxo manual e controlado.

## Observações automáticas

O backend passa a criar observações a partir do texto real do orçamento.

Regras:

```text
- Se encontrar pronto pagamento:
  "Condição de pagamento: pronto pagamento."

- Se encontrar Instalação Incluída:
  "Instalação incluída."
  ou, se forem equipamentos de lavandaria:
  "Instalação de lavandaria incluída."

- Se encontrar MAPFRE / extensão de garantia:
  "Consta no orçamento extensão de garantia por mais X anos nos equipamentos indicados, no valor de Y €."
```

Exemplo pretendido:

```text
Observações do orçamento
• Instalação de lavandaria incluída.
• Consta no orçamento extensão de garantia por mais 3 anos nas máquinas de lavar e secar roupa, no valor de 189,00 €.
```

## Como aplicar

Na raiz:

```powershell
node scripts/maintenance/apply-quote-dossier-manual-mode-v1.mjs
```

Validar backend:

```powershell
cd server
node --check routes/quoteDossiers.js
node --check services/quote-dossiers/quoteDossierPdfService.js
node --check services/quote-dossiers/quoteDossierEnrichmentService.js
node --check services/quote-dossiers/quoteDossierWebEnrichmentService.js
npm start
```

Validar frontend:

```powershell
npm run build
npm start
```

## Prova de deploy no Render

Depois do push/redeploy:

```text
/api/orcamentos-dossiers/version
```

Deve devolver:

```json
{
  "version": "quote-dossier-manual-runtime-v1",
  "mode": "manual"
}
```

## Commit recomendado

```powershell
git add scripts/maintenance/apply-quote-dossier-manual-mode-v1.mjs `
        docs/QUOTE_DOSSIER_MANUAL_MODE_V1.md `
        server/routes/quoteDossiers.js `
        server/services/quote-dossiers/quoteDossierPdfService.js `
        server/services/quote-dossiers/quoteDossierEnrichmentService.js `
        server/services/quote-dossiers/quoteDossierWebEnrichmentService.js `
        src/pages/OrcamentosDossiers.jsx

git commit -m "feat: switch quote dossiers to manual mode"
git push origin main
```

## Render envs

Podes remover/desativar:

```text
QUOTE_DOSSIER_WEB_ENRICHMENT
QUOTE_DOSSIER_SERPER_API_KEY
QUOTE_DOSSIER_BRAVE_SEARCH_API_KEY
```

Manter:

```text
JSON_BODY_LIMIT=80mb
URLENCODED_BODY_LIMIT=80mb
```
