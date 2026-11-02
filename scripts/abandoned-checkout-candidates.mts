// Lista (NÃO envia) candidatos ao lembrete de checkout abandonado. Só SELECT.
// Uso: DATABASE_URL=... npx tsx scripts/abandoned-checkout-candidates.mts [--preview]
// --preview imprime o e-mail montado do 1º candidato (para revisão do texto).
// Nunca imprime a DATABASE_URL. Envio: não existe (REMINDER_SEND_ENABLED=false).
import { neon } from '@neondatabase/serverless';
import { listReminderCandidates, renderReminderEmail, REMINDER_SEND_ENABLED } from '../server/abandoned-checkout.ts';

const url = process.env.DATABASE_URL?.trim();
if (!url) { console.error('defina DATABASE_URL (não é impressa)'); process.exit(1); }
const sql = neon(url);
const { candidates, reminderTable } = await listReminderCandidates(sql as never);
console.log(JSON.stringify({ count: candidates.length, reminderTable, sendEnabled: REMINDER_SEND_ENABLED }, null, 2));
for (const c of candidates) console.log(`${c.createdAt}\t${c.nick}\t${c.email}`);
if (process.argv.includes('--preview') && candidates[0]) {
  const price = `R$ ${(Number(process.env.PIX_PRICE_CENTS || 0) / 100).toFixed(2).replace('.', ',')}`;
  console.log(renderReminderEmail({ nick: candidates[0].nick, price, link: 'https://roadtomajor.com.br/?criar', unsubscribe: 'https://roadtomajor.com.br/privacidade' }).text);
}
