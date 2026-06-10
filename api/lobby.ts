// Modo online: lobbies com código, draft sincronizado por polling.
// A simulação é determinística no cliente (mesmo seed = mesmo resultado),
// então o servidor só guarda o estado do lobby e os picks.
import { neon } from '@neondatabase/serverless';

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I/L
const MAX_PLAYERS: Record<string, number> = { duel: 2, party: 8 };

function genCode(): string {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; query?: Record<string, string | string[]> },
  res: Res,
) {
  res.setHeader('Cache-Control', 'no-store');
  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'no db' });
    return;
  }
  const sql = neon(url);

  // GET ?code=XXXXX -> estado do lobby (polling)
  if (req.method === 'GET' || !req.method) {
    const code = String((req.query?.code as string) ?? '').toUpperCase().slice(0, 5);
    if (!code) {
      res.status(400).json({ error: 'código obrigatório' });
      return;
    }
    try {
      const lobby = await sql`SELECT code, mode, host, status, seed, pool, created_at FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0) {
        res.status(404).json({ error: 'lobby não encontrado' });
        return;
      }
      const players = await sql`
        SELECT nick, picks, coach_pick, done, joined_at FROM lobby_players
        WHERE code = ${code} ORDER BY joined_at ASC`;
      res.status(200).json({ lobby: { ...lobby[0], seed: Number(lobby[0].seed) }, players });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    action?: string;
    code?: string;
    nick?: string;
    mode?: string;
    pool?: string;
    picks?: unknown;
    coachPick?: string;
    done?: boolean;
  };
  const action = String(body.action ?? '');
  const nick = String(body.nick ?? '').trim().slice(0, 20);
  const code = String(body.code ?? '').toUpperCase().slice(0, 5);

  try {
    if (action === 'create') {
      if (!nick) {
        res.status(400).json({ error: 'nick obrigatório' });
        return;
      }
      const mode = body.mode === 'party' ? 'party' : 'duel';
      const pool = body.pool === 'br' ? 'br' : 'world';
      const seed = Math.floor(Math.random() * 2147483647);
      // tenta alguns códigos até achar um livre
      for (let attempt = 0; attempt < 5; attempt++) {
        const newCode = genCode();
        const exists = await sql`SELECT 1 FROM lobbies WHERE code = ${newCode}`;
        if (exists.length > 0) continue;
        await sql`INSERT INTO lobbies (code, mode, host, seed, pool) VALUES (${newCode}, ${mode}, ${nick}, ${seed}, ${pool})`;
        await sql`INSERT INTO lobby_players (code, nick) VALUES (${newCode}, ${nick})`;
        res.status(200).json({ ok: true, code: newCode });
        return;
      }
      res.status(500).json({ error: 'não foi possível gerar código' });
      return;
    }

    if (action === 'join') {
      if (!nick || !code) {
        res.status(400).json({ error: 'nick e código obrigatórios' });
        return;
      }
      const lobby = await sql`SELECT mode, status FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0) {
        res.status(404).json({ error: 'lobby não encontrado' });
        return;
      }
      if (lobby[0].status !== 'waiting') {
        res.status(409).json({ error: 'o draft já começou' });
        return;
      }
      const players = await sql`SELECT nick FROM lobby_players WHERE code = ${code}`;
      const max = MAX_PLAYERS[lobby[0].mode as string] ?? 8;
      if (players.some((p) => (p.nick as string).toLowerCase() === nick.toLowerCase())) {
        res.status(200).json({ ok: true, code, rejoined: true }); // reconexão
        return;
      }
      if (players.length >= max) {
        res.status(409).json({ error: 'lobby cheio' });
        return;
      }
      await sql`INSERT INTO lobby_players (code, nick) VALUES (${code}, ${nick})`;
      res.status(200).json({ ok: true, code });
      return;
    }

    if (action === 'start') {
      const lobby = await sql`SELECT host, status FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || lobby[0].host !== nick) {
        res.status(403).json({ error: 'só o host inicia o draft' });
        return;
      }
      const count = await sql`SELECT COUNT(*) AS n FROM lobby_players WHERE code = ${code}`;
      if (Number(count[0].n) < 2) {
        res.status(409).json({ error: 'precisa de pelo menos 2 jogadores' });
        return;
      }
      await sql`UPDATE lobbies SET status = 'drafting', updated_at = now() WHERE code = ${code}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'pick') {
      const picks = JSON.stringify(Array.isArray(body.picks) ? body.picks.slice(0, 5) : []);
      const coachPick = String(body.coachPick ?? '').slice(0, 60);
      const done = body.done === true;
      await sql`
        UPDATE lobby_players SET picks = ${picks}::jsonb, coach_pick = ${coachPick}, done = ${done}
        WHERE code = ${code} AND nick = ${nick}`;
      if (done) {
        const pending = await sql`SELECT COUNT(*) AS n FROM lobby_players WHERE code = ${code} AND done = false`;
        if (Number(pending[0].n) === 0) {
          await sql`UPDATE lobbies SET status = 'done', updated_at = now() WHERE code = ${code}`;
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'ação inválida' });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
