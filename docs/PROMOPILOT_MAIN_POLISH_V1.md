# PromoPilot Main Polish V1

## Objetivo

Remodelar a aplicação no `main` para assumir já a identidade **PromoPilot**, com uma interface mais profissional, coerente e útil para loja.

## Inclui

- sistema de marca `PromoPilot` centralizado;
- novo wordmark interno sem depender do logo antigo;
- splash screen profissional;
- topbar e sidebar com linguagem visual SaaS;
- homepage transformada em cockpit operacional;
- ações rápidas mais claras para loja;
- login com identidade PromoPilot;
- atualização de `index.html` e `manifest.json`;
- camada CSS final `promopilot.css`, sem destruir os estilos anteriores;
- ação rápida nova para **Dossiers de orçamento** na homepage.

## Aplicar

```bash
cd ~/simaoopp/ETIQUETASPROM
node scripts/maintenance/apply-promopilot-main-polish-v1.mjs
npm run build
```

## Depois validar

- Login mostra PromoPilot;
- topbar mostra PromoPilot;
- homepage tem hero/cockpit novo;
- ações rápidas abrem Campanhas, Artigos, Scan, Dossiers e Excel;
- Etiquetas de Campanha continua funcional;
- Orçamentos/Dossiers continua funcional;
- impressão de etiquetas não fica afetada.

## Commit sugerido

```bash
git add src public package.json docs scripts/maintenance

git commit -m "feat: polish main interface for PromoPilot"
git push origin main
```
