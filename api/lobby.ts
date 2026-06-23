// Modo online: lobbies com código, draft sincronizado por polling.
// A simulação é determinística no cliente (mesmo seed = mesmo resultado),
// então o servidor guarda o estado do lobby, os picks e a barreira coletiva de
// cada etapa do Major (todos prontos antes de avançar).
import { neon } from '@neondatabase/serverless';

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I/L
const MAX_PLAYERS: Record<string, number> = { duel: 2, party: 8 };
const RULESETS = new Set(['open', 'current', 'legends', 'brworld', 'era', 'ovrcap', 'unique_country', 'gauntlet']);
const TACTICS = new Set(['balanced', 'aggressive', 'tactical', 'controlled']);
const MAPS = new Set(['mirage', 'inferno', 'nuke', 'ancient', 'anubis', 'dust2', 'train']);
const PLAYBACK_SPEEDS = new Set([0.5, 1, 2, 4, 8]);
const VETO_ACTIONS = ['ban', 'ban', 'pick', 'pick', 'ban', 'ban'] as const;
type MajorVetoAction = 'ban' | 'pick' | 'decider';

interface MajorVetoState {
  steps: { team: 0 | 1 | -1; action: MajorVetoAction; map: string }[];
  remaining: string[];
  bestOf: 1 | 3 | 5;
  participants: [string | null, string | null];
  maps?: { map: string; pickedBy: 0 | 1 | -1 }[];
}

function majorVetoOrder(bestOf: 1 | 3 | 5): { team: 0 | 1 | -1; action: MajorVetoAction }[] {
  if (bestOf === 5) return [
    { team: 0, action: 'ban' }, { team: 1, action: 'ban' },
    { team: 0, action: 'pick' }, { team: 1, action: 'pick' },
    { team: 0, action: 'pick' }, { team: 1, action: 'pick' },
    { team: -1, action: 'decider' },
  ];
  if (bestOf === 1) return [
    { team: 0, action: 'ban' }, { team: 1, action: 'ban' },
    { team: 0, action: 'ban' }, { team: 1, action: 'ban' },
    { team: 0, action: 'ban' }, { team: 1, action: 'ban' },
    { team: -1, action: 'decider' },
  ];
  return [
    { team: 0, action: 'ban' }, { team: 1, action: 'ban' },
    { team: 0, action: 'pick' }, { team: 1, action: 'pick' },
    { team: 1, action: 'ban' }, { team: 0, action: 'ban' },
    { team: -1, action: 'decider' },
  ];
}

function advanceMajorVeto(state: MajorVetoState, map: string): MajorVetoState {
  const order = majorVetoOrder(state.bestOf);
  const step = order[state.steps.length];
  if (!step || step.action === 'decider' || !state.remaining.includes(map)) return state;
  const remaining = state.remaining.filter((candidate) => candidate !== map);
  const steps = [...state.steps, { ...step, map }];
  if (steps.length === order.length - 1) {
    const completedSteps = [...steps, { team: -1 as const, action: 'decider' as const, map: remaining[0] }];
    return {
      ...state,
      steps: completedSteps,
      remaining: [],
      maps: completedSteps
        .filter((entry) => entry.action === 'pick' || entry.action === 'decider')
        .map((entry) => ({ map: entry.map, pickedBy: entry.action === 'decider' ? -1 : entry.team as 0 | 1 })),
    };
  }
  return { ...state, steps, remaining };
}

interface VetoState {
  step: number;
  remaining: string[];
  bans: { map: string; by: string }[];
  picks: { map: string; by: string }[];
  turn?: string;
  deadline?: number;
  maps?: string[];
}

function initialVeto(participants: string[]): VetoState {
  return { step: 0, remaining: [...MAPS], bans: [], picks: [], turn: participants[0], deadline: Date.now() + 20_000 };
}

function advanceVeto(veto: VetoState, map: string, participants: string[]): VetoState {
  if (!veto.remaining.includes(map) || participants.length < 2) return veto;
  const action = VETO_ACTIONS[veto.step];
  if (!action) return veto;
  const by = veto.turn ?? participants[veto.step % 2];
  const remaining = veto.remaining.filter((candidate) => candidate !== map);
  const next: VetoState = {
    ...veto,
    step: veto.step + 1,
    remaining,
    bans: action === 'ban' ? [...veto.bans, { map, by }] : veto.bans,
    picks: action === 'pick' ? [...veto.picks, { map, by }] : veto.picks,
  };
  if (next.step >= VETO_ACTIONS.length) {
    next.turn = undefined;
    next.deadline = undefined;
    next.maps = [...next.picks.map((pick) => pick.map), ...remaining];
  } else {
    next.turn = participants[next.step % 2];
    next.deadline = Date.now() + 20_000;
  }
  return next;
}

