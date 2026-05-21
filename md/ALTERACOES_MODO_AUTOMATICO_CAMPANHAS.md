# Alterações — Modo automático nas campanhas automáticas

## Adicionado

- `server/services/automatic-campaigns/formatRulesService.js`
  - Replica no backend a regra do modo automático A5/A6 usada nas Etiquetas de Campanha.
  - Deteta A5 por descrição do artigo: TV, máquinas de lavar/secar, frigoríficos, combinados, mesas, cadeiras, fogões, arcas, exaustores, garrafeiras, etc.
  - Define `_formato`, `formato_final` e `formatoEtiqueta` em cada artigo.
  - Constrói páginas de impressão com 2 etiquetas A5 por folha e 4 etiquetas A6 por folha.

## Alterado

- `server/services/automatic-campaigns/pdfGeneratorService.js`
  - O PDF deixou de assumir A6 fixo.
  - Agora aceita `format: "automatico"` e gera páginas A5/A6 conforme cada artigo.
  - O PDF pode conter páginas A5 e páginas A6 no mesmo ficheiro da loja.

- `server/services/automatic-campaigns/automaticCampaignProcessor.js`
  - Aplica as regras de formato automático antes de gerar PDFs, guardar histórico e devolver resultados.
  - Inclui contagem de etiquetas A5/A6 nos resultados do processamento.

- `server/services/automatic-campaigns/labelHtmlService.js`
  - Atualizado para respeitar o mesmo motor de paginação A5/A6, caso venha a ser usado para renderização HTML.

- `server/services/automatic-campaigns/config.js`
  - `CAMPAIGN_DEFAULT_FORMAT` passou de `a6` para `automatico` por defeito.

- `.env.example`
  - Atualizado para `CAMPAIGN_DEFAULT_FORMAT=automatico`.

- `server/services/automatic-campaigns/automaticCampaignRepository.js`
  - O histórico automático passa a guardar `formato_etiqueta` como `automatico` por defeito.

- `src/utils/automaticCampaignHistory.js`
  - O frontend passa a interpretar campanhas automáticas como modo `automatico` por defeito.

- `src/components/home/HomeAutomaticCampaignHistorySection.jsx`
  - Os cartões do histórico automático mostram agora o resumo A5/A6.

- `src/components/home/AutomaticCampaignDetailsModal.jsx`
  - O detalhe da campanha automática mostra o modo e a contagem A5/A6.
  - Cada artigo mostra também o formato calculado.

- `server/package.json`
  - O smoke test valida também o novo `formatRulesService.js`.

- `README_AUTOMACAO_CAMPANHAS.md`
  - Documentado o modo automático e como forçar A5 ou A6 se necessário.

## Validação

- `npm --prefix server run smoke` executado com sucesso.
- `npm run build` executado com sucesso.
- Teste funcional com artigos mistos confirmou:
  - Smart TV/QLED → A5
  - Spray de limpeza → A6
  - PDF misto gerado com páginas separadas A5/A6.
