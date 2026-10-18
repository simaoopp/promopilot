import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { supabaseAdminClient } from '../lib/supabaseClients.js';

// Produces a private SQL batch for review; never applies it to the database.
async function main() {
  const args = process.argv.slice(2);
  const emails = [...new Set(args.filter(arg => arg.startsWith('--legacy-admin-email='))
    .map(arg => arg.slice('--legacy-admin-email='.length).trim().toLowerCase()))];
  const noLegacy = args.includes('--no-legacy-admin');
  const output = args.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
  if ((!emails.length && !noLegacy) || (emails.length && noLegacy) || !output?.endsWith('.private.sql')
    || emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('Indicar --legacy-admin-email=CONTA_VERIFICADA (repetível), ou --no-legacy-admin após revisão, e --output=migracao.private.sql.');
  }
  const ids = [];
  if (emails.length) {
    if (!supabaseAdminClient) throw new Error('Configurar Supabase e a chave de serviço apenas no servidor.');
    const wanted = new Set(emails);
    for (let page = 1; wanted.size; page += 1) {
      const { data, error } = await supabaseAdminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error('Não foi possível verificar as contas existentes no Supabase.');
      for (const user of data?.users || []) {
        const email = String(user.email || '').toLowerCase();
        if (!wanted.has(email)) continue;
        if (!user.email_confirmed_at || (user.banned_until && new Date(user.banned_until) > new Date())
          || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new Error('Uma conta indicada não está verificada ou está suspensa.');
        ids.push(user.id); wanted.delete(email);
      }
      if ((data?.users?.length || 0) < 1000 && wanted.size) throw new Error('Uma conta indicada não existe. Não foi gerado SQL.');
    }
  }
  const migration = await readFile(new URL('../../supabase/migrations/20261015_platform_permissions.sql', import.meta.url), 'utf8');
  const sql = `-- PRIVADO: contém identificadores de contas. Não enviar para Git.\nselect set_config('promopilot.legacy_admin_user_ids', '${JSON.stringify(ids)}', false);\n${migration}`;
  await writeFile(resolve(output), sql, { mode: 0o600, flag: 'wx' });
  console.log('Ficheiro privado preparado. Rever e executar o lote completo primeiro em staging. Nenhuma alteração aplicada à base.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
