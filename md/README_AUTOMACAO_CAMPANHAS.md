# Automação de Campanhas por Email

Esta automação fica integrada no mesmo projeto, mas corre no backend (`server/`).

Fluxo:

1. O worker lê emails por IMAP.
2. Encontra emails de campanha, por remetente/assunto configurados.
3. Extrai a tabela do corpo do email.
4. Aplica as regras:
   - `preço com desconto = PVP2 ATUAL`
   - `preço sem desconto = maior(PVP2 ANTES, PV3)`
   - `AE >= 1` → Loja da Praia
   - `AEA >= 1` → Loja de Angra
   - `AEV >= 1` → Loja de Valados
5. Gera um PDF por loja com o mesmo modo automático A5/A6 das etiquetas de campanha.
6. Guarda os PDFs no Supabase Storage.
7. Grava cada loja na tabela `automatic_campaigns`.
8. Envia email com PDF anexado se `CAMPAIGN_EMAIL_SEND_ENABLED=1`.
9. A homepage mostra os registos abaixo do histórico de campanhas manual.

## Migrations necessárias

Executar no Supabase:

- `supabase/migrations/20260517_create_automatic_campaigns.sql`
- `supabase/migrations/20260517_create_automatic_campaign_pdf_bucket.sql`

## Dependências do backend

Dentro da pasta `server/`:

```bash
npm install
```

Foram adicionadas estas dependências:

- `imapflow` — leitura IMAP
- `mailparser` — parsing de emails MIME
- `nodemailer` — envio SMTP
- `pdfkit` — geração dos PDFs de etiquetas no backend


## Configuração de teste já preparada

O `.env.example` foi deixado preparado para este cenário de teste:

```env
CAMPAIGN_IMAP_USER=etiquetaspromexp@gmail.com
CAMPAIGN_SMTP_USER=etiquetaspromexp@gmail.com
CAMPAIGN_SMTP_FROM=etiquetaspromexp@gmail.com

CAMPAIGN_STORE_EMAIL_PRAIA=simaopereira308@gmail.com
CAMPAIGN_STORE_EMAIL_ANGRA=simaopereira308@gmail.com
CAMPAIGN_STORE_EMAIL_VALADOS=simaopereira308@gmail.com
```

Ou seja, a caixa `etiquetaspromexp@gmail.com` recebe os emails de campanha e, durante os testes, os PDFs da Praia, Angra e Valados são todos enviados para `simaopereira308@gmail.com`.

Só falta substituir `COLOCAR_APP_PASSWORD_DO_GMAIL` pela App Password real do Gmail.

Por segurança, deixei:

```env
CAMPAIGN_EMAIL_SEND_ENABLED=1
CAMPAIGN_EMAIL_MARK_SEEN=0
```

Assim o envio de emails fica ativo, mas os emails recebidos não são marcados como lidos durante os primeiros testes. Depois de confirmares que está tudo certo, podes mudar para:

```env
CAMPAIGN_EMAIL_MARK_SEEN=1
```

## Variáveis de ambiente

### Supabase

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxx
SUPABASE_PUBLISHABLE_KEY=xxxx
```

### Worker

```env
CAMPAIGN_EMAIL_WORKER_ENABLED=1
CAMPAIGN_EMAIL_WORKER_RUN_ON_START=1
CAMPAIGN_EMAIL_WORKER_INTERVAL_MS=300000
CAMPAIGN_EMAIL_SEND_ENABLED=0
CAMPAIGN_EMAIL_MARK_SEEN=0
CAMPAIGN_DEFAULT_TITLE=PROMO
CAMPAIGN_DEFAULT_FORMAT=automatico
AUTOMATIC_CAMPAIGN_HISTORY_DAYS=2
```

Durante testes, manter:

```env
CAMPAIGN_EMAIL_SEND_ENABLED=0
CAMPAIGN_EMAIL_MARK_SEEN=0
```

Depois de validar, mudar para:

```env
CAMPAIGN_EMAIL_SEND_ENABLED=1
CAMPAIGN_EMAIL_MARK_SEEN=1
```

### IMAP

```env
CAMPAIGN_IMAP_HOST=imap.gmail.com
CAMPAIGN_IMAP_PORT=993
CAMPAIGN_IMAP_SECURE=1
CAMPAIGN_IMAP_USER=email@dominio.pt
CAMPAIGN_IMAP_PASS=password-ou-app-password
CAMPAIGN_IMAP_MAILBOX=INBOX
CAMPAIGN_IMAP_MAILBOXES=INBOX,[Gmail]/All Mail
CAMPAIGN_IMAP_AUTO_DISCOVER_MAILBOXES=1
CAMPAIGN_EMAIL_DEBUG=0
CAMPAIGN_EMAIL_FROM=gabrielle@dominio.pt
CAMPAIGN_EMAIL_SUBJECT_INCLUDES=Resumo Alterações_PV2
CAMPAIGN_EMAIL_UNSEEN_ONLY=1
CAMPAIGN_EMAIL_MAX_MESSAGES=10
```

### SMTP

```env
CAMPAIGN_SMTP_HOST=smtp.gmail.com
CAMPAIGN_SMTP_PORT=587
CAMPAIGN_SMTP_SECURE=0
CAMPAIGN_SMTP_USER=email@dominio.pt
CAMPAIGN_SMTP_PASS=password-ou-app-password
CAMPAIGN_SMTP_FROM="Expert Administração <email@dominio.pt>"
```

### Emails das lojas

```env
CAMPAIGN_STORE_EMAIL_PRAIA=praia@experteletro.pt
CAMPAIGN_STORE_EMAIL_ANGRA=angra@experteletro.pt
CAMPAIGN_STORE_EMAIL_VALADOS=valados@experteletro.pt
```


## Modo automático de etiquetas

Por defeito, a automação usa:

```env
CAMPAIGN_DEFAULT_FORMAT=automatico
```

Neste modo, cada artigo recebe automaticamente o formato usado no site:

- artigos grandes, como TV, máquinas de lavar/secar, frigoríficos, combinados, mesas, cadeiras, fogões, arcas, exaustores e garrafeiras → A5;
- restantes artigos → A6.

O PDF pode misturar páginas A5 e A6 por loja. O histórico automático guarda o formato calculado em cada artigo (`_formato`, `formato_final` e `formatoEtiqueta`) e mostra o resumo A5/A6 na homepage.

Se for necessário forçar um formato único, usar:

```env
CAMPAIGN_DEFAULT_FORMAT=a5
# ou
CAMPAIGN_DEFAULT_FORMAT=a6
```

## Testes

### Validar sintaxe do backend

```bash
cd server
npm run smoke
```

### Processar uma vez a caixa de entrada sem enviar emails

```bash
cd server
npm run worker:campaigns:dry-run
```

### Processar a caixa de entrada

```bash
cd server
npm run worker:campaigns
```

### Rota de teste manual

A rota abaixo permite colar um email e validar parsing/PDF/histórico sem ativar a leitura IMAP:

```http
POST /api/campanhas-automaticas/processar-email
Authorization: Bearer <token Supabase>
Content-Type: application/json

