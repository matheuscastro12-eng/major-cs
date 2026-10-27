// MAJOR COM AMIGOS — liga privada do Pick'em do PGL Major Singapore 2026.
// Lógica PURA do lado do servidor (a rota é api/major-league.ts).
//
// Uma liga é um código de 6 letras + um seed. Todo mundo da liga faz o pick'em
// do MESMO Major: o resultado é simulateMajor(lista, seed), calculado no
// cliente (o engine é determinístico). O servidor só guarda quem está na liga e
// o palpite de cada um (o código do link, já usado no compartilhamento). Assim
// ninguém altera a pontuação: o palpite é do servidor e o resultado sai do seed.
//
// Membro: conta logada (token, chave 'acc:<email>') ou só nick + um id
// aleatório guardado no navegador (chave 'anon:<id>'). O palpite dos outros só
// aparece depois que o dono REVELA o resultado; aí a liga trava.
//
// DDL idempotente (CREATE ... IF NOT EXISTS), como as outras rotas.

export type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export const LEAGUE_CODE_LEN = 6;
export const LEAGUE_MAX_MEMBERS = 50;
export const LEAGUE_NAME_MAX = 40;
// sem 0/O/1/I/L: código lido em voz alta ou digitado no celular
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = new RegExp(`^[${CODE_ALPHA}]{${LEAGUE_CODE_LEN}}$`);
// mesmo formato do link do pick'em (engine/majorSingapore.ts encodePicks)
const PICKS_RE = /^[0-9a-z]{4}\.[0-9a-v_]{31}(?:\.[0-9a-v_]{12})?$/;
const MEMBER_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function schemaQueries(sql: SqlTag): Promise<Record<string, unknown>[]>[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_major_leagues (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      seed BIGINT NOT NULL,
      owner_key TEXT NOT NULL,
      revealed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS rtm_major_league_entries (
      code TEXT NOT NULL,
      member_key TEXT NOT NULL,
      nick TEXT NOT NULL,
      picks TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (code, member_key)
    )`,
  ];
}

// ------------------------------------------------------------ validação pura

export function normalizeCode(raw: unknown): string | null {
  const c = String(raw ?? '').trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

/** código a partir de bytes aleatórios (a rota passa crypto.randomBytes) */
export function codeFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < LEAGUE_CODE_LEN; i++) out += CODE_ALPHA[bytes[i % bytes.length] % CODE_ALPHA.length];
  return out;
}

/** seed do Major da liga: 31 bits a partir dos bytes */
export function seedFromBytes(bytes: Uint8Array): number {
  return ((bytes[0] << 23) | (bytes[1] << 15) | (bytes[2] << 7) | (bytes[3] >> 1)) >>> 0;
}

export function validPicks(raw: unknown): string | null {
  const p = String(raw ?? '').trim().toLowerCase();
  if (p === '') return '';
  return PICKS_RE.test(p) ? p : null;
}

export function leagueName(raw: unknown): string {
  return String(raw ?? '')
    .slice(0, 200)
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LEAGUE_NAME_MAX);
}

/** chave do membro: conta (e-mail do token) vence o id anônimo */
export function memberKeyOf(email: string | null, memberId: unknown): string | null {
  if (email) return `acc:${email.toLowerCase()}`;
  const id = String(memberId ?? '');
  return MEMBER_ID_RE.test(id) ? `anon:${id}` : null;
}

// ------------------------------------------------------------ banco

export interface LeagueRow { code: string; name: string; seed: number; revealed: boolean; isOwner: boolean }
export interface EntryRow { nick: string; picks: string; complete: boolean; me: boolean }

export async function createLeague(
  sql: SqlTag, code: string, name: string, seed: number, ownerKey: string, nick: string,
): Promise<boolean> {
  const rows = await sql`INSERT INTO rtm_major_leagues (code, name, seed, owner_key) VALUES (${code}, ${name}, ${seed}, ${ownerKey})
    ON CONFLICT (code) DO NOTHING RETURNING code`;
  if (!rows.length) return false; // colisão de código: a rota tenta outro
  await sql`INSERT INTO rtm_major_league_entries (code, member_key, nick) VALUES (${code}, ${ownerKey}, ${nick})
    ON CONFLICT (code, member_key) DO NOTHING`;
  return true;
}

async function leagueRaw(sql: SqlTag, code: string) {
  const r = await sql`SELECT code, name, seed, owner_key, revealed FROM rtm_major_leagues WHERE code=${code}`;
  return r[0] as { code: string; name: string; seed: number | string; owner_key: string; revealed: boolean } | undefined;
}

export type JoinResult = { ok: true } | { ok: false; error: 'not_found' | 'full' | 'locked' | 'nick_taken' };

/** entra na liga (ou atualiza nick/palpite de quem já está) */
export async function joinLeague(sql: SqlTag, code: string, memberKey: string, nick: string, picks: string | undefined): Promise<JoinResult> {
  const lg = await leagueRaw(sql, code);
  if (!lg) return { ok: false, error: 'not_found' };
  const members = await sql`SELECT member_key, nick FROM rtm_major_league_entries WHERE code=${code}`;
  const already = members.some((m) => m.member_key === memberKey);
  if (!already && members.length >= LEAGUE_MAX_MEMBERS) return { ok: false, error: 'full' };
  if (members.some((m) => m.member_key !== memberKey && String(m.nick).toLowerCase() === nick.toLowerCase())) return { ok: false, error: 'nick_taken' };
  if (lg.revealed && (picks !== undefined || !already)) return { ok: false, error: 'locked' };
  if (picks === undefined) {
    await sql`INSERT INTO rtm_major_league_entries (code, member_key, nick) VALUES (${code}, ${memberKey}, ${nick})
      ON CONFLICT (code, member_key) DO UPDATE SET nick=EXCLUDED.nick`;
  } else {
    await sql`INSERT INTO rtm_major_league_entries (code, member_key, nick, picks) VALUES (${code}, ${memberKey}, ${nick}, ${picks})
      ON CONFLICT (code, member_key) DO UPDATE SET nick=EXCLUDED.nick, picks=EXCLUDED.picks, updated_at=now()`;
  }
  return { ok: true };
}

/** palpite completo = sem '_' no trecho principal (8+8+8+7) */
export function picksComplete(picks: string): boolean {
  const body = picks.split('.')[1] ?? '';
  return body.length === 31 && !body.includes('_');
}

/**
 * A liga vista por um membro. Antes de revelar, o palpite dos outros fica
 * escondido (só o seu volta): ninguém copia o palpite do amigo.
 */
export async function getLeague(sql: SqlTag, code: string, memberKey: string | null): Promise<{ league: LeagueRow; entries: EntryRow[] } | null> {
  const lg = await leagueRaw(sql, code);
  if (!lg) return null;
  const rows = await sql`SELECT member_key, nick, picks FROM rtm_major_league_entries WHERE code=${code} ORDER BY updated_at ASC LIMIT ${LEAGUE_MAX_MEMBERS}`;
  const entries: EntryRow[] = rows.map((r) => {
    const me = !!memberKey && r.member_key === memberKey;
    const picks = String(r.picks ?? '');
    return { nick: String(r.nick), picks: lg.revealed || me ? picks : '', complete: picksComplete(picks), me };
  });
  return {
    league: { code: lg.code, name: lg.name, seed: Number(lg.seed), revealed: !!lg.revealed, isOwner: !!memberKey && memberKey === lg.owner_key },
    entries,
  };
}

export type RevealResult = { ok: true } | { ok: false; error: 'not_found' | 'not_owner' };

export async function revealLeague(sql: SqlTag, code: string, memberKey: string): Promise<RevealResult> {
  const lg = await leagueRaw(sql, code);
  if (!lg) return { ok: false, error: 'not_found' };
  if (lg.owner_key !== memberKey) return { ok: false, error: 'not_owner' };
  await sql`UPDATE rtm_major_leagues SET revealed=true WHERE code=${code}`;
  return { ok: true };
}