function genCode(): string {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

// garante as colunas novas UMA vez por instância da função (não a cada request)
let schemaReady = false;
async function ensureSchema(sql: ReturnType<typeof neon>): Promise<void> {
  if (schemaReady) return;
  // rtm_ranking é de api/ranking.ts; garante a base aqui (mesma definição) pra o
  // matchmaking poder ler o MMR do host sem quebrar a listagem se a tabela faltar.
  await sql`CREATE TABLE IF NOT EXISTS rtm_ranking (email TEXT PRIMARY KEY, nick TEXT, mmr INT DEFAULT 1000, wins INT DEFAULT 0, losses INT DEFAULT 0, peak INT DEFAULT 1000, updated_at TIMESTAMPTZ DEFAULT now())`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS name text`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS ranked boolean DEFAULT false`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS locked boolean DEFAULT false`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS season int DEFAULT 1`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS last_ping timestamptz DEFAULT now()`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS stage int DEFAULT 0`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS stage_started_at bigint DEFAULT 0`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS ruleset text DEFAULT 'open'`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS run_seed bigint DEFAULT 0`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS playback_speed real DEFAULT 1`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS draft_rollouts int DEFAULT 2`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS veto_state jsonb DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS major_vetos jsonb DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS run_roster jsonb DEFAULT NULL`;
  await sql`ALTER TABLE lobby_players ADD COLUMN IF NOT EXISTS ready_stage int DEFAULT -1`;
  await sql`ALTER TABLE lobby_players ADD COLUMN IF NOT EXISTS strategy jsonb DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE lobby_players ADD COLUMN IF NOT EXISTS lineup jsonb DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE lobby_players ADD COLUMN IF NOT EXISTS rollouts jsonb DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE lobby_players ADD COLUMN IF NOT EXISTS spectator boolean DEFAULT false`;
  await sql`ALTER TABLE lobby_players ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now()`;
  schemaReady = true;
}

// janela em que um jogador é considerado "presente" (heartbeat recente). Quem
// passa disso não conta na barreira coletiva e pode ter o host migrado.
const PRESENT_MS = 70_000; // host só é considerado ausente após ~70s (cliente pinga a cada 25s: tolera pings perdidos)

// rate-limit best-effort POR INSTÂNCIA (não cobre flood distribuído; pra isso,
// usar o Firewall/rate-limit da Vercel). Protege o Neon do flood casual.
const rlBuckets = new Map<string, { n: number; reset: number }>();
function rateLimited(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (rlBuckets.size > 5000) rlBuckets.clear(); // evita crescer sem limite
  const b = rlBuckets.get(ip);
  if (!b || b.reset < now) { rlBuckets.set(ip, { n: 1, reset: now + windowMs }); return false; }
  b.n += 1;
  return b.n > max;
}
function clientIp(headers?: Record<string, string | string[] | undefined>): string {
  const h = headers ?? {};
  const raw = h['x-forwarded-for'] ?? h['x-real-ip'] ?? h['x-vercel-forwarded-for'] ?? '';
  const s = Array.isArray(raw) ? raw[0] : String(raw);
  return s.split(',')[0].trim() || 'unknown';
}

// promove o jogador ativo mais antigo a host quando o host atual sumiu
async function migrateHostIfStale(sql: ReturnType<typeof neon>, code: string): Promise<void> {
  const rows = await sql`
    SELECT host,
           (SELECT nick FROM lobby_players p
            WHERE p.code = l.code AND COALESCE(p.spectator, false) = false
              AND COALESCE(p.last_seen, p.joined_at) > now() - interval '70 seconds'
            ORDER BY p.joined_at ASC LIMIT 1) AS oldest_active,
           (SELECT COALESCE(last_seen, joined_at) FROM lobby_players p
            WHERE p.code = l.code AND lower(p.nick) = lower(l.host)) AS host_seen
    FROM lobbies l WHERE l.code = ${code}`;
  if (rows.length === 0) return;
  const { host, oldest_active, host_seen } = rows[0] as { host: string; oldest_active: string | null; host_seen: string | null };
  if (!oldest_active || String(oldest_active).toLowerCase() === String(host).toLowerCase()) return;
  const stale = !host_seen || Date.now() - new Date(host_seen as string).getTime() > PRESENT_MS;
  if (!stale) return;
  await sql`UPDATE lobbies SET host = ${oldest_active}, updated_at = now() WHERE code = ${code} AND lower(host) = lower(${host})`;
}

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; query?: Record<string, string | string[]>; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  res.setHeader('Cache-Control', 'no-store');
  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'no db' });
    return;
  }
  const sql = neon(url);
  try {
    await ensureSchema(sql);
  } catch {
    /* tabela pode não existir ainda no primeiro deploy; ações seguem */
  }

  // GET ?list=1 -> salas abertas (públicas) esperando jogadores
  if ((req.method === 'GET' || !req.method) && req.query?.list != null) {
    try {
      // aproveita pra fechar salas inativas (sem heartbeat há mais de 2min)
      await sql`DELETE FROM lobbies WHERE COALESCE(last_ping, updated_at) < now() - interval '4 minutes'`;
      // só lista salas com alguém ativo (ping nos últimos 60s)
      const rows = await sql`
        SELECT l.code, l.mode, l.pool, l.host, l.name, l.created_at, COALESCE(l.ranked, false) AS ranked,
               (SELECT COUNT(*) FROM lobby_players p WHERE p.code = l.code AND COALESCE(p.spectator, false) = false) AS players,
               (SELECT mmr FROM rtm_ranking rr WHERE lower(rr.nick) = lower(l.host) ORDER BY mmr DESC LIMIT 1) AS host_mmr
        FROM lobbies l
        WHERE l.is_public = true AND l.status = 'waiting'
              AND COALESCE(l.last_ping, l.created_at) > now() - interval '90 seconds'
        ORDER BY l.created_at DESC LIMIT 30`;
      const rooms = rows
        .map((r) => ({ ...r, players: Number(r.players), max: MAX_PLAYERS[r.mode as string] ?? 8, ranked: !!r.ranked, host_mmr: r.host_mmr == null ? null : Number(r.host_mmr) }))
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
      await migrateHostIfStale(sql, code); // auto-cura: host que sumiu cede o controle
    } catch {
      /* migração é best-effort, nunca bloqueia o poll */
    }
    try {
      const lobby = await sql`SELECT code, mode, host, status, seed, COALESCE(NULLIF(run_seed, 0), seed) AS run_seed, pool, COALESCE(name, '') AS name, created_at, COALESCE(locked, false) AS locked, COALESCE(ranked, false) AS ranked, COALESCE(season, 1) AS season, COALESCE(stage, 0) AS stage, COALESCE(stage_started_at, 0) AS stage_started_at, COALESCE(ruleset, 'open') AS ruleset, COALESCE(playback_speed, 1) AS playback_speed, COALESCE(draft_rollouts, 2) AS draft_rollouts, COALESCE(veto_state, '{}'::jsonb) AS veto, COALESCE(major_vetos, '{}'::jsonb) AS major_vetos, run_roster FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0) {
        res.status(404).json({ error: 'lobby não encontrado' });
        return;
      }
      const players = await sql`
        SELECT nick, picks, coach_pick, done, joined_at, COALESCE(ready_stage, -1) AS ready_stage,
               COALESCE(strategy, '{}'::jsonb) AS strategy, COALESCE(lineup, '{}'::jsonb) AS lineup, COALESCE(rollouts, '[]'::jsonb) AS rollouts,
               COALESCE(spectator, false) AS spectator FROM lobby_players
        WHERE code = ${code} ORDER BY joined_at ASC`;
      if (lobby[0].status === 'veto') {
        const participants = players.filter((player) => !player.spectator).map((player) => String(player.nick));
        const veto = lobby[0].veto as VetoState;
        if (veto.deadline && veto.deadline <= Date.now() && veto.remaining?.length) {
          const advanced = advanceVeto(veto, veto.remaining[0], participants);
          const nextStatus = advanced.maps ? 'done' : 'veto';
          await sql`UPDATE lobbies SET veto_state = ${JSON.stringify(advanced)}::jsonb, status = ${nextStatus}, updated_at = now() WHERE code = ${code}`;
          lobby[0].veto = advanced;
          lobby[0].status = nextStatus;
        }
      }
      res.status(200).json({
        lobby: { ...lobby[0], seed: Number(lobby[0].seed), run_seed: Number(lobby[0].run_seed), stage: Number(lobby[0].stage), stage_started_at: Number(lobby[0].stage_started_at), playback_speed: Number(lobby[0].playback_speed) },
        players: players.map((p) => ({ ...p, ready_stage: Number(p.ready_stage) })),
      });
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
    stage?: number;
    ruleset?: string;
    strategy?: unknown;
    keepRoster?: boolean;
    speed?: number;
    spectator?: boolean;
    lineup?: unknown;
    map?: string;
    banMap?: string;
    pickMap?: string;
    draftRollouts?: number;
    rollouts?: unknown;
    matchKey?: string;
    bestOf?: number;
    participants?: unknown;
    requiredVetoKeys?: unknown;
    force?: boolean;
  };
  const action = String(body.action ?? '');
  const nick = String(body.nick ?? '').trim().slice(0, 20);
  const code = String(body.code ?? '').toUpperCase().slice(0, 5);

  // rate-limit: protege o Neon de flood casual. ping é frequente (heartbeat),
  // então tem teto próprio; create é caro, teto estrito.
  const ip = clientIp(req.headers);
  if (action === 'create') {
    if (rateLimited(`create:${ip}`, 6, 60_000)) { res.status(429).json({ error: 'muitas salas criadas; espere um pouco' }); return; }
  } else if (action !== 'ping') {
    if (rateLimited(`w:${ip}`, 40, 10_000)) { res.status(429).json({ error: 'muitas ações; espere um instante' }); return; }
  } else if (rateLimited(`p:${ip}`, 20, 10_000)) {
    res.status(200).json({ ok: false }); return; // ping floodado: ignora silenciosamente
  }

  try {
    if (action === 'create') {
      if (!nick) {
        res.status(400).json({ error: 'nick obrigatório' });
        return;
      }
      const mode = body.mode === 'party' ? 'party' : 'duel';
      const pool = body.pool === 'br' ? 'br' : 'world';
      const ruleset = RULESETS.has(String(body.ruleset)) ? String(body.ruleset) : 'open';
      const name = (typeof body.name === 'string' ? body.name : '').trim().slice(0, 40) || null;
      const isPublic = body.isPublic === true;
      const ranked = body.ranked === true;
      const draftRollouts = Math.max(0, Math.min(5, body.draftRollouts == null ? 2 : Number(body.draftRollouts) || 0));
      const seed = Math.floor(Math.random() * 2147483647);
      // fecha salas inativas: ninguém com a aba aberta há mais de 2min (sem
      // heartbeat). Backstop de 6h pra qualquer resíduo.
      await sql`DELETE FROM lobbies WHERE COALESCE(last_ping, updated_at) < now() - interval '4 minutes'`;
      await sql`DELETE FROM lobbies WHERE created_at < now() - interval '6 hours'`;
      // tenta alguns códigos até achar um livre
      for (let attempt = 0; attempt < 5; attempt++) {
        const newCode = genCode();
        const exists = await sql`SELECT 1 FROM lobbies WHERE code = ${newCode}`;
        if (exists.length > 0) continue;
        await sql`INSERT INTO lobbies (code, mode, host, seed, run_seed, pool, name, is_public, ranked, ruleset, draft_rollouts) VALUES (${newCode}, ${mode}, ${nick}, ${seed}, ${seed}, ${pool}, ${name}, ${isPublic}, ${ranked}, ${ruleset}, ${draftRollouts})`;
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
      const spectator = body.spectator === true;
      if (lobby[0].status !== 'waiting' && !spectator) {
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
      const players = await sql`SELECT nick, COALESCE(spectator, false) AS spectator FROM lobby_players WHERE code = ${code}`;
      const max = MAX_PLAYERS[lobby[0].mode as string] ?? 8;
      if (players.some((p) => (p.nick as string).toLowerCase() === nick.toLowerCase())) {
        res.status(200).json({ ok: true, code, rejoined: true }); // reconexão
        return;
      }
      // INSERT atômico: só insere se ainda houver vaga (fecha a janela de corrida
      // entre dois JOINs simultâneos). UNIQUE(code,nick) cobre nicks repetidos.
      const inserted = await sql`
        INSERT INTO lobby_players (code, nick, spectator)
        SELECT ${code}, ${nick}, ${spectator}
        WHERE ${spectator} OR (SELECT COUNT(*) FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false) < ${max}
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
      const lobby = await sql`SELECT host, status, mode FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || lobby[0].host !== nick) {
        res.status(403).json({ error: 'só o host inicia o draft' });
        return;
      }
      if (lobby[0].status !== 'waiting') {
        res.status(409).json({ error: 'o draft já começou' });
        return;
      }
      const count = await sql`SELECT COUNT(*) AS n FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false`;
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
      const locked = body.locked === true;
      await sql`UPDATE lobbies SET locked = ${locked}, updated_at = now() WHERE code = ${code}`;
      res.status(200).json({ ok: true, locked });
      return;
    }

    if (action === 'kick') {
      const target = String(body.target ?? '').trim().slice(0, 20);
      const lobby = await sql`SELECT host, status, mode FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || lobby[0].host !== nick) {
        res.status(403).json({ error: 'só o host expulsa' });
        return;
      }
      // host pode remover na espera E no draft (libera sala travada por AFK)
      if (lobby[0].status !== 'waiting' && lobby[0].status !== 'drafting') {
        res.status(409).json({ error: 'não dá pra expulsar agora' });
        return;
      }
      if (!target || target.toLowerCase() === String(lobby[0].host).toLowerCase()) {
        res.status(400).json({ error: 'alvo inválido' });
        return;
      }
      await sql`DELETE FROM lobby_players WHERE code = ${code} AND lower(nick) = ${target.toLowerCase()}`;
      // se estava no draft, reavalia a barreira: remover um AFK que não terminou
      // pode liberar o avanço dos que já estão prontos (não trava mais).
      if (lobby[0].status === 'drafting') {
        const actives = await sql`SELECT nick, done FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false ORDER BY joined_at ASC`;
        const allDone = actives.length > 0 && actives.every((p) => p.done === true);
        if (allDone) {
          if (lobby[0].mode === 'duel' && actives.length >= 2) {
            const participants = actives.map((p) => String(p.nick));
            await sql`UPDATE lobbies SET status = 'veto', veto_state = ${JSON.stringify(initialVeto(participants))}::jsonb, updated_at = now() WHERE code = ${code}`;
          } else if (lobby[0].mode !== 'duel') {
            await sql`UPDATE lobbies SET status = 'done', run_roster = (
              SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'nick', nick, 'picks', COALESCE(picks, '[]'::jsonb), 'coach_pick', COALESCE(coach_pick, ''),
                'strategy', COALESCE(strategy, '{}'::jsonb), 'lineup', COALESCE(lineup, '{}'::jsonb), 'rollouts', COALESCE(rollouts, '[]'::jsonb)
              ) ORDER BY joined_at ASC), '[]'::jsonb)
              FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false
            ), updated_at = now() WHERE code = ${code}`;
          }
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'ping') {
      // heartbeat: mantém a sala viva e marca a presença individual do jogador
      if (!code) { res.status(200).json({ ok: false }); return; }
      await sql`UPDATE lobbies SET last_ping = now() WHERE code = ${code}`;
      if (nick) await sql`UPDATE lobby_players SET last_seen = now() WHERE code = ${code} AND lower(nick) = ${nick.toLowerCase()}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'leave') {
      // saída limpa: remove o jogador e migra o host se quem saiu era o host
      if (!code || !nick) { res.status(200).json({ ok: false }); return; }
      const wasHost = await sql`SELECT 1 FROM lobbies WHERE code = ${code} AND lower(host) = ${nick.toLowerCase()}`;
      await sql`DELETE FROM lobby_players WHERE code = ${code} AND lower(nick) = ${nick.toLowerCase()}`;
      if (wasHost.length > 0) {
        const next = await sql`
          SELECT nick FROM lobby_players
          WHERE code = ${code} AND COALESCE(spectator, false) = false
          ORDER BY joined_at ASC LIMIT 1`;
        if (next.length > 0) await sql`UPDATE lobbies SET host = ${next[0].nick}, updated_at = now() WHERE code = ${code}`;
        else await sql`DELETE FROM lobbies WHERE code = ${code}`; // ninguém sobrou
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'setPlaybackSpeed') {
      const speed = Number(body.speed);
      if (!PLAYBACK_SPEEDS.has(speed)) {
        res.status(400).json({ error: 'velocidade inválida' });
        return;
      }
      const updated = await sql`
        UPDATE lobbies SET playback_speed = ${speed}, updated_at = now()
        WHERE code = ${code} AND lower(host) = ${nick.toLowerCase()} AND COALESCE(stage_started_at, 0) = 0
        RETURNING playback_speed`;
      if (updated.length === 0) {
        res.status(403).json({ error: 'só o host controla a velocidade' });
        return;
      }
      res.status(200).json({ ok: true, speed });
      return;
    }

    if (action === 'vetoAction') {
      const map = String(body.map ?? '');
      const lobby = await sql`SELECT status, COALESCE(veto_state, '{}'::jsonb) AS veto FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || lobby[0].status !== 'veto') {
        res.status(409).json({ error: 'o veto não está em andamento' });
        return;
      }
      const participantsRows = await sql`SELECT nick FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false ORDER BY joined_at ASC`;
      const participants = participantsRows.map((player) => String(player.nick));
      const veto = lobby[0].veto as VetoState;
      if (String(veto.turn).toLowerCase() !== nick.toLowerCase()) {
        res.status(403).json({ error: 'aguarde sua vez' });
        return;
      }
      if (!MAPS.has(map) || !veto.remaining.includes(map)) {
        res.status(400).json({ error: 'mapa indisponível' });
        return;
      }
      const advanced = advanceVeto(veto, map, participants);
      const nextStatus = advanced.maps ? 'done' : 'veto';
      await sql`UPDATE lobbies SET veto_state = ${JSON.stringify(advanced)}::jsonb, status = ${nextStatus}, updated_at = now() WHERE code = ${code}`;
      res.status(200).json({ ok: true, veto: advanced, status: nextStatus });
      return;
    }

    if (action === 'nextSeason') {
      // host reinicia a sala numa nova temporada: novo sorteio (transferências),
      // todos draftam de novo e disputam outro Major. Mantém os mesmos jogadores.
      const lobby = await sql`SELECT host, status, mode FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || lobby[0].host !== nick) {
        res.status(403).json({ error: 'só o host inicia a próxima temporada' });
        return;
      }
      if (lobby[0].status !== 'done') {
        res.status(409).json({ error: 'a temporada ainda não acabou' });
        return;
      }
      const newSeed = Math.floor(Math.random() * 2147483647);
      const keepRoster = body.keepRoster === true;
      if (keepRoster) {
        const participantRows = await sql`SELECT nick FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false ORDER BY joined_at ASC`;
        const participants = participantRows.map((player) => String(player.nick));
        const duelVeto = lobby[0].mode === 'duel' ? initialVeto(participants) : {};
        const nextStatus = lobby[0].mode === 'duel' ? 'veto' : 'done';
        await sql`UPDATE lobbies SET status = ${nextStatus}, run_seed = ${newSeed}, season = COALESCE(season, 1) + 1, stage = 0, stage_started_at = 0, veto_state = ${JSON.stringify(duelVeto)}::jsonb, major_vetos = '{}'::jsonb, updated_at = now() WHERE code = ${code}`;
        // novo Major mantendo elencos: re-congela o snapshot (mesmos jogadores, run_seed novo)
        if (lobby[0].mode === 'party') {
          await sql`UPDATE lobbies SET run_roster = (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'nick', nick, 'picks', COALESCE(picks, '[]'::jsonb), 'coach_pick', COALESCE(coach_pick, ''),
              'strategy', COALESCE(strategy, '{}'::jsonb), 'lineup', COALESCE(lineup, '{}'::jsonb), 'rollouts', COALESCE(rollouts, '[]'::jsonb)
            ) ORDER BY joined_at ASC), '[]'::jsonb)
            FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false
          ) WHERE code = ${code}`;
        }
        await sql`UPDATE lobby_players SET ready_stage = -1 WHERE code = ${code}`;
      } else {
        await sql`UPDATE lobbies SET status = 'drafting', seed = ${newSeed}, run_seed = ${newSeed}, season = COALESCE(season, 1) + 1, stage = 0, stage_started_at = 0, veto_state = '{}'::jsonb, major_vetos = '{}'::jsonb, run_roster = NULL, updated_at = now() WHERE code = ${code}`;
        await sql`UPDATE lobby_players SET picks = '[]'::jsonb, coach_pick = '', strategy = '{}'::jsonb, lineup = '{}'::jsonb, rollouts = '[]'::jsonb, done = false, ready_stage = -1 WHERE code = ${code}`;
      }
      res.status(200).json({ ok: true, seed: newSeed, keepRoster });
      return;
    }

    if (action === 'readyStage') {
      const requestedStage = Math.max(0, Math.min(40, Number(body.stage) || 0));
      const lobby = await sql`
        SELECT status, mode, COALESCE(stage, 0) AS stage
        FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0) {
        res.status(404).json({ error: 'lobby não encontrado' });
        return;
      }
      const currentStage = Number(lobby[0].stage);
      if (lobby[0].status !== 'done' || lobby[0].mode !== 'party') {
        res.status(409).json({ error: 'o Major em grupo não está em andamento' });
        return;
      }
      if (requestedStage !== currentStage) {
        res.status(409).json({ error: 'etapa desatualizada', stage: currentStage });
        return;
      }
      const updated = await sql`
        UPDATE lobby_players SET ready_stage = ${currentStage}
        WHERE code = ${code} AND lower(nick) = ${nick.toLowerCase()} AND COALESCE(spectator, false) = false
        RETURNING id`;
      if (updated.length === 0) {
        res.status(404).json({ error: 'jogador não está neste lobby' });
        return;
      }
      res.status(200).json({ ok: true, stage: currentStage, advanced: false });
      return;
    }

    if (action === 'majorVetoAction') {
      const map = String(body.map ?? '');
      const matchKey = String(body.matchKey ?? '').slice(0, 180);
      const bestOf = ([1, 3, 5].includes(Number(body.bestOf)) ? Number(body.bestOf) : 3) as 1 | 3 | 5;
      const requestedParticipants = Array.isArray(body.participants)
        ? body.participants.slice(0, 2).map((value) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 20) : null) as [string | null, string | null]
        : [null, null] as [null, null];
      const lobby = await sql`SELECT status, mode, COALESCE(stage, 0) AS stage, COALESCE(stage_started_at, 0) AS stage_started_at, COALESCE(major_vetos, '{}'::jsonb) AS major_vetos FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0) {
        res.status(404).json({ error: 'lobby não encontrado' });
        return;
      }
      if (lobby[0].status !== 'done' || lobby[0].mode !== 'party') {
        res.status(409).json({ error: 'o veto do Major não está disponível' });
        return;
      }
      if (Number(lobby[0].stage_started_at) > 0) {
        res.status(409).json({ error: 'a rodada já começou' });
        return;
      }
      const stage = Number(lobby[0].stage);
      if (!matchKey.startsWith(`${stage}:`) || !MAPS.has(map)) {
        res.status(400).json({ error: 'ação de veto inválida' });
        return;
      }
      const lobbyPlayers = await sql`SELECT nick FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false`;
      const validPlayers = new Set(lobbyPlayers.map((player) => String(player.nick).toLowerCase()));
      if (!validPlayers.has(nick.toLowerCase()) || !requestedParticipants.some((participant) => participant?.toLowerCase() === nick.toLowerCase())) {
        res.status(403).json({ error: 'somente jogadores podem vetar mapas' });
        return;
      }
      const allVetos = lobby[0].major_vetos as Record<string, MajorVetoState>;
      const current = allVetos[matchKey] ?? { steps: [], remaining: [...MAPS], bestOf, participants: requestedParticipants };
      const step = majorVetoOrder(current.bestOf)[current.steps.length];
      if (!step || step.team === -1 || current.maps) {
        res.status(409).json({ error: 'o veto já terminou' });
        return;
      }
      const expectedPlayer = current.participants[step.team];
      const isHumanTurn = expectedPlayer !== null;
      const requesterIsParticipant = current.participants.some((participant) => participant?.toLowerCase() === nick.toLowerCase());
      if ((isHumanTurn && expectedPlayer!.toLowerCase() !== nick.toLowerCase()) || (!isHumanTurn && !requesterIsParticipant)) {
        res.status(403).json({ error: 'aguarde sua vez no veto' });
        return;
      }
      const advanced = advanceMajorVeto(current, map);
      const entry = JSON.stringify({ [matchKey]: advanced });
      await sql`UPDATE lobbies SET major_vetos = COALESCE(major_vetos, '{}'::jsonb) || ${entry}::jsonb, updated_at = now() WHERE code = ${code}`;
      res.status(200).json({ ok: true, stage, veto: advanced });
      return;
    }

    if (action === 'startStage') {
      const requiredVetoKeys = Array.isArray(body.requiredVetoKeys)
        ? body.requiredVetoKeys.filter((value): value is string => typeof value === 'string').slice(0, 8)
        : [];
      const lobby = await sql`SELECT host, status, mode, COALESCE(stage_started_at, 0) AS stage_started_at, COALESCE(major_vetos, '{}'::jsonb) AS major_vetos FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || String(lobby[0].host).toLowerCase() !== nick.toLowerCase()) {
        res.status(403).json({ error: 'somente o host inicia a rodada' });
        return;
      }
      if (lobby[0].status !== 'done' || lobby[0].mode !== 'party') {
        res.status(409).json({ error: 'o Major em grupo não está em andamento' });
        return;
      }
      // vetos pendentes NÃO travam a rodada: a simulação faz auto-veto determinístico
      // dos confrontos sem veto manual (online.ts). Antes, um veto que não fechava
      // (modal fechado na vez da IA, jogador que não vetou) congelava a sala inteira.
      void requiredVetoKeys;
      const startedAt = Number(lobby[0].stage_started_at) || Date.now() + 3_000;
      await sql`UPDATE lobbies SET stage_started_at = ${startedAt}, updated_at = now() WHERE code = ${code}`;
      res.status(200).json({ ok: true, startedAt });
      return;
    }

    if (action === 'advanceStage') {
      const lobby = await sql`SELECT host, status, mode, COALESCE(stage, 0) AS stage, COALESCE(stage_started_at, 0) AS stage_started_at FROM lobbies WHERE code = ${code}`;
      if (lobby.length === 0 || String(lobby[0].host).toLowerCase() !== nick.toLowerCase()) {
        res.status(403).json({ error: 'somente o host avança a rodada' });
        return;
      }
      const currentStage = Number(lobby[0].stage);
      if (lobby[0].status !== 'done' || lobby[0].mode !== 'party' || Number(lobby[0].stage_started_at) === 0) {
        res.status(409).json({ error: 'a rodada ainda não começou' });
        return;
      }
      // só bloqueia por quem está PRESENTE (heartbeat recente); jogador que caiu
      // não trava a sala. force = host avança na marra (estado é determinístico).
      if (body.force !== true) {
        const pending = await sql`
          SELECT COUNT(*) AS n FROM lobby_players
          WHERE code = ${code} AND COALESCE(spectator, false) = false
            AND COALESCE(ready_stage, -1) < ${currentStage}
            AND COALESCE(last_seen, joined_at) > now() - interval '70 seconds'`;
        if (Number(pending[0].n) > 0) {
          res.status(409).json({ error: 'ainda há jogadores assistindo suas partidas' });
          return;
        }
      }
      const advanced = await sql`
        UPDATE lobbies SET stage = ${currentStage + 1}, stage_started_at = 0, updated_at = now()
        WHERE code = ${code} AND COALESCE(stage, 0) = ${currentStage}
        RETURNING stage`;
      const nextStage = advanced.length ? Number(advanced[0].stage) : currentStage;
      res.status(200).json({ ok: true, stage: nextStage, advanced: nextStage > currentStage });
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
      const rollouts = JSON.stringify(
        Array.isArray(body.rollouts) ? body.rollouts.slice(0, 5).map((value) => Math.max(0, Math.min(5, Number(value) || 0))) : [],
      );
      const rawStrategy = body.strategy && typeof body.strategy === 'object' ? body.strategy as Record<string, unknown> : {};
      const strategy = JSON.stringify({
        tactic: TACTICS.has(String(rawStrategy.tactic)) ? String(rawStrategy.tactic) : 'balanced',
        favoriteMap: MAPS.has(String(rawStrategy.favoriteMap)) ? String(rawStrategy.favoriteMap) : 'mirage',
        banMap: MAPS.has(String(rawStrategy.banMap)) ? String(rawStrategy.banMap) : 'nuke',
        pace: ['aggressive', 'default', 'cautious'].includes(String(rawStrategy.pace)) ? String(rawStrategy.pace) : 'default',
        timeoutMap: Math.max(0, Math.min(2, Number(rawStrategy.timeoutMap) || 0)),
        substituteAfterMap: rawStrategy.substituteAfterMap === true,
      });
      const rawLineup = body.lineup && typeof body.lineup === 'object' ? body.lineup as Record<string, unknown> : {};
      const lineup = JSON.stringify({
        captainId: String(rawLineup.captainId ?? '').slice(0, 80),
        reserveId: String(rawLineup.reserveId ?? '').slice(0, 80),
      });
      const updated = await sql`
        UPDATE lobby_players SET picks = ${picks}::jsonb, coach_pick = ${coachPick}, strategy = ${strategy}::jsonb, lineup = ${lineup}::jsonb, rollouts = ${rollouts}::jsonb, done = ${done}
        WHERE code = ${code} AND nick = ${nick} AND COALESCE(spectator, false) = false
        RETURNING id`;
      if (updated.length === 0) {
        res.status(404).json({ error: 'jogador não está neste lobby' });
        return;
      }
      if (done) {
        const pending = await sql`SELECT COUNT(*) AS n FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false AND done = false`;
        if (Number(pending[0].n) === 0) {
          const room = await sql`SELECT mode FROM lobbies WHERE code = ${code}`;
          if (room[0]?.mode === 'duel') {
            const participantRows = await sql`SELECT nick FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false ORDER BY joined_at ASC`;
            const participants = participantRows.map((player) => String(player.nick));
            await sql`UPDATE lobbies SET status = 'veto', veto_state = ${JSON.stringify(initialVeto(participants))}::jsonb, updated_at = now() WHERE code = ${code}`;
          } else {
            // Major começou: CONGELA o elenco da corrida (snapshot). A partir daqui
            // o bracket é simulado do snapshot, não dos players ao vivo — entrar/sair
            // da sala não re-embaralha mais resultados já jogados.
            await sql`UPDATE lobbies SET status = 'done', run_roster = (
              SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'nick', nick, 'picks', COALESCE(picks, '[]'::jsonb), 'coach_pick', COALESCE(coach_pick, ''),
                'strategy', COALESCE(strategy, '{}'::jsonb), 'lineup', COALESCE(lineup, '{}'::jsonb), 'rollouts', COALESCE(rollouts, '[]'::jsonb)
              ) ORDER BY joined_at ASC), '[]'::jsonb)
              FROM lobby_players WHERE code = ${code} AND COALESCE(spectator, false) = false
            ), updated_at = now() WHERE code = ${code}`;
          }
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
