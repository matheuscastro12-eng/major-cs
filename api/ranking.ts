// Ranking competitivo do modo online: MMR + ladder + TEMPORADAS, persistidos por conta.
// Só conta PAGA salva ranking (o modelo: ranking salvo é da conta vitalícia).
//
// Temporada mensal. No virar da temporada o reset é LAZY (por linha, quando o jogador
// volta): arquiva a colocação final e faz soft-reset do MMR rumo a 1000. As 5 primeiras
// partidas da temporada são de COLOCAÇÃO (placement: K maior, divisão "Calibrando").
//
// Ações (POST body.action): me | ladder | report | champions | dailyWeekClaim | dailyWeekChampions | dailyStreak [URG-4]
//   | communityGoal (público) | communityGoalClaim [URG-5].
import { neon } from '@neondatabase/serverless';
import { verifyAccountToken } from '../server/auth.js'; // [O0-15] token num módulo só, falha fechada
import { adoptNickIfMissing, normalizeNick } from '../server/nick.js'; // [O1-10]
import { decidePair, GRACE_MS, rankedDelta } from './_reportPairing.js';
import { rivalryFor, rivalryPair } from '../server/rivalry.js'; // [U11]
import { eventRewardFor } from '../src/engine/ultimate/events.js'; // [U12]
import { applyUltTransaction, type SqlTag } from '../server/ultimate-economy.js'; // [U12]
import { weekendEventDef } from '../server/weekendEvent.js'; // [URG-2]
import { detectOvertakes, OVERTAKE_TOP } from '../server/rivalNotify.js'; // [URG-3]
import { dayKey as spDayKey, mergeStreak, recordDailyPlay, type StreakState } from '../src/engine/daily/streak.js'; // [URG-4]
import { internalError } from '../server/internalError.js'; // [O0-43]
import { bumpCommunityContrib, communityGoalClaim, communityGoalSchemaQueries, communityGoalStatus } from '../server/communityGoal.js'; // [URG-5]

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
// [O0-15] sem o fallback derivado de DATABASE_URL: sem APP_SECRET nenhum token
// vale (server/auth.ts), e o ranking responde 401 em vez de aceitar forjado.
const verifyToken = verifyAccountToken;

