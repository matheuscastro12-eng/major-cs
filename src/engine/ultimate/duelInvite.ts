// [U11] CONVITE DE DUELO por link — puro. Formato: `?duelo=<CODE>` (5 letras do
// alfabeto do lobby, sem 0/O/1/I/L). Precedente: o `?desafio=` da Série do Dia.
// O link NÃO carrega identidade nem conta; só o código da sala. Sala expirada
// (GC do lobby) → o convidado vê a explicação e o caminho ("peça um código novo").
export const DUEL_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/;
export const DUEL_SITE = 'https://roadtomajor.com.br';

export function parseDuelInvite(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.trim().toUpperCase();
  return DUEL_CODE_RE.test(c) ? c : null;
}
export function duelInviteUrl(code: string, site = DUEL_SITE): string {
  return `${site}/ultimate?duelo=${code}`;
}
export function duelInviteText(code: string, fromNick: string, site = DUEL_SITE): string {
  return `⚔️ ${fromNick} te desafiou pra um DUELO no Ultimate do Road to Major.\nCódigo da sala: ${code}\n${duelInviteUrl(code, site)}`;
}
export interface H2H { oppNick: string; wins: number; losses: number; games: number; lastAt: number }
export function h2hText(h: H2H, myNick: string, site = DUEL_SITE): string {
  const lead = h.wins > h.losses ? `${myNick} lidera` : h.wins < h.losses ? `${h.oppNick} lidera` : 'empate';
  return `⚔️ ${myNick} ${h.wins}–${h.losses} ${h.oppNick} · ${h.games} duelo(s) · ${lead}\nRevanche no Ultimate: ${site}/ultimate`;
}
