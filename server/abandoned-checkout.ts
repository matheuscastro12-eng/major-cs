// LEMBRETE DE CHECKOUT ABANDONADO — PREPARADO, NÃO ENVIA.
//
// Dado (Growth, 30d): 27 de 40 checkout_open do Pix abandonaram. Quem fez o
// cadastro pré-pagamento (rtm_pending_signups) e não pagou é o único grupo com
// e-mail conhecido. Este módulo:
//   - lista candidatos (só SELECT): pendente há 1h..7d, sem pagamento, ainda
//     não lembrado (rtm_checkout_reminders, migration NÃO rodada: tolera ausente);
//   - monta o e-mail (texto + html) com o preço vigente vindo de quem chama.
// NÃO existe caminho de envio aqui. REMINDER_SEND_ENABLED é false e fica false:
// ligar o envio exige um PR próprio + ok do Matheus (e base legal/descadastro).

export const REMINDER_SEND_ENABLED = false as const;
export const REMINDER_MIN_AGE_HOURS = 1;
export const REMINDER_MAX_AGE_DAYS = 7;
export const REMINDER_LIMIT = 200;

export interface ReminderCandidate { email: string; nick: string; createdAt: string }

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

function rowsToCandidates(rows: Record<string, unknown>[]): ReminderCandidate[] {
  return rows.map((r) => ({ email: String(r.email ?? ''), nick: String(r.nick ?? ''), createdAt: String(r.created_at ?? '') }))
    .filter((c) => /\S+@\S+\.\S+/.test(c.email));
}

/** Candidatos ao lembrete. Só leitura; sem a tabela de lembretes, ignora esse filtro. */
export async function listReminderCandidates(sql: Sql): Promise<{ candidates: ReminderCandidate[]; reminderTable: boolean }> {
  try {
    const rows = await sql`
      SELECT p.email, p.nick, p.created_at FROM rtm_pending_signups p
      WHERE p.created_at < now() - make_interval(hours => ${REMINDER_MIN_AGE_HOURS})
        AND p.created_at > now() - make_interval(days => ${REMINDER_MAX_AGE_DAYS})
        AND NOT EXISTS (SELECT 1 FROM rtm_paid_emails e WHERE e.email = p.email)
        AND NOT EXISTS (SELECT 1 FROM rtm_accounts a WHERE a.email = p.email AND a.paid)
        AND NOT EXISTS (SELECT 1 FROM rtm_checkout_reminders r WHERE r.email = p.email)
      ORDER BY p.created_at DESC LIMIT ${REMINDER_LIMIT}`;
    return { candidates: rowsToCandidates(rows), reminderTable: true };
  } catch {
    const rows = await sql`
      SELECT p.email, p.nick, p.created_at FROM rtm_pending_signups p
      WHERE p.created_at < now() - make_interval(hours => ${REMINDER_MIN_AGE_HOURS})
        AND p.created_at > now() - make_interval(days => ${REMINDER_MAX_AGE_DAYS})
        AND NOT EXISTS (SELECT 1 FROM rtm_paid_emails e WHERE e.email = p.email)
        AND NOT EXISTS (SELECT 1 FROM rtm_accounts a WHERE a.email = p.email AND a.paid)
      ORDER BY p.created_at DESC LIMIT ${REMINDER_LIMIT}`;
    return { candidates: rowsToCandidates(rows), reminderTable: false };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** E-mail do lembrete. Puro. `price` vem do servidor (env do preço), nunca fixo aqui. */
export function renderReminderEmail(c: { nick: string; price: string; link: string; unsubscribe: string }): { subject: string; text: string; html: string } {
  const name = c.nick.trim() || 'manager';
  const subject = 'Seu Pix do Road to Major ficou pela metade';
  const text = [
    `Oi, ${name}!`,
    '',
    `Você começou a ativar a conta vitalícia do Road to Major, mas o pagamento não chegou. Seu cadastro continua guardado.`,
    `Para terminar: ${c.link}`,
    `Pagamento único de ${c.price}, por Pix (QR na hora) ou cartão. O acesso libera sozinho assim que o pagamento cai.`,
    '',
    'Se já pagou, ignore este e-mail.',
    `Não quer mais receber? ${c.unsubscribe}`,
  ].join('\n');
  const html = `<p>Oi, ${esc(name)}!</p>
<p>Você começou a ativar a conta vitalícia do Road to Major, mas o pagamento não chegou. Seu cadastro continua guardado.</p>
<p><a href="${esc(c.link)}">Terminar a ativação</a> · pagamento único de <b>${esc(c.price)}</b>, por Pix (QR na hora) ou cartão.</p>
<p style="color:#888;font-size:12px">Se já pagou, ignore este e-mail. <a href="${esc(c.unsubscribe)}">Não quero mais receber</a>.</p>`;
  return { subject, text, html };
}
