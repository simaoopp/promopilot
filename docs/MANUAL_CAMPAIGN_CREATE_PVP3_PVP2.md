# Ajuste — Criar campanha usa PVP3 antes e PVP2 atual

## Objetivo

Na página **Etiquetas de Campanha**, o botão **Criar campanha** passa a preencher os preços assim:

```text
Preço antes: PVP3
Preço atual: PVP2
```

## O que foi alterado

### `src/pages/EtiquetasCampanha.jsx`

Ao selecionar um artigo no popup **Criar campanha**:

```text
campanhaAntes = item.pvp3 || item.pvp2 || ""
campanhaAtual = item.pvp2 || ""
```

Também foi ajustado o item adicionado à campanha para manter `pv3` coerente:

```text
pv3 = artigo.pvp3 || campanhaAntes
```

Assim, mesmo que o preço antes seja editado manualmente, o valor de referência fica disponível na tabela/impressão.

### `src/features/campaign/manual/ManualCreateCampaignModal.jsx`

O texto visual do popup passa a indicar:

```text
PVP3 antes
PVP2 atual
```

## O que não muda

A importação por tabela colada continua igual.

Este ajuste é apenas para o fluxo manual:

```text
Etiquetas de Campanha → Criar campanha → selecionar artigo do catálogo
```

## Aplicar

```bash
cd ~/simaoopp/ETIQUETASPROM
node scripts/maintenance/apply-manual-campaign-create-pvp3-pvp2.mjs
npm run build
```

## Commit sugerido

```bash
git add src/pages/EtiquetasCampanha.jsx \
        src/features/campaign/manual/ManualCreateCampaignModal.jsx \
        scripts/maintenance/apply-manual-campaign-create-pvp3-pvp2.mjs \
        docs/MANUAL_CAMPAIGN_CREATE_PVP3_PVP2.md

git commit -m "fix: use pvp3 as previous price in manual campaigns"
```
