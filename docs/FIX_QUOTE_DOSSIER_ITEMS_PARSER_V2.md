# Fix Quote Dossier Items Parser v2

## Problema

No orçamento `FSilva 11853.pdf`, o sistema já passou a reconhecer o cliente, mas continuou com:

```text
Orçamento extraído com 0 equipamento(s)
```

O ficheiro correto contém 8 equipamentos e total 9 139,92.

## Causa

O parser anterior fechava o artigo assim que encontrava a linha `EAN`.

Em alguns PDFs Primavera, dependendo da extração de texto, o `EAN` pode aparecer antes de todos os campos necessários ficarem no buffer do artigo. Resultado: o parser tentava interpretar o artigo incompleto e descartava-o.

## Correção v2

Este patch substitui o parser por uma versão que:

```text
- só separa artigos pelo código 02.xxx.xxx.xxxxx;
- não fecha artigo na linha EAN;
- aceita múltiplas colunas 0,00;
- calcula total por quantidade x preço unitário quando necessário;
- extrai cliente, orçamento, data, total e artigos de forma mais tolerante.
```

## Resultado esperado para FSilva 11853

```text
Orçamento: ORC.EXP1E/11853
Cliente: FLORIANO JOSE SILVA
Data: 2026-06-11
Total: 9 139,92
Equipamentos: 8
```

Equipamentos:

```text
SIEMENS - Placa EX975LVV1E
SIEMENS - Chaminé Parede IQ700 LC91KLT60
SIEMENS - Microondas Encastre IQ700 BF722R1B1
SIEMENS - Forno Multifunções iQ700 HM676G0S6
SIEMENS - Side by Side French Door IQ500 KF96DAXEA
CASO - Garrafeira WineChef Pro 126 5CASOD777G
TEKA - Lava-Loiça RS15 50.40 M-XT 1C 115000046
TEKA - Torneira Misturadora UNI 9331 BK Total 116020023
```

## Aplicar

Na raiz:

```powershell
node scripts/maintenance/fix-quote-dossier-items-parser-v2.mjs
```

Validar backend:

```powershell
cd server
node --check services/quote-dossiers/quoteDossierParser.js
npm start
```

Validar frontend:

```powershell
npm run build
```

## Commit recomendado

```powershell
git add scripts/maintenance/fix-quote-dossier-items-parser-v2.mjs `
        docs/FIX_QUOTE_DOSSIER_ITEMS_PARSER_V2.md `
        server/services/quote-dossiers/quoteDossierParser.js

git commit -m "fix: parse primavera quote dossier items"
git push origin main
```
