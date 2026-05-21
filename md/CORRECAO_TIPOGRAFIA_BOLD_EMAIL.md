# Correção da tipografia bold nas etiquetas automáticas por email

## Objetivo

Ajustar a etiqueta automática para ficar visualmente mais próxima da etiqueta manual, sobretudo no peso das letras.
O PDF manual apresenta títulos, descrição e preços com uma aparência mais bold/extra-bold.

## Alteração aplicada

A geração HTML do backend mantém a mesma fonte base da aplicação (`Arial, Helvetica, sans-serif`), mas aplica uma compensação de peso apenas dentro da etiqueta automática:

- `font-weight: 900` nos blocos principais;
- reforço controlado via `-webkit-text-stroke` nos elementos de maior impacto visual;
- stroke mais forte no preço atual, por ser o elemento principal da etiqueta;
- stroke mais leve na validade, para evitar excesso de peso no rodapé;
- sem alteração às funções partilhadas de `formatters`, preços promocionais ou `useAutoFontSize`/auto-font-size.

## Ficheiros alterados

- `server/services/automatic-campaigns/labelHtmlService.js`
- `src/shared/campaign-label/labelConstants.js`

## Nota

Não foi embutido nenhum ficheiro de fonte. A correção é deliberadamente feita por CSS, para evitar dependências de fontes locais e manter a geração compatível com o ambiente do servidor.
