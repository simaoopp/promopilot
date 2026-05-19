# Correção final - etiquetas automáticas iguais às manuais

## Objetivo

Uniformizar as etiquetas PDF geradas automaticamente para envio por email com o layout das etiquetas geradas manualmente.

## Problema identificado

A geração automática do backend não carregava toda a base visual usada no frontend/manual. Em especial, faltava o reset global de `box-sizing`, o que alterava o cálculo real das dimensões internas da etiqueta e fazia o layout divergir.

Além disso, existiam diferenças pontuais no HTML/CSS e no SVG do código de barras:

- Moldura e cabeçalho não ficavam alinhados com o manual.
- O desconto estava a ser sobrescrito para uma cor diferente da etiqueta manual.
- O código de barras automático ficava maior e mais baixo do que o manual.
- A última página podia criar molduras vazias, ao contrário da geração manual.

## Ficheiros alterados

- `server/services/automatic-campaigns/labelHtmlService.js`
- `server/services/automatic-campaigns/ean13Svg.js`

## Alterações aplicadas

1. A geração automática passou a carregar também `src/styles/base.css`, além de `tokens.css` e `print.css`.
2. Foi adicionado um fallback explícito de `box-sizing: border-box` no HTML usado pelo backend.
3. Foram removidas diferenças visuais indevidas, nomeadamente a alteração da cor do desconto.
4. Foram afinados os valores do layout A6 para coincidir com o PDF manual: padding, cabeçalho, bloco de preços, rodapé e código de barras.
5. O SVG EAN-13 passou a reproduzir melhor o comportamento visual do `JsBarcode` usado no frontend, incluindo a extensão dos guard bars.
6. A geração automática deixou de renderizar etiquetas vazias para completar a grelha da última página.

## Validação realizada

- Foi gerado um PDF de validação com os dados do exemplo automático.
- O PDF foi renderizado para PNG e comparado visualmente com o manual enviado.
- A página final já não apresenta molduras vazias.
- Foi executado o smoke test do backend:

```bash
npm --prefix server run smoke
```

Resultado: passou sem erros de sintaxe.

## Nota técnica

A correção mantém a arquitetura atual do backend. Não foram alteradas credenciais, variáveis de ambiente, regras de autenticação, envio de email ou integrações externas.
