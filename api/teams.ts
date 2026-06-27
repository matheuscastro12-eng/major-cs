// Função serverless (Vercel) que serve e grava o dataset no banco Neon.
// GET  -> lista pública de times (fonte primária do app).
// POST -> admin autenticado salva a base inteira (vale pra todos os usuários
//         e para qualquer build/campanha nova). Protegido por ADMIN_PASSWORD.
import { neon } from '@neondatabase/serverless';

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

// validação mínima de um time vindo do cliente antes de gravar
interface IncomingPlayer {
  id: string;
  nick: string;
  name: string;
  country: string;
  role: string;
  aim: number;
  clutch: number;
  consistency: number;
  awp: number;
  igl: number;
}
interface IncomingTeam {
  id: string;
  team: string;
  tag: string;
  era: string;
  game: string;
  country: string;
  teamwork: number;
  honors: string;
  colors: [string, string];
  mapPrefs: Record<string, number>;
  coach: { nick: string; name: string; country: string; rating: number; style: string };
  players: IncomingPlayer[];
}

function validTeams(input: unknown): input is IncomingTeam[] {
  if (!Array.isArray(input) || input.length < 16 || input.length > 400) return false;
  const ids = new Set<string>();
  for (const t of input) {
    if (!t || typeof t !== 'object') return false;
    const tt = t as Record<string, unknown>;
    if (typeof tt.id !== 'string' || !tt.id || ids.has(tt.id as string)) return false;
    ids.add(tt.id as string);
    if (typeof tt.team !== 'string' || typeof tt.tag !== 'string') return false;
    if (!tt.coach || typeof tt.coach !== 'object') return false;
    if (!Array.isArray(tt.players) || tt.players.length < 5 || tt.players.length > 7) return false;
    for (const p of tt.players as unknown[]) {
      const pp = p as Record<string, unknown>;
      if (!pp || typeof pp.id !== 'string' || typeof pp.nick !== 'string') return false;
    }
  }
  return true;
}

const num = (v: unknown, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: Res,
) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'DATABASE_URL not configured' });
    return;
  }
  const sql = neon(url);

  // ---- leitura pública ----
  if (req.method === 'GET' || !req.method) {
    // cache de edge: o dataset muda raro (só no "Salvar no banco" do admin), e o
    // app já traz a base embutida no build. TTL maior + SWR de 1 dia cortam a
    // banda de origem por visita; edições do admin propagam em ~10min (s-maxage).
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Expose-Headers', 'X-Dataset-Rev');
    try {
      // rev do build com que esta base foi salva (vazio se nunca foi gravado).
      // O cliente compara com o rev do seu build pra saber se o banco está atrás.
      let rev = '';
      try {
        const meta = (await sql`SELECT value FROM meta WHERE key = 'dataset_rev'`) as { value: string }[];
        rev = meta[0]?.value ?? '';
      } catch {
        /* tabela meta ainda não existe: rev vazio = banco mais antigo que o build */
      }
      res.setHeader('X-Dataset-Rev', rev);
      const rows = (await sql`SELECT data FROM teams ORDER BY id`) as { data: unknown }[];
      res.status(200).json(rows.map((r) => r.data));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  // ---- gravação pelo admin ----
  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    const expected = clean(process.env.ADMIN_PASSWORD);
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      password?: string;
      teams?: unknown;
      deleteIds?: unknown;
      rev?: unknown;
    };
    if (!expected || (body?.password ?? '').toString().trim() !== expected) {
      res.status(401).json({ ok: false, error: 'senha inválida' });
      return;
    }
    if (!validTeams(body?.teams)) {
      res.status(400).json({ ok: false, error: 'base inválida (mín. 16 times, 5+ jogadores cada)' });
      return;
    }
    const teams = body.teams;
    const deleteIds = (Array.isArray(body.deleteIds) ? body.deleteIds : [])
      .filter((x): x is string => typeof x === 'string' && x.length > 0)
      .slice(0, 400);
    try {
      // MERGE, nunca full-replace: faz upsert dos times enviados e só apaga os
      // explicitamente deletados no CRM. Um cliente com base desatualizada não
      // consegue mais apagar times que ele nem conhece (causa do sumiço da LG).
      const queries = [] as ReturnType<typeof sql>[];
      if (deleteIds.length) queries.push(sql`DELETE FROM teams WHERE id = ANY(${deleteIds})`);
      for (const t of teams) {
        queries.push(sql`DELETE FROM teams WHERE id = ${t.id}`); // upsert: limpa só este id (cascade)
        queries.push(
          sql`INSERT INTO teams (id, team, tag, era, game, country, teamwork, honors, data)
              VALUES (${t.id}, ${t.team}, ${t.tag}, ${t.era}, ${t.game}, ${t.country},
                      ${num(t.teamwork, 80)}, ${String(t.honors ?? '')}, ${JSON.stringify(t)})`,
        );
        queries.push(
          sql`INSERT INTO coaches (team_id, nick, name, country, rating, style)
              VALUES (${t.id}, ${t.coach.nick}, ${t.coach.name}, ${t.coach.country},
                      ${num(t.coach.rating, 78)}, ${t.coach.style})`,
        );
        let ord = 0;
        for (const p of t.players) {
          queries.push(
            sql`INSERT INTO players (id, team_id, ord, nick, name, country, role, aim, clutch, consistency, awp, igl)
                VALUES (${p.id}, ${t.id}, ${ord++}, ${p.nick}, ${p.name}, ${p.country}, ${p.role},
                        ${num(p.aim)}, ${num(p.clutch)}, ${num(p.consistency)}, ${num(p.awp)}, ${num(p.igl)})`,
          );
        }
      }
      await sql.transaction(queries);
      // carimba o rev do build em que o admin salvou: clientes nesse mesmo build
      // adotam o banco; builds mais novos (deploy de att) vencem o banco.
      const rev = String(body.rev ?? '').slice(0, 64);
      try {
        await sql`CREATE TABLE IF NOT EXISTS meta (key text PRIMARY KEY, value text)`;
        await sql`INSERT INTO meta (key, value) VALUES ('dataset_rev', ${rev})
                  ON CONFLICT (key) DO UPDATE SET value = ${rev}`;
      } catch {
        /* não bloqueia o save se o meta falhar */
      }
      res.status(200).json({ ok: true, teams: teams.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
