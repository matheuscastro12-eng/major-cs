// Ranking competitivo do modo online: MMR + ladder + TEMPORADAS, persistidos por conta.
// Só conta PAGA salva ranking (o modelo: ranking salvo é da conta vitalícia).
//
// Temporada mensal. No virar da temporada o reset é LAZY (por linha, quando o jogador
// volta): arquiva a colocação final e faz soft-reset do MMR rumo a 1000. As 5 primeiras
// partidas da temporada são de COLOCAÇÃO (placement: K maior, divisão "Calibrando").
//
// Ações (POST body.action): me | ladder | report | champions.
import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { decidePair, rankedDelta } from './_reportPairing.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const APP_SECRET = () => clean(process.env.APP_SECRET) || `fallback:${clean(process.env.DATABASE_URL) ?? 'dev'}`;

function verifyToken(token: string): string | null {
  const [b64, sig] = (token ?? '').split('.');
  if (!b64 || !sig) return null;
  const body = Buffer.from(b64, 'base64url').toString();
  const expect = createHmac('sha256', APP_SECRET()).update(body).digest('base64url');
  const sb = Buffer.from(sig); const eb = Buffer.from(expect);
  if (sb.length !== eb.length || !timingSafeEqual(sb, eb)) return null;
  const [email, exp] = body.split('|');
  if (!email || Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return email;
}

// divisões estilo CS (do menor ao maior). Antes de calibrar, "Calibrando".
const DIVISIONS: [number, string][] = [[0, 'Prata'], [1200, 'Ouro Nova'], [1600, 'Mestre Guardião'], [1900, 'Águia'], [2200, 'Global Elite']];
const PLACEMENT_GAMES = 5;
const divFor = (mmr: number, games = PLACEMENT_GAMES) => (games < PLACEMENT_GAMES ? 'Calibrando' : ([...DIVISIONS].reverse().find(([m]) => mmr >= m)?.[1] ?? 'Prata'));
const K_WIN = 25, K_LOSS = 20, K_PLACE = 40;

// temporada = mês. Número 1-indexado a partir de jan/2026 (Temporada 6 = jun/2026).
function seasonNow() {
  const d = new Date();
  const no = (d.getUTCFullYear() - 2026) * 12 + (d.getUTCMonth() + 1);
  const endsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  const startsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  return { no, endsAt, startsAt };
}

// schema garantido 1x por instância (não em toda invocação): os 4 DDL rodavam em
// CADA request — inclusive nos polls públicos de ladder — gastando round-trips ao
// Neon (Fluid Active CPU) à toa. Agora roda uma vez por cold start, num único
// transaction. `CREATE/ALTER ... IF NOT EXISTS` seguem idempotentes.
let schemaReady = false;
async function ensureSchema(sql: ReturnType<typeof neon>): Promise<void> {
  if (schemaReady) return;
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS rtm_ranking (email TEXT PRIMARY KEY, nick TEXT, mmr INT DEFAULT 1000, wins INT DEFAULT 0, losses INT DEFAULT 0, peak INT DEFAULT 1000, updated_at TIMESTAMPTZ DEFAULT now())`,
    sql`ALTER TABLE rtm_ranking ADD COLUMN IF NOT EXISTS season INT`,
    sql`ALTER TABLE rtm_ranking ADD COLUMN IF NOT EXISTS season_games INT DEFAULT 0`,
    sql`CREATE TABLE IF NOT EXISTS rtm_season_archive (season INT, email TEXT, nick TEXT, mmr INT, division TEXT, place INT, PRIMARY KEY (season, email))`,
    // reports por partida (anti-fraude): 1 por jogador por lobby; o MMR só é
    // aplicado quando os dois lados batem (ver api/_reportPairing.ts).
    sql`CREATE TABLE IF NOT EXISTS rtm_match_reports (code TEXT, email TEXT, nick TEXT, won BOOLEAN NOT NULL, status TEXT DEFAULT 'pending', reported_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (code, email))`,
    sql`CREATE INDEX IF NOT EXISTS rtm_match_reports_email_idx ON rtm_match_reports (email, status)`,
  ]);
  schemaReady = true;
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; query?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  // GET é permitido só pros públicos (ladder/champions) pra o s-maxage valer no
  // edge (a Vercel NÃO cacheia POST). me/report seguem POST (autenticados).
  if (req.method !== 'POST' && req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl);
  await ensureSchema(sql);

  const season = seasonNow();
  const seasonInfo = { season: season.no, endsAt: season.endsAt, startsAt: season.startsAt };

  let body: Record<string, unknown> = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { /* vazio */ }
  const q = (k: string) => { const v = req.query?.[k]; return Array.isArray(v) ? v[0] : v; };
  const action = String((req.method === 'GET' ? q('action') : body.action) ?? '');

  // ladder público da temporada atual (top 50 + total). Não exige token.
  if (action === 'ladder') {
    const rows = await sql`SELECT nick, mmr, wins, losses, season_games FROM rtm_ranking WHERE season=${season.no} ORDER BY mmr DESC, wins DESC LIMIT 50`;
    const total = await sql`SELECT count(*)::int AS n FROM rtm_ranking WHERE season=${season.no}`;
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    res.status(200).json({
      ...seasonInfo,
      total: total[0]?.n ?? 0,
      ladder: rows.map((r, i) => ({ rank: i + 1, nick: String(r.nick ?? 'manager'), mmr: Number(r.mmr), division: divFor(Number(r.mmr), Number(r.season_games)), wins: Number(r.wins), losses: Number(r.losses), placing: Number(r.season_games) < PLACEMENT_GAMES })),
    });
    return;
  }

  // campeões da temporada passada (arquivo). Público.
  if (action === 'champions') {
    const prev = season.no - 1;
    const rows = await sql`SELECT nick, mmr, division, place FROM rtm_season_archive WHERE season=${prev} ORDER BY place ASC LIMIT 10`;
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    res.status(200).json({ season: prev, champions: rows.map((r) => ({ place: Number(r.place), nick: String(r.nick), mmr: Number(r.mmr), division: String(r.division) })) });
    return;
  }

  const email = verifyToken(String(body.token ?? ''));
  if (!email) { res.status(401).json({ error: 'Entre na sua conta pra acessar o ranking.' }); return; }

  // só conta paga tem ranking salvo
  const acc = await sql`SELECT paid, nick FROM rtm_accounts WHERE email=${email}`;
  if (!acc.length) { res.status(401).json({ error: 'conta não encontrada' }); return; }
  if (!acc[0].paid) { res.status(403).json({ error: 'unpaid', message: 'O ranking persistente faz parte da conta com save na nuvem.' }); return; }
  const nick = String((body.nick as string) || acc[0].nick || 'manager').slice(0, 40);

  // garante a linha do jogador na temporada atual (faz reset lazy se preciso) e devolve o estado fresco.
  const ensureRow = async () => {
    const r = await sql`SELECT mmr, wins, losses, peak, season, season_games FROM rtm_ranking WHERE email=${email}`;
    if (!r.length) {
      await sql`INSERT INTO rtm_ranking (email, nick, season, season_games) VALUES (${email}, ${nick}, ${season.no}, 0)`;
      return;
    }
    const rowSeason = r[0].season == null ? null : Number(r[0].season);
    if (rowSeason === season.no) {
      await sql`UPDATE rtm_ranking SET nick=${nick} WHERE email=${email}`;
      return;
    }
    if (rowSeason == null) {
      // linha legada: adota a temporada atual mantendo o MMR (sem reset).
      await sql`UPDATE rtm_ranking SET nick=${nick}, season=${season.no} WHERE email=${email}`;
      return;
    }
    // virou a temporada: arquiva a colocação final e faz soft-reset rumo a 1000.
    const oldMmr = Number(r[0].mmr);
    const rk = await sql`SELECT count(*)::int AS n FROM rtm_ranking WHERE season=${rowSeason} AND mmr > ${oldMmr}`;
    const place = (rk[0]?.n ?? 0) + 1;
    await sql`INSERT INTO rtm_season_archive (season, email, nick, mmr, division, place) VALUES (${rowSeason}, ${email}, ${nick}, ${oldMmr}, ${divFor(oldMmr)}, ${place}) ON CONFLICT (season, email) DO UPDATE SET mmr=EXCLUDED.mmr, division=EXCLUDED.division, place=EXCLUDED.place`;
    const reset = Math.max(0, Math.round(1000 + (oldMmr - 1000) * 0.35));
    await sql`UPDATE rtm_ranking SET nick=${nick}, mmr=${reset}, wins=0, losses=0, season=${season.no}, season_games=0 WHERE email=${email}`;
  };

  const myRow = async () => {
    const r = await sql`SELECT mmr, wins, losses, peak, season_games FROM rtm_ranking WHERE email=${email}`;
    if (!r.length) return null;
    const games = Number(r[0].season_games);
    const rk = await sql`SELECT count(*)::int AS n FROM rtm_ranking WHERE season=${season.no} AND mmr > ${Number(r[0].mmr)}`;
    return {
      mmr: Number(r[0].mmr), wins: Number(r[0].wins), losses: Number(r[0].losses), peak: Number(r[0].peak),
      division: divFor(Number(r[0].mmr), games), rank: (rk[0]?.n ?? 0) + 1,
      games, placing: games < PLACEMENT_GAMES, placementLeft: Math.max(0, PLACEMENT_GAMES - games),
      ...seasonInfo,
    };
  };

  // aplica UMA partida ranqueada no MMR de um jogador (mesma fórmula do report
  // legado). Só toca em linha da temporada corrente — linha velha/inexistente
  // é ignorada (o jogador re-sincroniza no próximo 'me').
  const applyRanked = async (em: string, w: boolean) => {
    const cur = await sql`SELECT mmr, season_games FROM rtm_ranking WHERE email=${em} AND season=${season.no}`;
    if (!cur.length) return null;
    const before = Number(cur[0].mmr ?? 1000);
    const gamesBefore = Number(cur[0].season_games ?? 0);
    const delta = rankedDelta(w, before, gamesBefore, { placementGames: PLACEMENT_GAMES, kWin: K_WIN, kLoss: K_LOSS, kPlace: K_PLACE });
    const after = Math.max(0, before + delta);
    const gamesAfter = gamesBefore + 1;
    await sql`UPDATE rtm_ranking SET mmr=${after}, wins=wins+${w ? 1 : 0}, losses=losses+${w ? 0 : 1}, season_games=${gamesAfter}, peak=GREATEST(peak, ${after}), updated_at=now() WHERE email=${em}`;
    return { delta, before, after, gamesBefore, gamesAfter };
  };

  // carência: reports meus pendentes há 10+ min sem contraparte entram solo
  // (oponente fechou a aba antes de reportar). Roda no 'me' e no 'report'.
  const sweepSoloGrace = async () => {
    const stale = await sql`
      SELECT code, won FROM rtm_match_reports r
      WHERE email=${email} AND status='pending' AND reported_at < now() - interval '10 minutes'
        AND NOT EXISTS (SELECT 1 FROM rtm_match_reports o WHERE o.code=r.code AND o.email<>${email})`;
    for (const s of stale) {
      // marca ANTES de aplicar (idempotência entre requests concorrentes: só
      // quem transicionar pending→applied-solo credita a partida).
      const claim = await sql`UPDATE rtm_match_reports SET status='applied-solo' WHERE code=${String(s.code)} AND email=${email} AND status='pending' RETURNING code`;
      if (claim.length) await applyRanked(email, !!s.won);
    }
  };

  if (action === 'me') {
    await ensureRow();
    await sweepSoloGrace();
    res.status(200).json(await myRow());
    return;
  }

  if (action === 'report') {
    const won = !!body.won;
    const code = String(body.code ?? '').trim().slice(0, 12);
    await ensureRow();
    await sweepSoloGrace();
    // report ranqueado agora é POR PARTIDA: precisa do código do lobby. Sem
    // código = cliente antigo → não pontua (resposta 200 pra não poluir o
    // console; o cliente ignora o corpo).
    if (!code) { res.status(200).json({ applied: false, legacy: true, delta: 0, me: await myRow(), ...seasonInfo }); return; }
    // partida precisa existir, ser RANQUEADA (qualquer modo online) e o
    // reporter precisa ter jogado nela (participante não-espectador).
    const lb = await sql`SELECT ranked, mode, created_at FROM lobbies WHERE code=${code}`;
    if (!lb.length) { res.status(404).json({ error: 'partida não encontrada' }); return; }
    if (!lb[0].ranked) { res.status(400).json({ error: 'partida não é ranqueada' }); return; }
    const inLobby = await sql`SELECT 1 FROM lobby_players WHERE code=${code} AND nick=${nick} AND COALESCE(spectator, false) = false`;
    if (!inLobby.length) { res.status(403).json({ error: 'você não jogou essa partida' }); return; }
    // 1 report por jogador por partida (PK code+email) — refresh não duplica.
    const ins = await sql`INSERT INTO rtm_match_reports (code, email, nick, won) VALUES (${code}, ${email}, ${nick}, ${won}) ON CONFLICT (code, email) DO NOTHING RETURNING code`;
    if (!ins.length) { res.status(200).json({ applied: false, duplicate: true, delta: 0, me: await myRow(), ...seasonInfo }); return; }

    // pareamento zero-soma só faz sentido no DUELO 1v1 do Ultimate. Nos outros
    // modos ranqueados (Major/gauntlet online) os dois humanos podem vencer
    // legitimamente (placement) — aplica direto, protegido pelo dedupe por
    // partida + checagem de participante acima.
    if (String(lb[0].mode) !== 'ultimate') {
      const solo = await applyRanked(email, won);
      await sql`UPDATE rtm_match_reports SET status='applied' WHERE code=${code} AND email=${email}`;
      if (!solo) { res.status(200).json({ applied: false, delta: 0, me: await myRow(), ...seasonInfo }); return; }
      const db = divFor(solo.before, solo.gamesBefore);
      const da = divFor(solo.after, solo.gamesAfter);
      res.status(200).json({
        applied: true, delta: solo.delta, before: solo.before, after: solo.after,
        division: da, divisionBefore: db,
        promoted: da !== db && solo.after > solo.before,
        demoted: da !== db && solo.after < solo.before,
        placing: solo.gamesAfter < PLACEMENT_GAMES, placementLeft: Math.max(0, PLACEMENT_GAMES - solo.gamesAfter),
        placedNow: solo.gamesBefore < PLACEMENT_GAMES && solo.gamesAfter >= PLACEMENT_GAMES,
        me: await myRow(),
      });
      return;
    }

    const other = await sql`SELECT email, won, status FROM rtm_match_reports WHERE code=${code} AND email<>${email} LIMIT 1`;
    const outcome = decidePair(
      won,
      other.length ? !!other[0].won : null,
      other.length ? (String(other[0].status) as 'pending' | 'applied' | 'applied-solo' | 'conflict') : null,
    );

    if (outcome === 'wait') {
      // oponente ainda não reportou: nada aplicado; o par (ou a carência) fecha.
      res.status(200).json({ applied: false, pending: true, delta: 0, me: await myRow(), ...seasonInfo });
      return;
    }
    if (outcome === 'conflict') {
      // os dois reclamam o mesmo resultado: partida não conta pra ninguém.
      await sql`UPDATE rtm_match_reports SET status='conflict' WHERE code=${code}`;
      res.status(200).json({ applied: false, conflict: true, delta: 0, me: await myRow(), ...seasonInfo });
      return;
    }
    // consistente: aplica o meu lado (e o do oponente, se ainda não entrou solo).
    const mine = await applyRanked(email, won);
    if (outcome === 'apply-both' && other.length) await applyRanked(String(other[0].email), !!other[0].won);
    await sql`UPDATE rtm_match_reports SET status='applied' WHERE code=${code} AND status IN ('pending')`;
    if (!mine) { res.status(200).json({ applied: false, delta: 0, me: await myRow(), ...seasonInfo }); return; }
    const divisionBefore = divFor(mine.before, mine.gamesBefore);
    const divisionAfter = divFor(mine.after, mine.gamesAfter);
    res.status(200).json({
      applied: true,
      delta: mine.delta, before: mine.before, after: mine.after,
      division: divisionAfter, divisionBefore,
      promoted: divisionAfter !== divisionBefore && mine.after > mine.before,
      demoted: divisionAfter !== divisionBefore && mine.after < mine.before,
      placing: mine.gamesAfter < PLACEMENT_GAMES, placementLeft: Math.max(0, PLACEMENT_GAMES - mine.gamesAfter),
      placedNow: mine.gamesBefore < PLACEMENT_GAMES && mine.gamesAfter >= PLACEMENT_GAMES,
      me: await myRow(),
    });
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
