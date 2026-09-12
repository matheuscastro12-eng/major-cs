// [U11] RIVALIDADE POR CONTA — agregação pura (testável sem banco).
// A chave do par é a ordem lexicográfica dos e-mails (identidade = conta, não
// apelido). Nicks são só o "último visto" de cada lado, para exibição.
export interface RivalryRow {
  pair: string; email_a: string; email_b: string; nick_a: string; nick_b: string;
  wins_a: number; wins_b: number; games: number; last_at: number; last_code: string;
}
export function rivalryPair(a: string, b: string): { pair: string; a: string; b: string } {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
  return { pair: `${x}|${y}`, a: x, b: y };
}
export interface RivalryEvent { emailA: string; emailB: string; nickA: string; nickB: string; winner: string; now: number; code: string }
/** Aplica UM duelo decidido ao registro (ou cria). Idempotência por `code` fica no
 *  chamador (tabela de códigos já contabilizados); aqui só a aritmética. */
export function applyRivalry(row: RivalryRow | null, ev: RivalryEvent): RivalryRow {
  const { pair, a, b } = rivalryPair(ev.emailA, ev.emailB);
  const nickFor = (email: string) => (email === ev.emailA.toLowerCase() ? ev.nickA : ev.nickB);
  const base: RivalryRow = row ?? { pair, email_a: a, email_b: b, nick_a: nickFor(a), nick_b: nickFor(b), wins_a: 0, wins_b: 0, games: 0, last_at: 0, last_code: '' };
  const w = ev.winner.toLowerCase();
  return {
    ...base, nick_a: nickFor(a), nick_b: nickFor(b),
    wins_a: base.wins_a + (w === a ? 1 : 0), wins_b: base.wins_b + (w === b ? 1 : 0),
    games: base.games + 1, last_at: ev.now, last_code: ev.code,
  };
}
/** Visão do par do ponto de vista de `me`. */
export function rivalryFor(row: RivalryRow, me: string): { oppNick: string; wins: number; losses: number; games: number; lastAt: number } {
  const m = me.toLowerCase();
  const iAmA = row.email_a === m;
  return { oppNick: iAmA ? row.nick_b : row.nick_a, wins: iAmA ? row.wins_a : row.wins_b, losses: iAmA ? row.wins_b : row.wins_a, games: row.games, lastAt: row.last_at };
}
