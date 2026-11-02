// Jobs agendados (Vercel Cron, ver "crons" no vercel.json). Uma rota só, com
// ?job=<nome>, pra não gastar uma função por job.
//
// Autenticação: a Vercel manda `Authorization: Bearer <CRON_SECRET>` quando a
// env CRON_SECRET existe no projeto. Sem a env configurada a rota recusa tudo
// (503) — nada roda por acidente, e ligar o job é configurar o segredo.
//
// Jobs:
//   wl-settle  [O0-22] fecha o Major da Semana que acabou e paga o top 10
//              por colocação (wlSettle, idempotente pelo ledger).
import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';
import { wlSchemaQueries, wlSettle } from '../server/weekend-league.js';
import { ultEconomySchemaQueries, type SqlTag } from '../server/ultimate-economy.js';
import { lastClosedWindowId } from '../server/wlSettleCron.js';
import { internalError } from '../server/internalError.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
type Req = { method?: string; query?: Record<string, string | string[] | undefined>; headers?: Record<string, string | string[] | undefined> };

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

// comparação em tempo constante do header com o segredo
export function cronAuthorized(header: string | string[] | undefined, secret: string | undefined): boolean {
  if (!secret) return false;
  const got = Buffer.from(String(Array.isArray(header) ? header[0] : header ?? ''));
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) { res.status(503).json({ error: 'CRON_SECRET não configurado' }); return; }
  if (!cronAuthorized(req.headers?.authorization, secret)) { res.status(401).json({ error: 'unauthorized' }); return; }
  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const job = String((Array.isArray(req.query?.job) ? req.query?.job[0] : req.query?.job) ?? '');
  try {
    if (job === 'wl-settle') {
      const sql = neon(dbUrl) as unknown as SqlTag;
      for (const q of [...ultEconomySchemaQueries(sql), ...wlSchemaQueries(sql)]) await q;
      const now = new Date();
      const windowId = lastClosedWindowId(now);
      const r = await wlSettle(sql, windowId, now, false);
      if (!r.ok) {
        // janela vazia não é erro (semana sem inscritos); o resto vai pro log
        console.log(`[cron:wl-settle] ${windowId}: ${r.error}`);
        res.status(200).json({ ok: true, windowId, skipped: r.error });
        return;
      }
      const fresh = r.paid.filter((p) => !p.replayed);
      console.log(`[cron:wl-settle] ${windowId}: ${fresh.length} pagos agora, ${r.paid.length - fresh.length} já pagos antes`);
      // sem e-mail na resposta: só colocação, nick e prêmio
      res.status(200).json({ ok: true, windowId, paid: r.paid.map((p) => ({ rank: p.rank, nick: p.nick, prize: p.prize, replayed: p.replayed })) });
      return;
    }
    res.status(400).json({ error: 'job desconhecido' });
  } catch (e) {
    internalError(res, `cron:${job}`, e);
  }
}
