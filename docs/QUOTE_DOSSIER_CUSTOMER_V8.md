# Quote Dossier Customer v8

## Problema confirmado

A extração já deixou de vir vazia, mas veio com o valor errado:

```text
Cliente: Instalação incluida
```

O PDF gerado mostra esse erro no resumo. fileciteturn41file0

No ORC original, o cliente correto continua a ser:

```text
VASCO OLIVEIRA MENDES
```

no bloco `Exmo.(s) Sr.(s)`. fileciteturn41file1

## Decisão

A linha `Instalação incluida` nunca pode ser cliente.

Este patch torna isso regra de domínio, não tentativa heurística.

## Correções

```text
- bloqueia instalação, garantia, entrega, montagem, transporte e serviço como cliente;
- exige forma de nome: maiúsculas ou palavras com inicial maiúscula;
- mantém prioridade do bloco Exmo.(s) Sr.(s);
- no generate, remove o fallback que reaproveitava qualquer texto inválido do formulário.
```

## Aplicar

```bash
cd ~/simaoopp/ETIQUETASPROM

node scripts/maintenance/apply-quote-dossier-customer-v8.mjs
```

## Validar

```bash
node --check server/services/quote-dossiers/quoteDossierCustomerService.js
node --check server/routes/quoteDossiers.js
node --check scripts/maintenance/test-quote-dossier-v8.mjs

node scripts/maintenance/test-quote-dossier-v8.mjs
```

Esperado:

```json
{
  "customer": "VASCO OLIVEIRA MENDES",
  "invalidInstallation": ""
}
```

## Build

```bash
npm run build
```

## Commit

```bash
git add scripts/maintenance/apply-quote-dossier-customer-v8.mjs \
        scripts/maintenance/test-quote-dossier-v8.mjs \
        docs/QUOTE_DOSSIER_CUSTOMER_V8.md \
        server/routes/quoteDossiers.js \
        server/services/quote-dossiers/quoteDossierCustomerService.js

git commit -m "fix: reject service lines as quote customer"
git push origin main
```

Depois redeploy no Render.

## Pós-deploy

Confirmar:

```text
https://etiquetasprom.onrender.com/api/orcamentos-dossiers/version
```

Esperado:

```json
{
  "version": "quote-dossier-manual-runtime-v8",
  "mode": "manual"
}
```

Depois carregar novamente o ORC original e clicar em `Extrair orçamento`.
