# PromoPilot CORS Origin V1

## Problema

O frontend está em:

```text
https://www.promopilot.pt
```

mas o backend Render ainda só permite, por defeito:

```text
https://expertadmin.netlify.app
```

Por isso o browser bloqueia chamadas como:

```text
https://etiquetasprom.onrender.com/api/artigos
```

com erro CORS.

## Correção

Este patch atualiza:

```text
server/config/cors.js
```

para permitir:

```text
https://expertadmin.netlify.app
https://promopilot.pt
https://www.promopilot.pt
```

Também continua a aceitar `CORS_ORIGINS` e `EXTRA_CORS_ORIGINS` via ambiente.

## Aplicar

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/apply-promopilot-cors-origin-v1.mjs
npm run build
```

Depois fazer commit e redeploy do backend Render.

## Fix imediato no Render sem código

Também podes corrigir imediatamente no Render adicionando/revendo a env var:

```text
CORS_ORIGINS=https://expertadmin.netlify.app,https://promopilot.pt,https://www.promopilot.pt
```

Depois clicar em `Manual Deploy` / `Restart Service`.

## Validar

Depois do deploy:

```bash
curl -i -X OPTIONS "https://etiquetasprom.onrender.com/api/artigos?q=samsung&limit=10&offset=0&includeCount=0" \
  -H "Origin: https://www.promopilot.pt" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

Deve devolver header parecido com:

```text
access-control-allow-origin: https://www.promopilot.pt
```