{
  "dryRun": true,
  "sendEmails": false,
  "subject": "Resumo Alterações_PV2_14/05/26",
  "from": "Gabrielle Rezino <email@dominio.pt>",
  "text": "CODIGO\tDESCRICAO\t..."
}
```

Usar `dryRun: false` para gravar na tabela e gerar/upload dos PDFs.

## Segurança operacional

- A automação não apaga emails.
- O envio real só acontece com `CAMPAIGN_EMAIL_SEND_ENABLED=1`.
- O email só é marcado como lido com `CAMPAIGN_EMAIL_MARK_SEEN=1`.
- A tabela tem deduplicação por `email_message_id + store` para evitar repetir o mesmo email para a mesma loja.

## Correção IMAP robusta

Se o worker entra no Gmail mas devolve sempre `0 email(s) processado(s)`, ative temporariamente:

```env
CAMPAIGN_EMAIL_DEBUG=1
CAMPAIGN_EMAIL_UNSEEN_ONLY=0
CAMPAIGN_EMAIL_MARK_SEEN=0
CAMPAIGN_EMAIL_SUBJECT_INCLUDES=Resumo
CAMPAIGN_EMAIL_FROM=
CAMPAIGN_IMAP_MAILBOXES=INBOX,[Gmail]/All Mail
CAMPAIGN_IMAP_AUTO_DISCOVER_MAILBOXES=1
CAMPAIGN_EMAIL_SCAN_LIMIT=100
CAMPAIGN_EMAIL_MAX_MESSAGES=25
```

Nesta versão, o worker não depende apenas de `IMAP SEARCH`; ele abre as mailboxes, lê os emails recentes e aplica os filtros no código. Isto evita falhas de pesquisa por flags, labels, localização da caixa ou comportamento específico do Gmail.

## Envio por API de email, sem SMTP

A partir desta versão, o envio dos PDFs pode ser feito por API HTTPS usando Resend. Esta é a opção recomendada para Render, porque evita timeouts/bloqueios nas portas SMTP `465` e `587`.

### Render — configuração recomendada

```env
CAMPAIGN_EMAIL_PROVIDER=resend
RESEND_API_KEY=COLOCAR_RESEND_API_KEY
CAMPAIGN_EMAIL_FROM_ADDRESS=Etiquetas Promo <onboarding@resend.dev>
CAMPAIGN_EMAIL_REPLY_TO=etiquetasprom@gmail.com
CAMPAIGN_EMAIL_API_TIMEOUT_MS=30000
CAMPAIGN_EMAIL_API_DEBUG=1
```

Durante testes, podes usar `onboarding@resend.dev`. Para produção, valida um domínio no Resend e troca para um remetente do teu domínio, por exemplo:

```env
CAMPAIGN_EMAIL_FROM_ADDRESS=Etiquetas Promo <etiquetas@experteletro.pt>
```

### Teste do provedor de email

Foi adicionada a rota:

```txt
POST /api/campanhas-automaticas/testar-email
```

A rota antiga continua disponível:

```txt
POST /api/campanhas-automaticas/testar-smtp
```

Quando `CAMPAIGN_EMAIL_PROVIDER=resend`, ambas validam a configuração da API de email.

### Deduplicação e título

Predefinições recomendadas:

```env
CAMPAIGN_DEFAULT_TITLE=PROMOÇÃO
CAMPAIGN_TITLE_FROM_EMAIL=0
CAMPAIGN_DEDUPE_ENABLED=1
CAMPAIGN_DEDUPE_BY_SUBJECT=1
CAMPAIGN_REPROCESS_ERRORED=0
```

Isto faz com que a campanha apareça no site como `PROMOÇÃO`, mantendo o assunto original apenas como metadado, e evita repetir a mesma campanha por email/loja e por assunto/loja.
