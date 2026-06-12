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

  // GET ?list=1 -> salas abertas (públicas) esperando jogadores
  if ((req.method === 'GET' || !req.method) && req.query?.list != null) {
    try {
      await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false`;
      await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS last_ping timestamptz DEFAULT now()`;
      // aproveita pra fechar salas inativas (sem heartbeat há mais de 2min)
      await sql`DELETE FROM lobbies WHERE COALESCE(last_ping, updated_at) < now() - interval '2 minutes'`;
      // só lista salas com alguém ativo (ping nos últimos 60s)
      const rows = await sql`
        SELECT l.code, l.mode, l.pool, l.host, l.created_at,
               (SELECT COUNT(*) FROM lobby_players p WHERE p.code = l.code) AS players
        FROM lobbies l
        WHERE l.is_public = true AND l.status = 'waiting'
              AND COALESCE(l.last_ping, l.created_at) > now() - interval '60 seconds'
        ORDER BY l.created_at DESC LIMIT 30`;
      const rooms = rows
        .map((r) => ({ ...r, players: Number(r.players), max: MAX_PLAYERS[r.mode as string] ?? 8 }))
        .filter((r) => r.players < r.max);
      res.status(200).json({ rooms });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  // GET ?code=XXXXX -> estado do lobby (polling)
  if (req.method === 'GET' || !req.method) {
    const code = String((req.query?.code as string) ?? '').toUpperCase().slice(0, 5);
    if (!code) {
      res.status(400).json({ error: 'código obrigatório' });
      return;
    }
    try {
      const lobby = await sql`SELECT code, mode, host, status, seed, pool, created_at, COALESCE(locked, false) AS locked, COALESCE(season, 1) AS season FROM lobbies WHERE code = ${code}`;
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
    isPublic?: boolean;
    locked?: boolean;
    target?: string;
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
      const isPublic = body.isPublic === true;
      const seed = Math.floor(Math.random() * 2147483647);
      await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false`;
      await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS locked boolean DEFAULT false`;
      await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS season int DEFAULT 1`;
      await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS last_ping timestamptz DEFAULT now()`;
      // fecha salas inativas: ninguém com a aba aberta há mais de 2min (sem
      // heartbeat). Backstop de 6h pra qualquer resíduo.
      await sql`DELETE FROM lobbies WHERE COALESCE(last_ping, updated_at) < now() - interval '2 minutes'`;
      await sql`DELETE FROM lobbies WHERE created_at < now() - interval '6 hours'`;
      // tenta alguns códigos até achar um livre
      for (let attempt = 0; attempt < 5; attempt++) {
        const newCode = genCode();
        const exists = await sql`SELECT 1 FROM lobbies WHERE code = ${newCode}`;
        if (exists.length > 0) continue;
        await sql`INSERT INTO lobbies (code, mode, host, seed, pool, is_public) VALUES (${newCode}, ${mode}, ${nick}, ${seed}, ${pool}, ${isPublic})`;
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
      const lobby = await sql`SELECT mode, status, COALESCE(locked, false) AS locked FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0) {
        res.status(404).json({ error: 'lobby não encontrado' });
        return;
      }
      if (lobby[0].status !== 'waiting') {
        res.status(409).json({ error: 'o draft já começou' });
        return;
      }
      if (lobby[0].locked) {
        // host trancou: só quem já estava na sala pode reconectar
        const already = await sql`SELECT 1 FROM lobby_players WHERE code = ${code} AND lower(nick) = ${nick.toLowerCase()}`;
        if (already.length === 0) {
          res.status(403).json({ error: 'sala trancada' });
          return;
        }
      }
      const players = await sql`SELECT nick FROM lobby_players WHERE code = ${code}`;
      const max = MAX_PLAYERS[lobby[0].mode as string] ?? 8;
      if (players.some((p) => (p.nick as string).toLowerCase() === nick.toLowerCase())) {
        res.status(200).json({ ok: true, code, rejoined: true }); // reconexão
        return;
      }
      // INSERT atômico: só insere se ainda houver vaga (fecha a janela de corrida
      // entre dois JOINs simultâneos). UNIQUE(code,nick) cobre nicks repetidos.
      const inserted = await sql`
        INSERT INTO lobby_players (code, nick)
        SELECT ${code}, ${nick}
        WHERE (SELECT COUNT(*) FROM lobby_players WHERE code = ${code}) < ${max}
        ON CONFLICT (code, nick) DO NOTHING
        RETURNING id`;
      if (inserted.length === 0) {
        res.status(409).json({ error: 'lobby cheio' });
        return;
      }
      res.status(200).json({ ok: true, code });
      return;
    }

    if (action === 'start') {
      const lobby = await sql`SELECT host, status FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || lobby[0].host !== nick) {
        res.status(403).json({ error: 'só o host inicia o draft' });
        return;
      }
      if (lobby[0].status !== 'waiting') {
        res.status(409).json({ error: 'o draft já começou' });
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

    if (action === 'lock') {
      const lobby = await sql`SELECT host FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || lobby[0].host !== nick) {
        res.status(403).json({ error: 'só o host tranca a sala' });
        return;
      }
      await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS locked boolean DEFAULT false`;
      const locked = body.locked === true;
      await sql`UPDATE lobbies SET locked = ${locked}, updated_at = now() WHERE code = ${code}`;
      res.status(200).json({ ok: true, locked });
      return;
    }

    if (action === 'kick') {
      const target = String(body.target ?? '').trim().slice(0, 20);
      const lobby = await sql`SELECT host, status FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || lobby[0].host !== nick) {
        res.status(403).json({ error: 'só o host expulsa' });
        return;
      }
      if (lobby[0].status !== 'waiting') {
        res.status(409).json({ error: 'o draft já começou' });
        return;
      }
      if (!target || target.toLowerCase() === String(lobby[0].host).toLowerCase()) {
        res.status(400).json({ error: 'alvo inválido' });
        return;
      }
      await sql`DELETE FROM lobby_players WHERE code = ${code} AND lower(nick) = ${target.toLowerCase()}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'ping') {
      // heartbeat: mantém a sala viva enquanto alguém tem a aba aberta
      if (!code) { res.status(200).json({ ok: false }); return; }
      await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS last_ping timestamptz DEFAULT now()`;
      await sql`UPDATE lobbies SET last_ping = now() WHERE code = ${code}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'nextSeason') {
      // host reinicia a sala numa nova temporada: novo sorteio (transferências),
      // todos draftam de novo e disputam outro Major. Mantém os mesmos jogadores.
      const lobby = await sql`SELECT host, status FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || lobby[0].host !== nick) {
        res.status(403).json({ error: 'só o host inicia a próxima temporada' });
        return;
      }
      if (lobby[0].status !== 'done') {
        res.status(409).json({ error: 'a temporada ainda não acabou' });
        return;
      }
      await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS season int DEFAULT 1`;
      const newSeed = Math.floor(Math.random() * 2147483647);
      await sql`UPDATE lobbies SET status = 'drafting', seed = ${newSeed}, season = COALESCE(season, 1) + 1, updated_at = now() WHERE code = ${code}`;
      await sql`UPDATE lobby_players SET picks = '[]'::jsonb, coach_pick = '', done = false WHERE code = ${code}`;
      res.status(200).json({ ok: true, seed: newSeed });
      return;
    }

    if (action === 'pick') {
      const lobby = await sql`SELECT status FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0) {
        res.status(404).json({ error: 'lobby não encontrado' });
        return;
      }
      if (lobby[0].status !== 'drafting') {
        res.status(409).json({ error: 'o draft não está em andamento' });
        return;
      }
      const picks = JSON.stringify(
        Array.isArray(body.picks) ? body.picks.filter((p) => typeof p === 'string').slice(0, 5) : [],
      );
      const coachPick = String(body.coachPick ?? '').slice(0, 60);
      const done = body.done === true;
      const updated = await sql`
        UPDATE lobby_players SET picks = ${picks}::jsonb, coach_pick = ${coachPick}, done = ${done}
        WHERE code = ${code} AND nick = ${nick}
        RETURNING id`;
      if (updated.length === 0) {
        res.status(404).json({ error: 'jogador não está neste lobby' });
        return;
      }
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
