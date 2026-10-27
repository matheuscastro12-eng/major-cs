// MAJOR COM AMIGOS — liga privada do Pick'em do PGL Major Singapore 2026.
// Ações (POST body.action): create | join | picks | get | reveal.
// Nick + código bastam (body.memberId = id aleatório guardado no navegador);
// com conta, body.token identifica o membro como nas outras rotas.
// Lógica pura e DDL em server/major-league.ts.
import { randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { verifyAccountToken } from '../server/auth.js';
import { clientIp, rateLimitHit, respondLimited, type RateSql } from '../server/rate-limit.js';
import { normalizeNick, nickProblem } from '../server/nick.js';
import {
  schemaQueries, codeFromBytes, seedFromBytes, normalizeCode, validPicks, leagueName, memberKeyOf,
  createLeague, joinLeague, getLeague, revealLeague, type SqlTag,
} from '../server/major-league.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

let schemaReady = false;
// limites por IP/minuto: get é o polling do ranking; create é raro
const ACTION_LIMITS: Record<string, number> = { get: 60, join: 20, picks: 30, create: 5, reveal: 10 };

const JOIN_ERRORS: Record<string, [number, string]> = {
  not_found: [404, 'Liga não encontrada. Confira o código.'],
  full: [409, 'Essa liga já está cheia.'],
  locked: [409, 'O resultado dessa liga já foi revelado. Os palpites estão travados.'],
  nick_taken: [409, 'Já tem alguém com esse nick nessa liga.'],
};

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let body: Record<string, unknown>;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  const action = String(body.action ?? '');
  if (!(action in ACTION_LIMITS)) { res.status(400).json({ error: 'ação desconhecida' }); return; }

  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl) as unknown as SqlTag;

  const ip = clientIp(req.headers);
  const limit = await rateLimitHit(sql as unknown as RateSql, [
    { key: `major-league:ip:${ip}`, limit: 120, windowSec: 60 },
    { key: `major-league:${action}:ip:${ip}`, limit: ACTION_LIMITS[action], windowSec: 60 },
  ]);
  if (respondLimited(res, limit)) return;

  if (!schemaReady) {
    for (const q of schemaQueries(sql)) await q;
    schemaReady = true;
  }

  // conta logada é opcional: token inválido simplesmente não identifica
  let email: string | null = null;
  try { email = body.token ? verifyAccountToken(String(body.token)) : null; } catch { email = null; }
  const memberKey = memberKeyOf(email, body.memberId);

  if (action === 'get') {
    const code = normalizeCode(body.code);
    if (!code) { res.status(400).json({ error: 'Código inválido.' }); return; }
    const out = await getLeague(sql, code, memberKey);
    if (!out) { res.status(404).json({ error: JOIN_ERRORS.not_found[1] }); return; }
    res.status(200).json({ ok: true, ...out });
    return;
  }

  if (!memberKey) { res.status(400).json({ error: 'Identificação do jogador ausente.' }); return; }

  if (action === 'reveal') {
    const code = normalizeCode(body.code);
    if (!code) { res.status(400).json({ error: 'Código inválido.' }); return; }
    const r = await revealLeague(sql, code, memberKey);
    if (!r.ok) { res.status(r.error === 'not_found' ? 404 : 403).json({ error: r.error === 'not_found' ? JOIN_ERRORS.not_found[1] : 'Só quem criou a liga pode revelar.' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  const nick = normalizeNick(body.nick);
  const problem = nickProblem(nick);
  if (problem) { res.status(400).json({ error: problem }); return; }
  const picks = body.picks === undefined ? undefined : validPicks(body.picks);
  if (picks === null) { res.status(400).json({ error: 'Palpite inválido.' }); return; }

  if (action === 'create') {
    const name = leagueName(body.name) || `Liga de ${nick}`;
    for (let i = 0; i < 5; i++) {
      const code = codeFromBytes(randomBytes(6));
      if (await createLeague(sql, code, name, seedFromBytes(randomBytes(4)), memberKey, nick)) {
        if (picks) await joinLeague(sql, code, memberKey, nick, picks);
        res.status(200).json({ ok: true, ...(await getLeague(sql, code, memberKey)) });
        return;
      }
    }
    res.status(503).json({ error: 'Não deu pra gerar um código agora. Tente de novo.' });
    return;
  }

  // join | picks
  const code = normalizeCode(body.code);
  if (!code) { res.status(400).json({ error: 'Código inválido.' }); return; }
  const r = await joinLeague(sql, code, memberKey, nick, action === 'picks' ? picks ?? '' : picks);
  if (!r.ok) { const [st, msg] = JOIN_ERRORS[r.error]; res.status(st).json({ error: msg, code: r.error }); return; }
  res.status(200).json({ ok: true, ...(await getLeague(sql, code, memberKey)) });
}
