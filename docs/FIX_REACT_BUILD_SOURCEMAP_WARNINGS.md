# Fix React Build Source Map Warnings

## Problema

O build React pode falhar em ambientes com `CI=true` quando existem warnings de source maps vindos de dependências externas, por exemplo:

```text
Failed to parse source map from @zxing/browser...
webpack compiled with warnings
```

Em desenvolvimento estes warnings não bloqueiam, mas no build de produção/CI podem provocar:

```text
Failed to compile.
```

## Correção

Este patch cria/atualiza:

```text
.env.production
```

com:

```env
GENERATE_SOURCEMAP=false
```

Assim o `react-scripts build` deixa de tentar gerar/validar source maps de dependências e o build não fica bloqueado por warnings externos.

## Aplicar

Na raiz do projeto:

```bash
node scripts/maintenance/fix-react-build-sourcemap-warnings.mjs
npm run build
```

## Render / Netlify

Também podes definir no serviço frontend:

```text
GENERATE_SOURCEMAP=false
```

Se o serviço tiver `CI=true` e continuar a bloquear por warnings, definir também:

```text
CI=false
```

## Commit recomendado

```bash
git add scripts/maintenance/fix-react-build-sourcemap-warnings.mjs \
        docs/FIX_REACT_BUILD_SOURCEMAP_WARNINGS.md \
        .env.production

git commit -m "fix: disable frontend source maps for production build"
git push origin main
```