// divisões estilo CS (do menor ao maior). Antes de calibrar, "Calibrando".
const DIVISIONS: [number, string][] = [[0, 'Prata'], [1200, 'Ouro Nova'], [1600, 'Mestre Guardião'], [1900, 'Águia'], [2200, 'Global Elite']];
const PLACEMENT_GAMES = 5;
const divFor = (mmr: number, games = PLACEMENT_GAMES) => (games < PLACEMENT_GAMES ? 'Calibrando' : ([...DIVISIONS].reverse().find(([m]) => mmr >= m)?.[1] ?? 'Prata'));
const K_WIN = 25, K_LOSS = 20, K_PLACE = 40;
// [W1] pódio semanal da Série do Dia só premia com campo mínimo (espelha
// WEEK_PRIZE_MIN_FIELD em src/engine/rtp/weeklyTitles.ts).
const WEEK_PRIZE_MIN_FIELD = 5;
// [O0-45] modos cujo report ranqueado é aceito (1v1, pareamento zero-soma).
export const RANKED_REPORT_MODES = ['ultimate', 'duel'];

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
    // [U11] RIVALIDADE por CONTA: head-to-head agregado (par canônico de e-mails); rtm_rivalry_matches
    // garante que cada partida conta UMA vez (o primeiro INSERT vence). Duelo privado reporta em
    // rtm_duel_reports (não vale RP) e pareia do mesmo jeito.
    sql`CREATE TABLE IF NOT EXISTS rtm_rivalries (pair TEXT PRIMARY KEY, email_a TEXT NOT NULL, email_b TEXT NOT NULL, nick_a TEXT, nick_b TEXT, wins_a INT DEFAULT 0, wins_b INT DEFAULT 0, games INT DEFAULT 0, last_at TIMESTAMPTZ, last_code TEXT)`,
    sql`CREATE INDEX IF NOT EXISTS rtm_rivalries_a_idx ON rtm_rivalries (email_a)`,
    sql`CREATE INDEX IF NOT EXISTS rtm_rivalries_b_idx ON rtm_rivalries (email_b)`,
    sql`CREATE TABLE IF NOT EXISTS rtm_rivalry_matches (code TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_duel_reports (code TEXT, email TEXT, nick TEXT, won BOOLEAN NOT NULL, reported_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (code, email))`,
    // [U12] EVENTOS: vitórias/derrotas por conta por evento (cap maxMatches) e prêmio pago 1x (ledger opId ev:<id>:<version>)
    sql`CREATE TABLE IF NOT EXISTS rtm_event_entries (event_id TEXT, email TEXT, wins INT DEFAULT 0, losses INT DEFAULT 0, version INT DEFAULT 1, claimed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (event_id, email))`,
    // SÉRIE DO DIA (RtP): 1 resultado por conta por dia — o PRIMEIRO vale (sem
    // re-jogar pra farmar rating). day = nº do desafio (época 2026-08-01).
    sql`CREATE TABLE IF NOT EXISTS rtm_daily_series (day INT, email TEXT, nick TEXT, rating REAL NOT NULL, won BOOLEAN NOT NULL, map_a INT DEFAULT 0, map_b INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (day, email))`,
    sql`CREATE INDEX IF NOT EXISTS rtm_daily_series_day_idx ON rtm_daily_series (day, rating DESC)`,
    // DIÁRIO (grátis, sem conta): contadores AGREGADOS por jogo/dia — prova
    // social ("N jogaram hoje"). Anônimo de propósito: nada de PII, só counts.
    sql`CREATE TABLE IF NOT EXISTS rtm_daily_games (day INT, game TEXT, plays INT DEFAULT 0, wins INT DEFAULT 0, PRIMARY KEY (day, game))`,
    // DRAFT DO DIA (Ultimate): 1 resultado por conta por dia — a 1ª run do dia
    // usa a seed global (mesmo draft pra todo mundo) e o PRIMEIRO report vale.
    // Desempate por OVR ASC: vencer com squad mais fraco rankeia acima.
    sql`CREATE TABLE IF NOT EXISTS rtm_ult_draft (day INT, email TEXT, nick TEXT, wins INT NOT NULL, ovr INT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (day, email))`,
    sql`CREATE INDEX IF NOT EXISTS rtm_ult_draft_day_idx ON rtm_ult_draft (day, wins DESC, ovr ASC)`,
    // Pódio do DRAFT DO DIA: registro do PRÊMIO coletado (PK day+email = claim
    // único). O prêmio é aplicado no SAVE pelo cliente (padrão coinsClaim) —
    // creditar direto no ledger seria desfeito pela reconciliação local-vence.
    sql`CREATE TABLE IF NOT EXISTS rtm_ult_draft_prizes (day INT, email TEXT, rank INT NOT NULL, coins INT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (day, email))`,
    // [W1] Pódio SEMANAL da Série do Dia: registro do SELO coletado (PK week+
    // email = claim único). Cosmético (campeão/pódio da semana N), aplicado no
    // SAVE pelo cliente (weeklyTitles) — mesmo padrão do rtm_ult_draft_prizes.
    sql`CREATE TABLE IF NOT EXISTS rtm_daily_week_prizes (week INT, email TEXT, place INT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (week, email))`,
    // [URG-3] AVISO DE RIVAL: ultrapassagens no ladder (quem me passou, de onde
    // pra onde) — lidas pelo 'me' com `since` pra mostrar o bloco no Hub. A
    // conta é identificada por e-mail (PK de rtm_accounts). Retenção de 30 dias
    // em DELETE SEPARADO e amostrado (2% dos reports) — nunca no caminho da escrita.
    sql`CREATE TABLE IF NOT EXISTS rtm_overtakes (id BIGSERIAL PRIMARY KEY, victim_email TEXT NOT NULL, by_email TEXT NOT NULL, by_nick TEXT, old_pos INT NOT NULL, new_pos INT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE INDEX IF NOT EXISTS rtm_overtakes_victim_idx ON rtm_overtakes (victim_email, created_at DESC)`,
    // [URG-4] STREAK DO DIÁRIO por conta (colunas aditivas em rtm_accounts): dias
    // seguidos jogando o Diário. O cliente manda o local; o servidor guarda o
    // MAIOR (mergeStreak) — vale pra qualquer conta logada, paga ou não.
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS streak_current INT DEFAULT 0`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS streak_best INT DEFAULT 0`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS streak_last_day TEXT`,
  ]);
  // [URG-5] meta comunitária da semana (contadores agregados por semana ISO e por conta)
  for (const q of communityGoalSchemaQueries(sql as unknown as SqlTag)) await q;
  schemaReady = true;
}

// dia corrente da Série do Dia (mesma época do Diário: 2026-08-01 = dia 1).
// UTC no servidor; o cliente usa data local — aceita ±1 de folga no report.
function dailyDayNow(): number {
  const now = new Date();
  const days = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(2026, 7, 1)) / 86_400_000);
  return Math.max(1, days + 1);
}

type Req = { method?: string; body?: Record<string, unknown> | string; query?: Record<string, string | string[] | undefined> };

// [O0-43] nenhuma exceção sai crua: antes, erro do Neon virava 500 da própria
// Vercel (sem corpo útil e, no log, só como info). Agora loga com id de
// correlação e responde a mensagem genérica.
export default async function handler(req: Req, res: Res) {
  try {
    await handle(req, res);
  } catch (e) {
    internalError(res, 'ranking', e);
  }
}

async function handle(req: Req, res: Res) {
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

  // ── SÉRIE DO DIA ────────────────────────────────────────────────────────────
  // ladder do dia (público, cacheado no edge). ?day=N (default: hoje).
  if (action === 'dailyLadder') {
    const reqDay = Number(q('day') ?? body.day ?? 0) || dailyDayNow();
    const day = Math.max(1, Math.min(dailyDayNow() + 1, reqDay));
    const rows = await sql`SELECT nick, rating, won, map_a, map_b FROM rtm_daily_series WHERE day=${day} ORDER BY rating DESC, won DESC, map_a - map_b DESC, created_at ASC LIMIT 50`;
    const total = await sql`SELECT count(*)::int AS n FROM rtm_daily_series WHERE day=${day}`;
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json({
      day,
      total: total[0]?.n ?? 0,
      ladder: rows.map((r, i) => ({ rank: i + 1, nick: String(r.nick ?? 'pro'), rating: Number(r.rating), won: !!r.won, mapScore: [Number(r.map_a), Number(r.map_b)] })),
    });
    return;
  }

  // ── DIÁRIO (grátis) ─────────────────────────────────────────────────────────
  // stats agregadas do dia (público, cacheado no edge): plays/wins por jogo.
  if (action === 'dailyGamesStats') {
    const day = Math.max(1, Math.min(dailyDayNow() + 1, Number(q('day') ?? body.day ?? 0) || dailyDayNow()));
    const rows = await sql`SELECT game, plays, wins FROM rtm_daily_games WHERE day=${day}`;
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ day, games: Object.fromEntries(rows.map((r) => [String(r.game), { plays: Number(r.plays), wins: Number(r.wins) }])) });
    return;
  }
  // ping anônimo de conclusão (1 UPDATE agregado — sem PII, sem linha por
  // jogador). Sanidade: jogo na allowlist e dia ±1 do corrente; o localStorage
  // do cliente já impede re-jogar o dia (abuso só infla um contador público).
  if (action === 'dailyGamesPing') {
    const game = String(body.game ?? '');
    const day = Math.round(Number(body.day) || 0);
    const won = !!body.won;
    if (!['lines', 'whois', 'impostor', 'classic'].includes(game)) { res.status(400).json({ error: 'jogo inválido' }); return; }
    if (Math.abs(day - dailyDayNow()) > 1) { res.status(400).json({ error: 'dia inválido' }); return; }
    await sql`INSERT INTO rtm_daily_games (day, game, plays, wins) VALUES (${day}, ${game}, 1, ${won ? 1 : 0})
              ON CONFLICT (day, game) DO UPDATE SET plays = rtm_daily_games.plays + 1, wins = rtm_daily_games.wins + ${won ? 1 : 0}`;
    res.status(200).json({ ok: true });
    return;
  }

  // ladder SEMANAL da Série do Dia (público, cacheado): soma de rating dos
  // dias jogados na semana + dias/vitórias. Semana 1 = dias 1-7 da época.
  // ?week=N (default: semana corrente). Jogar todo dia é o único caminho pro topo.
  if (action === 'dailyWeekLadder') {
    const curWeek = Math.max(1, Math.floor((dailyDayNow() - 1) / 7) + 1);
    const week = Math.max(1, Math.min(curWeek, Number(q('week') ?? body.week ?? 0) || curWeek));
    const dayA = (week - 1) * 7 + 1;
    const dayB = dayA + 6;
    const rows = await sql`SELECT email, max(nick) AS nick, sum(rating)::real AS pts, count(*)::int AS days, sum(CASE WHEN won THEN 1 ELSE 0 END)::int AS wins
                           FROM rtm_daily_series WHERE day BETWEEN ${dayA} AND ${dayB}
                           GROUP BY email ORDER BY pts DESC, wins DESC LIMIT 50`;
    const total = await sql`SELECT count(DISTINCT email)::int AS n FROM rtm_daily_series WHERE day BETWEEN ${dayA} AND ${dayB}`;
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      week, dayA, dayB,
      total: total[0]?.n ?? 0,
      ladder: rows.map((r, i) => ({ rank: i + 1, nick: String(r.nick ?? 'pro'), pts: Math.round(Number(r.pts) * 100) / 100, days: Number(r.days), wins: Number(r.wins) })),
    });
    return;
  }

  // [W1] pódio da ÚLTIMA semana FECHADA da Série do Dia (público, cacheado):
  // prova social na tela do desafio ("campeão da semana N: fulano"). Mesma
  // régua do claim: pts DESC, vitórias DESC, primeiro report; só com o campo
  // mínimo de participantes. ?week=N (default: semana passada).
  if (action === 'dailyWeekChampions') {
    const curWeek = Math.max(1, Math.floor((dailyDayNow() - 1) / 7) + 1);
    const reqWeek = Number(q('week') ?? body.week ?? 0) || (curWeek - 1);
    const week = Math.max(1, Math.min(curWeek - 1, reqWeek));
    if (week < 1 || curWeek <= 1) { res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900'); res.status(200).json({ week: 0, total: 0, podium: [] }); return; }
    const dayA = (week - 1) * 7 + 1;
    const dayB = dayA + 6;
    const rows = await sql`SELECT max(nick) AS nick, sum(rating)::real AS pts, count(*)::int AS days, sum(CASE WHEN won THEN 1 ELSE 0 END)::int AS wins, min(created_at) AS first_at
                           FROM rtm_daily_series WHERE day BETWEEN ${dayA} AND ${dayB}
                           GROUP BY email ORDER BY pts DESC, wins DESC, first_at ASC LIMIT 3`;
    const total = await sql`SELECT count(DISTINCT email)::int AS n FROM rtm_daily_series WHERE day BETWEEN ${dayA} AND ${dayB}`;
    const field = Number(total[0]?.n ?? 0);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.status(200).json({
      week, total: field,
      podium: field >= WEEK_PRIZE_MIN_FIELD
        ? rows.map((r, i) => ({ place: i + 1, nick: String(r.nick ?? 'pro'), pts: Math.round(Number(r.pts) * 100) / 100, days: Number(r.days), wins: Number(r.wins) }))
        : [],
    });
    return;
  }

  // ── DRAFT DO DIA (Ultimate) ─────────────────────────────────────────────────
  // ranking do dia (público, cacheado no edge). ?day=N (default: hoje).
  // Ordem: vitórias DESC, OVR ASC (venceu com squad mais fraco = acima), chegada.
  if (action === 'ultDraftBoard') {
    const reqDay = Number(q('day') ?? body.day ?? 0) || dailyDayNow();
    const day = Math.max(1, Math.min(dailyDayNow() + 1, reqDay));
    const rows = await sql`SELECT nick, wins, ovr FROM rtm_ult_draft WHERE day=${day} ORDER BY wins DESC, ovr ASC, created_at ASC LIMIT 50`;
    const total = await sql`SELECT count(*)::int AS n FROM rtm_ult_draft WHERE day=${day}`;
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json({
      day,
      total: total[0]?.n ?? 0,
      ladder: rows.map((r, i) => ({ rank: i + 1, nick: String(r.nick ?? 'manager'), wins: Number(r.wins), ovr: Number(r.ovr) })),
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

  // [URG-5] META COMUNITÁRIA — público (landing/hub deslogado): total, alvo e
  // prazo da semana ISO corrente. Com token (POST) devolve também a minha
  // contribuição e o prêmio pendente da semana passada. Só o GET anônimo é
  // cacheado no edge (a resposta com token é por conta).
  if (action === 'communityGoal') {
    const who = req.method === 'POST' && body.token ? verifyToken(String(body.token)) : null;
    const st = await communityGoalStatus(sql as unknown as SqlTag, Date.now(), who);
    if (!who) res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json({ ok: true, ...st });
    return;
  }

  const email = verifyToken(String(body.token ?? ''));
  if (!email) { res.status(401).json({ error: 'Entre na sua conta pra acessar o ranking.' }); return; }

  // só conta paga tem ranking salvo
  const acc = await sql`SELECT paid, nick, streak_current, streak_best, streak_last_day FROM rtm_accounts WHERE email=${email}`;
  if (!acc.length) { res.status(401).json({ error: 'conta não encontrada' }); return; }
  // [URG-5] resgate da meta comunitária: ANTES do gate de conta paga — o Major da
  // Semana aceita conta grátis, então ela também contribui e também resgata.
  // Padrão coinsClaim: o servidor só marca `claimed` (idempotente); o cliente
  // credita os coins e abre o pacote no save.
  if (action === 'communityGoalClaim') {
    const r = await communityGoalClaim(sql as unknown as SqlTag, Date.now(), email, String(body.weekId ?? '').slice(0, 16));
    if (!r.ok) { res.status(r.error === 'unknown_week' ? 404 : 400).json({ error: r.error }); return; }
    res.status(200).json(r);
    return;
  }

  // [URG-4] streak do Diário da conta (o que está no banco, normalizado)
  const dbStreak = (): StreakState => {
    const lastDay = typeof acc[0].streak_last_day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(acc[0].streak_last_day) ? acc[0].streak_last_day : null;
    const current = lastDay ? Math.max(0, Number(acc[0].streak_current) || 0) : 0;
    return { current, best: Math.max(current, Number(acc[0].streak_best) || 0), lastDay };
  };
  const saveStreak = async (st: StreakState) => {
    await sql`UPDATE rtm_accounts SET streak_current=${st.current}, streak_best=${st.best}, streak_last_day=${st.lastDay} WHERE email=${email}`;
  };
  // sincroniza o streak: recebe o local do cliente, funde com o do banco (o
  // MAIOR vence) e devolve. Não exige conta paga — o Diário é grátis.
  if (action === 'dailyStreak') {
    const lastDay = typeof body.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.lastDay) ? body.lastDay : null;
    const today = spDayKey(Date.now());
    // sanidade: dia local no futuro (relógio torto) não conta; streak sem dia não conta
    const local: StreakState = lastDay && lastDay <= today
      ? { current: Math.max(0, Math.min(10_000, Math.round(Number(body.current) || 0))), best: Math.max(0, Math.min(10_000, Math.round(Number(body.best) || 0))), lastDay }
      : { current: 0, best: Math.max(0, Math.min(10_000, Math.round(Number(body.best) || 0))), lastDay: null };
    const merged = mergeStreak(dbStreak(), local);
    await saveStreak(merged);
    res.status(200).json({ ok: true, streak: merged });
    return;
  }
  if (!acc[0].paid) { res.status(403).json({ error: 'unpaid', message: 'O ranking persistente faz parte da conta com save na nuvem.' }); return; }
  // [O1-10] nick SEMPRE o da conta (único, filtrado no signup/setNick); body.nick
  // é ignorado — antes dava pra aparecer no ladder e no aviso de rival como outro.
  // Conta antiga sem nick adota o do body uma vez, com as regras do signup.
  const nick = normalizeNick(acc[0].nick) || (await adoptNickIfMissing(sql, email, body.nick)) || 'manager';

  // report da SÉRIE DO DIA: 1 por conta por dia, o PRIMEIRO vale (ON CONFLICT
  // DO NOTHING). Sanidade: dia = hoje (±1 de fuso) e rating na faixa real do
  // motor (0..2.5). Devolve a posição do jogador no dia.
  if (action === 'dailyReport') {
    const day = Math.round(Number(body.day) || 0);
    const rating = Math.round((Number(body.rating) || 0) * 100) / 100;
    const won = !!body.won;
    const mapA = Math.max(0, Math.min(3, Math.round(Number(body.mapA) || 0)));
    const mapB = Math.max(0, Math.min(3, Math.round(Number(body.mapB) || 0)));
    if (Math.abs(day - dailyDayNow()) > 1) { res.status(400).json({ error: 'dia inválido' }); return; }
    if (!(rating >= 0 && rating <= 2.5)) { res.status(400).json({ error: 'rating inválido' }); return; }
    const ins = await sql`INSERT INTO rtm_daily_series (day, email, nick, rating, won, map_a, map_b)
                          VALUES (${day}, ${email}, ${nick}, ${rating}, ${won}, ${mapA}, ${mapB})
                          ON CONFLICT (day, email) DO NOTHING RETURNING day`;
    const mine = await sql`SELECT rating, won FROM rtm_daily_series WHERE day=${day} AND email=${email}`;
    const better = await sql`SELECT count(*)::int AS n FROM rtm_daily_series WHERE day=${day} AND (rating > ${Number(mine[0]?.rating ?? rating)} OR (rating = ${Number(mine[0]?.rating ?? rating)} AND won AND NOT ${!!(mine[0]?.won ?? won)}))`;
    // [URG-4] jogar a Série do Dia também conta como dia jogado no streak do Diário
    const streak = recordDailyPlay(dbStreak(), spDayKey(Date.now()));
    await saveStreak(streak);
    res.status(200).json({
      ok: true,
      accepted: ins.length > 0,
      duplicate: ins.length === 0,
      rating: Number(mine[0]?.rating ?? rating),
      rank: Number(better[0]?.n ?? 0) + 1,
      streak,
    });
    return;
  }

  // resultado do DRAFT DO DIA — primeiro report do dia vale (PK day+email).
  // wins 0..4 (DRAFT_TARGET) e ovr do squad draftado (desempate, 40..99).
  if (action === 'ultDraftReport') {
    const day = Math.round(Number(body.day) || 0);
    const wins = Math.max(0, Math.min(4, Math.round(Number(body.wins) || 0)));
    const ovr = Math.max(40, Math.min(99, Math.round(Number(body.ovr) || 0)));
    if (Math.abs(day - dailyDayNow()) > 1) { res.status(400).json({ error: 'dia inválido' }); return; }
    const ins = await sql`INSERT INTO rtm_ult_draft (day, email, nick, wins, ovr) VALUES (${day}, ${email}, ${nick}, ${wins}, ${ovr})
                          ON CONFLICT (day, email) DO NOTHING RETURNING day`;
    const mine = await sql`SELECT wins, ovr, created_at FROM rtm_ult_draft WHERE day=${day} AND email=${email}`;
    const mw = Number(mine[0]?.wins ?? wins);
    const mo = Number(mine[0]?.ovr ?? ovr);
    const better = await sql`SELECT count(*)::int AS n FROM rtm_ult_draft WHERE day=${day} AND email<>${email}
                             AND (wins > ${mw} OR (wins = ${mw} AND ovr < ${mo}) OR (wins = ${mw} AND ovr = ${mo} AND created_at < ${String(mine[0]?.created_at ?? new Date().toISOString())}))`;
    res.status(200).json({ ok: true, accepted: ins.length > 0, duplicate: ins.length === 0, wins: mw, rank: Number(better[0]?.n ?? 0) + 1 });
    return;
  }

  // coleta prêmios de PÓDIO do Draft do Dia ainda não coletados (dias FECHADOS
  // da última semana). Pódio final: wins DESC, ovr ASC, chegada — com pelo
  // menos MIN_FIELD jogadores no dia (pódio de 2 pessoas não paga). Idempotente:
  // só o INSERT que gravou a linha paga (PK day+email).
  if (action === 'ultDraftClaim') {
    const PRIZE: Record<number, number> = { 1: 25_000, 2: 15_000, 3: 8_000 };
    const MIN_FIELD = 5;
    const today = dailyDayNow();
    const rows = await sql`
      WITH closed AS (
        SELECT day, email,
               rank() OVER (PARTITION BY day ORDER BY wins DESC, ovr ASC, created_at ASC) AS rk,
               count(*) OVER (PARTITION BY day) AS field
        FROM rtm_ult_draft WHERE day BETWEEN ${today - 7} AND ${today - 1}
      )
      SELECT day, rk::int AS rank FROM closed
      WHERE email=${email} AND rk <= 3 AND field >= ${MIN_FIELD}`;
    const prizes: { day: number; rank: number; coins: number }[] = [];
    for (const r of rows) {
      const day = Number(r.day); const rank = Number(r.rank);
      const coins = PRIZE[rank] ?? 0;
      if (!coins) continue;
      const ins = await sql`INSERT INTO rtm_ult_draft_prizes (day, email, rank, coins) VALUES (${day}, ${email}, ${rank}, ${coins})
                            ON CONFLICT (day, email) DO NOTHING RETURNING day`;
      if (ins.length) prizes.push({ day, rank, coins });
    }
    res.status(200).json({ ok: true, prizes, coins: prizes.reduce((a, p) => a + p.coins, 0) });
    return;
  }

  // [W1] coleta os SELOS do pódio semanal da Série do Dia ainda não coletados
  // (semanas FECHADAS, últimas 4). Pódio: pts DESC, vitórias DESC, primeiro
  // report — com pelo menos WEEK_PRIZE_MIN_FIELD participantes na semana.
  // Idempotente: só o INSERT que gravou a linha devolve o selo (PK week+email);
  // o cliente aplica no save (weeklyTitles) — nunca creditamos nada direto.
  if (action === 'dailyWeekClaim') {
    const curWeek = Math.max(1, Math.floor((dailyDayNow() - 1) / 7) + 1);
    const lastClosed = curWeek - 1;
    if (lastClosed < 1) { res.status(200).json({ ok: true, titles: [] }); return; }
    const firstWeek = Math.max(1, lastClosed - 3);
    const dayA = (firstWeek - 1) * 7 + 1;
    const dayB = lastClosed * 7;
    const rows = await sql`
      WITH wk AS (
        SELECT email, ((day - 1) / 7) + 1 AS week, sum(rating) AS pts,
               sum(CASE WHEN won THEN 1 ELSE 0 END) AS wins, min(created_at) AS first_at
        FROM rtm_daily_series WHERE day BETWEEN ${dayA} AND ${dayB}
        GROUP BY email, ((day - 1) / 7) + 1
      ), ranked AS (
        SELECT week, email,
               rank() OVER (PARTITION BY week ORDER BY pts DESC, wins DESC, first_at ASC) AS rk,
               count(*) OVER (PARTITION BY week) AS field
        FROM wk
      )
      SELECT week, rk::int AS place FROM ranked
      WHERE email=${email} AND rk <= 3 AND field >= ${WEEK_PRIZE_MIN_FIELD}`;
    const titles: { week: number; place: number }[] = [];
    for (const r of rows) {
      const week = Number(r.week); const place = Number(r.place);
      const ins = await sql`INSERT INTO rtm_daily_week_prizes (week, email, place) VALUES (${week}, ${email}, ${place})
                            ON CONFLICT (week, email) DO NOTHING RETURNING week`;
      if (ins.length) titles.push({ week, place });
    }
    res.status(200).json({ ok: true, titles });
    return;
  }

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

  // [U11] contabiliza um duelo decidido (winner ≠ loser) no head-to-head do par, UMA vez por código.
  const bumpRivalry = async (code: string, a: { email: string; nick: string; won: boolean }, b: { email: string; nick: string; won: boolean }) => {
    if (a.won === b.won) return;
    const once = await sql`INSERT INTO rtm_rivalry_matches (code) VALUES (${code}) ON CONFLICT (code) DO NOTHING RETURNING code`;
    if (!once.length) return;
    const { pair, a: ea, b: eb } = rivalryPair(a.email, b.email);
    const winner = (a.won ? a.email : b.email).toLowerCase();
    const nickA = ea === a.email.toLowerCase() ? a.nick : b.nick; const nickB = eb === b.email.toLowerCase() ? b.nick : a.nick;
    await sql`INSERT INTO rtm_rivalries (pair, email_a, email_b, nick_a, nick_b, wins_a, wins_b, games, last_at, last_code)
              VALUES (${pair}, ${ea}, ${eb}, ${nickA}, ${nickB}, ${winner === ea ? 1 : 0}, ${winner === eb ? 1 : 0}, 1, now(), ${code})
              ON CONFLICT (pair) DO UPDATE SET nick_a=EXCLUDED.nick_a, nick_b=EXCLUDED.nick_b, wins_a=rtm_rivalries.wins_a+EXCLUDED.wins_a, wins_b=rtm_rivalries.wins_b+EXCLUDED.wins_b, games=rtm_rivalries.games+1, last_at=now(), last_code=EXCLUDED.last_code`;
  };
  // [U12] evento: status da minha conta e resgate do prêmio (idempotente pelo ledger)
  // [URG-2] item manual vence; sem ele, o evento automático de fim de semana (reconstruído pelo id,
  // mesmo com a janela já fechada — status e resgate acontecem depois de domingo)
  const eventDef = async (id: string) => {
    const rows = await sql`SELECT payload, ends_at FROM rtm_liveops WHERE id = ${id} AND kind = 'event' AND enabled = true LIMIT 1`;
    const p = rows[0]?.payload as Record<string, unknown> | undefined;
    if (!p) {
      const w = weekendEventDef(id); if (!w) return null;
      return { winTiers: w.winTiers, maxMatches: w.maxMatches, version: w.version, endsAt: w.endsAt, exclusiveCardKey: w.exclusiveCardKey, cardAtWins: w.cardAtWins };
    }
    const winTiers = Array.isArray(p.winTiers) ? (p.winTiers as { wins: number; credits: number }[]) : [];
    const topWins = winTiers.reduce((m, t) => Math.max(m, Number(t.wins) || 0), 0);
    return {
      winTiers, maxMatches: Number(p.maxMatches) || 20, version: Number(p.version) || 1, endsAt: new Date(String(rows[0].ends_at)).getTime(),
      exclusiveCardKey: typeof p.exclusiveCardKey === 'string' && p.exclusiveCardKey ? p.exclusiveCardKey : null,
      cardAtWins: Number(p.cardAtWins) > 0 ? Number(p.cardAtWins) : topWins,
    };
  };
  // [URG-2] id da cópia da carta exclusiva — determinístico por evento (igual ao do cliente: 1 por conta, replay não duplica)
  const eventCardId = (id: string) => `ev_${id.replace(/[^a-z0-9]/gi, '')}`;
  if (action === 'eventStatus') {
    const id = String(body.eventId ?? '').slice(0, 64);
    const def = await eventDef(id); if (!def) { res.status(404).json({ error: 'evento' }); return; }
    const me = await sql`SELECT wins, losses, claimed_at FROM rtm_event_entries WHERE event_id=${id} AND email=${email}`;
    const wins = Number(me[0]?.wins ?? 0); const losses = Number(me[0]?.losses ?? 0);
    res.status(200).json({ wins, losses, claimed: !!me[0]?.claimed_at, reward: eventRewardFor(wins, def.winTiers), maxMatches: def.maxMatches, closed: Date.now() > def.endsAt, exclusiveCardKey: def.exclusiveCardKey, cardAtWins: def.cardAtWins });
    return;
  }
  if (action === 'eventClaim') {
    const id = String(body.eventId ?? '').slice(0, 64);
    const def = await eventDef(id); if (!def) { res.status(404).json({ error: 'evento' }); return; }
    const me = await sql`SELECT wins, losses, claimed_at FROM rtm_event_entries WHERE event_id=${id} AND email=${email}`;
    const wins = Number(me[0]?.wins ?? 0); const losses = Number(me[0]?.losses ?? 0);
    const done = Date.now() > def.endsAt || wins + losses >= def.maxMatches;
    if (!done) { res.status(400).json({ error: 'em andamento' }); return; }
    const credits = eventRewardFor(wins, def.winTiers);
    // [URG-2] carta exclusiva: só quem bateu `cardAtWins`; vai na MESMA tx do ledger (opId único por
    // evento+versão ⇒ 1 cópia por conta; replay do claim não concede de novo). meta.ev vira o selo no cliente.
    const cardKey = def.exclusiveCardKey && wins >= def.cardAtWins ? def.exclusiveCardKey : null;
    const cards = cardKey ? [{ op: 'add' as const, cardId: eventCardId(id), cardKey, meta: { via: 'reward', ev: id } }] : [];
    // pay-first no ledger (opId único por evento+versão) e só então claimed_at — padrão Major da Semana
    const tx = await applyUltTransaction(sql as unknown as SqlTag, email, { opId: `ev:${id}:${def.version}`, kind: 'reward', creditsDelta: credits, cards, meta: { src: 'event', eventId: id, wins, ...(cardKey ? { cardKey } : {}) } });
    await sql`INSERT INTO rtm_event_entries (event_id, email, wins, losses, version, claimed_at) VALUES (${id}, ${email}, ${wins}, ${losses}, ${def.version}, now()) ON CONFLICT (event_id, email) DO UPDATE SET claimed_at = COALESCE(rtm_event_entries.claimed_at, now())`;
    res.status(200).json({ ok: true, credits, replayed: !!(tx as { replayed?: boolean }).replayed, exclusiveCardKey: cardKey, cardId: cardKey ? eventCardId(id) : null });
    return;
  }
  // [U11] meus rivais (por conta), mais recentes primeiro
  if (action === 'rivals') {
    const rows = await sql`SELECT * FROM rtm_rivalries WHERE email_a=${email.toLowerCase()} OR email_b=${email.toLowerCase()} ORDER BY last_at DESC NULLS LAST LIMIT 20`;
    res.status(200).json({ rivals: rows.map((r) => rivalryFor({ pair: String(r.pair), email_a: String(r.email_a), email_b: String(r.email_b), nick_a: String(r.nick_a ?? ''), nick_b: String(r.nick_b ?? ''), wins_a: Number(r.wins_a) || 0, wins_b: Number(r.wins_b) || 0, games: Number(r.games) || 0, last_at: r.last_at ? new Date(String(r.last_at)).getTime() : 0, last_code: String(r.last_code ?? '') }, email)) });
    return;
  }
  // [U11] report de DUELO PRIVADO: não mexe em RP; só alimenta o head-to-head. 1 por conta por partida.
  if (action === 'duelReport') {
    const code = String(body.code ?? '').trim().slice(0, 12);
    const won = !!body.won;
    const lobbyNick = String((body.lobbyNick as string) || nick).slice(0, 60);
    if (!code) { res.status(400).json({ error: 'código' }); return; }
    const lb = await sql`SELECT ranked, mode FROM lobbies WHERE code=${code}`;
    if (!lb.length) { res.status(404).json({ error: 'partida não encontrada' }); return; }
    if (String(lb[0].mode) !== 'ultimate') { res.status(400).json({ error: 'modo' }); return; }
    const inLobby = await sql`SELECT 1 FROM lobby_players WHERE code=${code} AND lower(nick)=lower(${lobbyNick}) AND COALESCE(spectator, false) = false`;
    if (!inLobby.length) { res.status(403).json({ error: 'você não jogou essa partida' }); return; }
    const dueIns = await sql`INSERT INTO rtm_duel_reports (code, email, nick, won) VALUES (${code}, ${email}, ${lobbyNick}, ${won}) ON CONFLICT (code, email) DO NOTHING RETURNING code`;
    if (dueIns.length) await bumpCommunityContrib(sql as unknown as SqlTag, Date.now(), email); // [URG-5] 1 por jogador por duelo
    const other = await sql`SELECT email, nick, won FROM rtm_duel_reports WHERE code=${code} AND email<>${email} LIMIT 1`;
    if (other.length) await bumpRivalry(code, { email, nick: lobbyNick, won }, { email: String(other[0].email), nick: String(other[0].nick ?? ''), won: !!other[0].won });
    res.status(200).json({ ok: true, paired: other.length > 0 });
    return;
  }
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

  // carência: reports meus pendentes há GRACE_MS sem contraparte entram solo
  // (oponente fechou a aba antes de reportar). Roda no 'me' e no 'report'.
  // A janela deriva de GRACE_MS (api/_reportPairing.ts) pra nunca divergir da lógica pura.
  const sweepSoloGrace = async () => {
    const stale = await sql`
      SELECT code, won FROM rtm_match_reports r
      WHERE email=${email} AND status='pending' AND reported_at < now() - make_interval(secs => ${GRACE_MS / 1000})
        AND NOT EXISTS (SELECT 1 FROM rtm_match_reports o WHERE o.code=r.code AND o.email<>${email})`;
    for (const s of stale) {
      // marca ANTES de aplicar (idempotência entre requests concorrentes: só
      // quem transicionar pending→applied-solo credita a partida).
      const claim = await sql`UPDATE rtm_match_reports SET status='applied-solo' WHERE code=${String(s.code)} AND email=${email} AND status='pending' RETURNING code`;
      if (claim.length) await applyRanked(email, !!s.won);
    }
  };

  // [URG-3] quem me passou no ladder desde `since` (ms; o cliente guarda a última
  // visita ao Hub em localStorage). Só consulta quando o cliente pede.
  const overtakenSince = async (since: number) => {
    if (!(since > 0)) return undefined;
    const rows = await sql`SELECT by_nick, new_pos, created_at FROM rtm_overtakes WHERE victim_email=${email} AND created_at > ${new Date(since).toISOString()} ORDER BY created_at DESC LIMIT 5`;
    return rows.map((r) => ({ nick: String(r.by_nick ?? 'rival'), pos: Number(r.new_pos), at: new Date(String(r.created_at)).getTime() }));
  };

  if (action === 'me') {
    await ensureRow();
    await sweepSoloGrace();
    const overtakenBy = await overtakenSince(Number(body.since) || 0); // [URG-3]
    const row = await myRow();
    res.status(200).json(row ? { ...row, streak: dbStreak(), ...(overtakenBy ? { overtakenBy } : {}) } : row); // [URG-4] streak do Diário junto
    return;
  }

  // [URG-3] AVISO DE RIVAL: depois de aplicar RP, descobre quem `em` ultrapassou
  // (rivais declarados + vizinho imediato, top 100), grava em rtm_overtakes (bloco
  // no Hub) e manda no máximo 1 e-mail por vítima a cada 24h (opt-out em Conta).
  // Custo: 1 SELECT do top 100 + 1 SELECT de rivalidades por report com subida.
  // Nunca falha o report: tudo em try/catch, envios com Promise.allSettled.
  const notifyOvertakes = async (em: string, r: { before: number; after: number }) => {
    if (!(r.after > r.before)) return;
    try {
      const ladder = await sql`SELECT email, nick, mmr FROM rtm_ranking WHERE season=${season.no} ORDER BY mmr DESC, wins DESC LIMIT ${OVERTAKE_TOP}`;
      const rivalRows = await sql`SELECT email_a, email_b FROM rtm_rivalries WHERE email_a=${em.toLowerCase()} OR email_b=${em.toLowerCase()}`;
      const rivals = rivalRows.map((x) => (String(x.email_a) === em.toLowerCase() ? String(x.email_b) : String(x.email_a)));
      const victims = detectOvertakes({ email: em, before: r.before, after: r.after }, ladder.map((x) => ({ email: String(x.email), nick: String(x.nick ?? 'manager'), mmr: Number(x.mmr) })), rivals);
      if (!victims.length) return;
      const byNick = String(ladder.find((x) => String(x.email).toLowerCase() === em.toLowerCase())?.nick ?? 'manager');
      for (const v of victims) {
        await sql`INSERT INTO rtm_overtakes (victim_email, by_email, by_nick, old_pos, new_pos) VALUES (${v.email}, ${em}, ${byNick}, ${v.oldPos}, ${v.newPos})`;
      }
      // retenção (30 dias): DELETE separado e amostrado — nunca no caminho do INSERT.
      if (Math.random() < 0.02) await sql`DELETE FROM rtm_overtakes WHERE created_at < now() - interval '30 days'`;
    } catch { /* aviso é best-effort: o report já foi aplicado */ }
  };

  if (action === 'report') {
    const won = !!body.won;
    const code = String(body.code ?? '').trim().slice(0, 12);
    await ensureRow();
    await sweepSoloGrace();
    // report ranqueado agora é POR PARTIDA: precisa do código do lobby. Sem
    // código = cliente antigo → não pontua (resposta 200 pra não poluir o
    // console; o cliente ignora o corpo).
    if (!code) { res.status(200).json({ applied: false, legacy: true, delta: 0, me: await myRow(), ...seasonInfo }); return; }
    // partida precisa existir, ser RANQUEADA (modo 1v1, ver abaixo) e o
    // reporter precisa ter jogado nela (participante não-espectador). O nick
    // DENTRO do lobby pode diferir do nick do ladder (o Ultimate joga com
    // sufixo anti-colisão, ex. 'Manager#AB12') — vem em body.lobbyNick; o
    // match é case-insensitive (o resto do fluxo online compara em lower).
    const lobbyNick = String((body.lobbyNick as string) || nick).slice(0, 60);
    const lb = await sql`SELECT ranked, mode, created_at FROM lobbies WHERE code=${code}`;
    if (!lb.length) { res.status(404).json({ error: 'partida não encontrada' }); return; }
    if (!lb[0].ranked) { res.status(400).json({ error: 'partida não é ranqueada' }); return; }
    // [O0-45] só modos 1v1 com pareamento zero-soma pontuam. O ramo que aplicava
    // o `won` declarado direto (Major em grupo 'party', sem contraparte) era o
    // farm de +150 MMR/min (ONLI-03/SEGU-03) e saiu junto com o modo.
    if (!RANKED_REPORT_MODES.includes(String(lb[0].mode))) { res.status(400).json({ error: 'modo não ranqueado' }); return; }
    const inLobby = await sql`SELECT 1 FROM lobby_players WHERE code=${code} AND lower(nick)=lower(${lobbyNick}) AND COALESCE(spectator, false) = false`;
    if (!inLobby.length) { res.status(403).json({ error: 'você não jogou essa partida' }); return; }
    // 1 report por jogador por partida (PK code+email) — refresh não duplica.
    const ins = await sql`INSERT INTO rtm_match_reports (code, email, nick, won) VALUES (${code}, ${email}, ${nick}, ${won}) ON CONFLICT (code, email) DO NOTHING RETURNING code`;
    if (!ins.length) { res.status(200).json({ applied: false, duplicate: true, delta: 0, me: await myRow(), ...seasonInfo }); return; }
    // [URG-5] meta comunitária: todo report ranqueado ACEITO (inclui salas de
    // evento) conta 1 partida pra semana e pra conta. Nunca falha o report.
    await bumpCommunityContrib(sql as unknown as SqlTag, Date.now(), email);

    // pareamento zero-soma: o MMR só entra quando os dois lados batem (ou pela carência).
    const other = await sql`SELECT email, nick, won, status FROM rtm_match_reports WHERE code=${code} AND email<>${email} LIMIT 1`;
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
    // consistente: CLAIM atômico antes de creditar — dois reports quase
    // simultâneos decidem 'apply-both' os dois, mas só a invocação que
    // transicionar pending→applied (RETURNING) aplica MMR; a outra vê zero
    // linhas e não credita em dobro (mesmo padrão do sweepSoloGrace).
    const claimed = outcome === 'apply-both'
      ? await sql`UPDATE rtm_match_reports SET status='applied' WHERE code=${code} AND status='pending' RETURNING email, won`
      : await sql`UPDATE rtm_match_reports SET status='applied' WHERE code=${code} AND email=${email} AND status='pending' RETURNING email, won`;
    let mine: Awaited<ReturnType<typeof applyRanked>> = null;
    const risen: { email: string; r: NonNullable<Awaited<ReturnType<typeof applyRanked>>> }[] = [];
    for (const row of claimed) {
      const applied = await applyRanked(String(row.email), !!row.won);
      if (String(row.email) === email) mine = applied;
      if (applied && applied.after > applied.before) risen.push({ email: String(row.email), r: applied });
    }
    // [URG-3] quem subiu nesta invocação (o vencedor — pode ser o oponente, no 'apply-both') avisa quem passou
    for (const x of risen) await notifyOvertakes(x.email, x.r);
    // [U11] head-to-head por conta: os dois reports desta partida (idempotente por código)
    if (mine && other.length) await bumpRivalry(code, { email, nick: lobbyNick, won }, { email: String(other[0].email), nick: String(other[0].nick ?? ''), won: !!other[0].won });
    // [U12] sala de EVENTO: conta vitória/derrota de cada lado aplicado (cap maxMatches); 1x por (code,email) via status 'applied'
    const evLobby = await sql`SELECT event_id FROM lobbies WHERE code=${code}`;
    const evId = evLobby[0]?.event_id ? String(evLobby[0].event_id) : '';
    if (evId) {
      const def = await eventDef(evId);
      if (def) for (const row of claimed) {
        const w = row.won ? 1 : 0; const l = w ? 0 : 1;
        await sql`INSERT INTO rtm_event_entries (event_id, email, wins, losses, version) VALUES (${evId}, ${String(row.email)}, ${w}, ${l}, ${def.version})
                  ON CONFLICT (event_id, email) DO UPDATE SET wins = rtm_event_entries.wins + ${w}, losses = rtm_event_entries.losses + ${l}, updated_at = now() WHERE rtm_event_entries.wins + rtm_event_entries.losses < ${def.maxMatches}`;
      }
    }
    if (!mine) { res.status(200).json({ applied: claimed.length === 0, raced: claimed.length === 0, delta: 0, me: await myRow(), ...seasonInfo }); return; }
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
