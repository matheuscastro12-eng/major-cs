// Nick da CONTA (O1-10, SEGU-19/ONLI-17). O ranking, a Série do Dia, o Draft do
// Dia e o aviso de rival devem mostrar SEMPRE o rtm_accounts.nick — nunca o
// body.nick que o cliente manda (dava pra aparecer no placar como "coldzera" ou
// com o nick de outro jogador). Aqui ficam as regras do nick: normalização,
// filtro de palavrões e unicidade sem diferenciar maiúsculas.

export const NICK_MIN = 3;
export const NICK_MAX = 24;

// cliente sql do neon usado como template tag (basta a forma de tagged template).
type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

// NFKC (tira letra "fantasia" de largura total etc.), remove controle e
// caracteres invisíveis (zero-width, bidi) e colapsa espaços.
export function normalizeNick(raw: unknown, max = NICK_MAX): string {
  return String(raw ?? '')
    .slice(0, 256) // corta ANTES de normalizar: string de MBs não vira CPU cara
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Esqueleto pra comparar com a lista: minúsculo, sem acento, leetspeak desfeito
// e só letras (pega "p0rr4", "C.a.r.a.l.h.o", "fúck").
export function nickSkeleton(nick: string): string {
  const leet: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i' };
  return nick
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[0-9@$!|]/g, (c) => leet[c] ?? c)
    .replace(/[^a-z]/g, '');
}

// Raízes bloqueadas em qualquer posição do esqueleto. Só entram raízes que não
// aparecem dentro de palavra inocente ("puta" pegaria "computador", "kkk" a
// risada, "rape" o "grape", "cunt" o "Scunthorpe"): essas vão pra lista de
// palavra inteira. Ofensa, ódio e crime sexual — não é censura de gíria.
const BLOCKED_ROOTS = [
  'porra', 'caralh', 'buceta', 'boceta', 'arrombad', 'filhadaputa', 'filhodaputa', 'putinha',
  'viado', 'viadinho', 'traveco', 'merda', 'foder', 'fodase', 'fudid', 'punheta', 'piroca',
  'xoxota', 'xereca', 'cuzao', 'cuzinho', 'retardad', 'mongoloide', 'estupr', 'pedofil',
  'nazi', 'hitler', 'nigger', 'nigga', 'faggot', 'fuck', 'bitch', 'whore', 'pussy',
];
// Palavras curtas/ambíguas: só bloqueiam como PALAVRA inteira (senão "cu" pegaria "cuidado").
const BLOCKED_WORDS = new Set([
  'cu', 'fdp', 'pqp', 'vsf', 'tnc', 'krl', 'crl', 'pau', 'rola', 'fds', 'vtnc', 'puta', 'bicha',
  'kkk', 'rape', 'cunt', 'shit', 'dick', 'cock', 'retard', 'macaco',
]);
// Nomes que se passam pela casa.
const RESERVED = ['admin', 'administrador', 'moderador', 'suporte', 'oficial', 'roadtomajor', 'majorcs', 'staff'];

// Texto livre (nick, nome de time do Hall) com termo bloqueado?
export function hasBlockedTerm(text: string): boolean {
  const skel = nickSkeleton(text);
  const words = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').split(/[^a-z0-9]+/).filter(Boolean);
  return BLOCKED_ROOTS.some((r) => skel.includes(r)) || words.some((w) => BLOCKED_WORDS.has(w));
}

export function nickProblem(nick: string): string | null {
  if (nick.length < NICK_MIN) return `O nick precisa de pelo menos ${NICK_MIN} caracteres.`;
  if (nick.length > NICK_MAX) return `O nick pode ter no máximo ${NICK_MAX} caracteres.`;
  if (!/^[\p{L}\p{N} _.-]+$/u.test(nick)) return 'Use só letras, números, espaço, _ . e -.';
  const skel = nickSkeleton(nick);
  if (!skel && !/\p{N}/u.test(nick)) return 'O nick precisa ter letras ou números.';
  if (hasBlockedTerm(nick)) return 'Esse nick não é permitido. Escolha outro.';
  if (RESERVED.some((r) => skel === r || skel.startsWith(r))) return 'Esse nick é reservado. Escolha outro.';
  return null;
}

// Nick já usado por OUTRA conta (ativa ou cadastro pendente), sem diferenciar
// maiúsculas. Não há índice único ainda (a base pode ter duplicatas antigas);
// a checagem é no código, apoiada no índice em lower(nick).
export async function nickTaken(sql: SqlTag, nick: string, ownerEmail: string): Promise<boolean> {
  const r = await sql`
    SELECT 1 FROM rtm_accounts WHERE lower(nick) = lower(${nick}) AND email <> ${ownerEmail}
    UNION ALL
    SELECT 1 FROM rtm_pending_signups WHERE lower(nick) = lower(${nick}) AND email <> ${ownerEmail}
    LIMIT 1`;
  return r.length > 0;
}

// O nick que as rotas públicas devem usar: o da conta, nunca o do body.
// (Pra api/ranking.ts: `const nick = await accountNick(sql, email)` no lugar de
// `body.nick || acc[0].nick`.)
export async function accountNick(sql: SqlTag, email: string, fallback = 'manager'): Promise<string> {
  const r = await sql`SELECT nick FROM rtm_accounts WHERE email=${email}`;
  const nick = normalizeNick(r[0]?.nick);
  return nick || fallback;
}
