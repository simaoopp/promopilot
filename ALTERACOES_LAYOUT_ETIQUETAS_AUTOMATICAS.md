# Alterações – alinhamento visual das etiquetas automáticas

## Objetivo
Fazer com que as etiquetas geradas automaticamente para as campanhas fiquem visualmente iguais às etiquetas da página **Etiquetas Campanha**, tanto em **A6** como em **A5**.

## O que foi alterado

### 1) `server/services/automatic-campaigns/labelHtmlService.js`
- Refeito o HTML das etiquetas automáticas para seguir a mesma estrutura visual usada no frontend:
  - `.sheet.sheet-a6`
  - `.sheet.sheet-a5`
  - `.label`, `.label-a5`, `.label-a6`
  - `.label-a5-rotator`
  - `.topbar`, `.content`, `.topo`, `.precos`, `.rodape`
- Aplicado o mesmo desenho de:
  - barra vermelha superior
  - moldura vermelha
  - posição de código, título, descrição, preços, código de barras e rodapé
- Replicada a rotação da etiqueta A5.
- Adicionado auto-fit de texto no HTML para descrição e preços, para aproximar o comportamento do `useAutoFontSize` do frontend.
- Replicada a regra visual de preços promocionais usada na página de campanha.
- Replicado o texto de validade em maiúsculas no mesmo estilo da página de campanha.

### 2) `server/services/automatic-campaigns/pdfGeneratorService.js`
- O gerador principal de PDF passou a usar **Playwright** para renderizar o HTML das etiquetas e gerar o PDF final.
- Isto permite que o PDF automático fique muito mais fiel ao layout real da página `Etiquetas Campanha`.
- Mantido fallback para **PDFKit** caso o Playwright falhe por alguma razão.

## Impacto funcional
- As etiquetas automáticas agora saem com o mesmo estilo visual das etiquetas manuais da página de campanha.
- O formato A5 continua a ser automático para categorias grandes.
- O formato A6 continua a ser automático para artigos normais.
- Não houve alterações no fluxo IMAP/Resend já funcional.

## Variáveis Render
Não foi adicionada nenhuma ENV nova nesta alteração.
Mantêm-se as mesmas ENV já configuradas para:
- IMAP Gmail
- Resend API
- worker automático
- emails das lojas
