# Correção parser email Gmail - campanhas automáticas

## Problema resolvido

O Gmail pode entregar o corpo do email com a tabela em formatos diferentes:

- linhas completas separadas por tabulações;
- cabeçalhos quebrados em várias linhas, por exemplo `PVP2`, `ANTES`, `PVP2`, `ATUAL`;
- linhas de artigo quebradas em múltiplas linhas no texto extraído pelo IMAP/mailparser.

Quando isso acontecia, o worker encontrava o email mas falhava com:

```txt
Não foi encontrada uma tabela válida de campanha no email.
```

## Alteração feita

Foi reforçado o parser em:

```txt
server/services/automatic-campaigns/campaignEmailParser.js
```

Agora o parser tenta três estratégias:

1. Ler tabela HTML real, quando existir.
2. Ler linhas completas por tabulação.
3. Ler blocos multiline começados por código de artigo, mesmo que o Gmail tenha partido a tabela em várias linhas.

## Resultado esperado

O email de teste com assunto:

```txt
Resumo Alterações_PV2_12/05/26
```

e artigos:

```txt
04.814.002.00385 ... AEA = 1
04.690.006.00013 ... AEV = 1
04.690.006.00014 ... A1E = 1
```

deve gerar:

```txt
Angra: 1 etiqueta
Valados: 1 etiqueta
Praia: 0 etiquetas
```

Como são monitores, o modo automático deve atribuir A5.
