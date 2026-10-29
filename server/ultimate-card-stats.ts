// [CSM-3] História da carta: estatísticas por CÓPIA (card_id), gravadas pelo
// SERVIDOR ao fechar o duelo PvP ranqueado (server/ult-match.ts, settleIfNeeded)
// para as cartas autoritativas dos dois lados.
//
// Só existe coluna para o que o motor produz (ver cardStatsDelta em
// ult-match.ts): jogos, vitórias, derrotas, rounds e clutches (beat 'clutch').
// Kills e MVP NÃO são gravados: o duelo por beats não tem kill feed nem MVP por
// jogador — o CS Manager criou 8 colunas que nunca foram preenchidas; aqui não.
//
// Idempotência: (code, email) em rtm_ult_card_stats_applied; o insert dessa
// marca e o upsert das estatísticas estão no MESMO statement (CTE), então um
// segundo fechamento da mesma partida não soma de novo. Só soma em cópias que a
// conta AINDA possui (join com rtm_ult_cards): vendeu antes de fechar, perde.
import type { SqlQuery, SqlTag } from './ultimate-economy.js';
import type { CardStatsDelta } from './ult-match.js';

export const CARD_STATS_MAX_READ = 60;

export interface CardStatsRow {
  cardId: string;
  games: number; wins: number; losses: number;
  roundsWon: number; roundsLost: number;
  clutchesWon: number; clutchesPlayed: number;
  lastPlayedAt: string | null;
}

export function ultCardStatsSchemaQueries(sql: SqlTag): SqlQuery[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_ult_card_stats (
      email TEXT NOT NULL,
      card_id TEXT NOT NULL,
      games INT NOT NULL DEFAULT 0,
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      rounds_won INT NOT NULL DEFAULT 0,
      rounds_lost INT NOT NULL DEFAULT 0,
      clutches_won INT NOT NULL DEFAULT 0,
      clutches_played INT NOT NULL DEFAULT 0,
      last_played_at TIMESTAMPTZ,
      PRIMARY KEY (email, card_id)
    )`,
    sql`CREATE TABLE IF NOT EXISTS rtm_ult_card_stats_applied (
      code TEXT NOT NULL,
      email TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (code, email)
    )`,
  ];
}

let schemaReady = false;

export async function recordCardStats(sql: SqlTag, email: string, code: string, cardIds: string[], d: CardStatsDelta): Promise<boolean> {
  const ids = [...new Set(cardIds.filter((x) => typeof x === 'string' && x && x.length <= 80))].slice(0, 5);
  if (!ids.length) return false;
  if (!schemaReady) { for (const q of ultCardStatsSchemaQueries(sql)) await q; schemaReady = true; }
  const idsJson = JSON.stringify(ids);
  const rows = await sql`WITH mark AS (
      INSERT INTO rtm_ult_card_stats_applied (code, email) VALUES (${code}, ${email})
      ON CONFLICT (code, email) DO NOTHING RETURNING code
    ), owned AS (
      SELECT card_id FROM rtm_ult_cards
      WHERE email=${email} AND card_id IN (SELECT jsonb_array_elements_text(${idsJson}::jsonb))
    ), up AS (
      INSERT INTO rtm_ult_card_stats AS s (email, card_id, games, wins, losses, rounds_won, rounds_lost, clutches_won, clutches_played, last_played_at)
      SELECT ${email}, owned.card_id, ${d.games}, ${d.wins}, ${d.losses}, ${d.roundsWon}, ${d.roundsLost}, ${d.clutchesWon}, ${d.clutchesPlayed}, now()
      FROM owned WHERE EXISTS (SELECT 1 FROM mark)
      ON CONFLICT (email, card_id) DO UPDATE SET
        games = s.games + EXCLUDED.games, wins = s.wins + EXCLUDED.wins, losses = s.losses + EXCLUDED.losses,
        rounds_won = s.rounds_won + EXCLUDED.rounds_won, rounds_lost = s.rounds_lost + EXCLUDED.rounds_lost,
        clutches_won = s.clutches_won + EXCLUDED.clutches_won, clutches_played = s.clutches_played + EXCLUDED.clutches_played,
        last_played_at = now()
      RETURNING card_id
    )
    SELECT (SELECT count(*) FROM mark) AS marked, (SELECT count(*) FROM up) AS updated`;
  return Number(rows[0]?.marked ?? 0) > 0;
}

/** Leitura da história das cópias pedidas (só da própria conta). */
export async function readCardStats(sql: SqlTag, email: string, rawIds: unknown): Promise<CardStatsRow[]> {
  if (!Array.isArray(rawIds)) return [];
  const ids = [...new Set(rawIds.filter((x): x is string => typeof x === 'string' && !!x && x.length <= 80))].slice(0, CARD_STATS_MAX_READ);
  if (!ids.length) return [];
  if (!schemaReady) { for (const q of ultCardStatsSchemaQueries(sql)) await q; schemaReady = true; }
  const rows = await sql`SELECT card_id, games, wins, losses, rounds_won, rounds_lost, clutches_won, clutches_played, last_played_at
    FROM rtm_ult_card_stats WHERE email=${email} AND card_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`;
  return rows.map((r) => ({
    cardId: String(r.card_id), games: Number(r.games), wins: Number(r.wins), losses: Number(r.losses),
    roundsWon: Number(r.rounds_won), roundsLost: Number(r.rounds_lost),
    clutchesWon: Number(r.clutches_won), clutchesPlayed: Number(r.clutches_played),
    lastPlayedAt: r.last_played_at == null ? null : String(r.last_played_at),
  }));
}

/** Soma de várias cópias da mesma carta (o detalhe da coleção agrupa cópias). */
export function sumCardStats(rows: readonly CardStatsRow[]): Omit<CardStatsRow, 'cardId'> {
  const z = { games: 0, wins: 0, losses: 0, roundsWon: 0, roundsLost: 0, clutchesWon: 0, clutchesPlayed: 0, lastPlayedAt: null as string | null };
  for (const r of rows) {
    z.games += r.games; z.wins += r.wins; z.losses += r.losses; z.roundsWon += r.roundsWon; z.roundsLost += r.roundsLost;
    z.clutchesWon += r.clutchesWon; z.clutchesPlayed += r.clutchesPlayed;
    if (r.lastPlayedAt && (!z.lastPlayedAt || r.lastPlayedAt > z.lastPlayedAt)) z.lastPlayedAt = r.lastPlayedAt;
  }
  return z;
}
