# PromoPilot Human UI V3

Ajuste visual e textual depois da remodelação V2.

## Objetivo

Remover textos demasiado técnicos/robóticos e tirar referências a empresas no login/interface.

## Removido/alterado

- `Retail Operations Cockpit`
- `Ambiente`
- `Main`
- `Saúde operacional`
- `Resumo do cockpit`
- cartões com métricas artificiais como "Artigos em catálogo 0"
- texto de empresa no login
- linguagem demasiado técnica

## Nova linha visual

Cores mais calmas:

- verde suave
- azul petróleo discreto
- laranja quente apenas como detalhe
- fundos claros
- menos contraste agressivo

## Aplicar

```bash
cd ~/simaoopp/ETIQUETASPROM
node scripts/maintenance/apply-promopilot-human-ui-v3.mjs
npm run build
```

## Validar

- Login sem nome de empresa
- Topbar sem "Ambiente" / "Main"
- Homepage sem "Saúde operacional" / "Resumo do cockpit"
- Interface mais clara e menos agressiva
