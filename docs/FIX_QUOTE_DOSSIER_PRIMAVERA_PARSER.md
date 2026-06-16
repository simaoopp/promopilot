# Fix Quote Dossier Primavera Parser

## Problema

No orçamento `ORC.EXP1E/11853`, o módulo extraiu:

```text
0 equipamentos
Cliente errado
Total errado
```

O PDF correto indica:

```text
Cliente: FLORIANO JOSE SILVA
Orçamento: ORC.EXP1E/11853
Data: 2026-06-11
Total: 9 139,92
Equipamentos: 8
```

## Causa

O parser inicial era demasiado rígido para o formato Primavera/ORC.

Falhava em três pontos:

```text
1. O cliente aparece antes de "Exmo.(s) Sr.(s)", não depois.
2. O total final aparece no bloco "Total ( EUR )", mas havia outros valores próximos.
3. As linhas de artigos tinham mais campos monetários do que o regex aceitava.
```

## Correção

Este patch substitui `server/services/quote-dossiers/quoteDossierParser.js` por uma versão mais robusta.

Passa a:

```text
- procurar o cliente nas linhas anteriores a "Exmo.(s) Sr.(s)";
- extrair o total final a partir do bloco "Total ( EUR )";
- separar os artigos por códigos no formato 02.xxx.xxx.xxxxx;
- aceitar múltiplos campos monetários antes do valor final;
- extrair EAN, referência, marca, categoria, quantidade, preço unitário e total;
- inferir categorias como placa, chaminé, micro-ondas, forno, frigorífico, garrafeira, lava-loiça e torneira.
```

## Como aplicar

Na raiz do projeto:

```powershell
node scripts/maintenance/fix-quote-dossier-primavera-parser.mjs
```

Depois:

```powershell
cd server
node --check services/quote-dossiers/quoteDossierParser.js
npm start
```

## Validação esperada

No `/OrcamentosDossiers`, carregar `FSilva 11853.pdf`.

Resultado esperado:

```text
Orçamento: ORC.EXP1E/11853
Cliente: FLORIANO JOSE SILVA
Data: 2026-06-11
Total: 9 139,92
Equipamentos: 8
```

Equipamentos esperados:

```text
1. SIEMENS - Placa EX975LVV1E
2. SIEMENS - Chaminé Parede IQ700 LC91KLT60
3. SIEMENS - Microondas Encastre IQ700 BF722R1B1
4. SIEMENS - Forno Multifunções iQ700 HM676G0S6
5. SIEMENS - Side by Side French Door IQ500 KF96DAXEA
6. CASO - Garrafeira WineChef Pro 126 5CASOD777G
7. TEKA - Lava-Loiça RS15 50.40 M-XT 1C 115000046
8. TEKA - Torneira Misturadora UNI 9331 BK Total 116020023
```

## Commit recomendado

```powershell
git add scripts/maintenance/fix-quote-dossier-primavera-parser.mjs `
        docs/FIX_QUOTE_DOSSIER_PRIMAVERA_PARSER.md `
        server/services/quote-dossiers/quoteDossierParser.js

git commit -m "fix: improve primavera quote dossier parser"
git push origin main
```
