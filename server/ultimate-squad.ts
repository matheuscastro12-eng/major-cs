// [F1] Elenco autoritativo do PvP do Ultimate. O servidor monta o snapshot do
// squad a partir do que ELE sabe: posse em rtm_ult_cards, OVR/role/região/org
// do catálogo do servidor (snapshot mensal) + meta da cópia (boost/style), e
// química pelo MESMO computeChemistry do cliente com a adjacência da formação.
// O cliente só diz QUAIS cópias (cardIds, na ordem dos slots) e QUAL formação;
// ovr/chem declarados por ele são ignorados.
//
// Puro: recebe o tag `sql` e um lookup de catálogo (a rota injeta o snapshot).
// chemistry/formations/traits só têm imports de TIPO — cadeia runtime-safe.
import { computeChemistry, type ChemNode } from '../src/engine/ultimate/chemistry.js';
import { FORMATIONS } from '../src/engine/ultimate/formations.js';
import { squadDuelBonus, STYLES } from '../src/engine/ultimate/traits.js';
import type { UltCard } from '../src/engine/ultimate/cards.js';
import type { SqlTag } from './ultimate-economy.js';

// v3 = snapshot montado pelo servidor (mesmo formato do v2: name/elo/chem/
// cards[{pid,ovr}]/approach). Cliente antigo lê igual (pvpApproachesApply usa ≥2).
export const SERVER_SQUAD_VERSION = 3;
export const SQUAD_SIZE = 5;
// espelho de EVO_MAX (src/engine/ultimate/state.ts) — o state.ts puxa a cadeia
// pesada do engine, então o número fica aqui (teste guarda o drift).
export const SQUAD_EVO_MAX = 3;
const STYLE_IDS = new Set<string>(STYLES.map((s) => s.id));

export type SquadCardLookup = (cardKey: string) => UltCard | null | undefined;

export interface ServerPvpSquad {
  name: string;
  elo: number;
  chem: number; // multiplicador final (química × bônus de duelo), clamp 0.8–1.2
  cards: { pid: string; ovr: number }[];
  v: number;
  approach: 'aggressive' | 'control' | 'adaptive' | null;
  auth: boolean; // true = montado e conferido pelo servidor
  formation?: string;
  chemTotal?: number;
  cardIds?: string[]; // [CSM-3] cópias (uuid) na ordem dos slots — história da carta
}

export type SquadBuildError = 'bad_input' | 'bad_formation' | 'duplicate_card' | 'not_owner' | 'unknown_card';

export type SquadBuildResult =
  | { ok: true; squad: ServerPvpSquad }
  | { ok: false; error: SquadBuildError; message: string; cardIds?: string[] };

// mensagens em PT-BR pro jogador (a rota devolve como `error`).
export const SQUAD_ERROR_MSG: Record<SquadBuildError, string> = {
  bad_input: 'Escale 5 cartas no squad antes de entrar.',
  bad_formation: 'Formação inválida. Escolha outra formação no squad.',
  duplicate_card: 'A mesma carta aparece duas vezes no squad. Troque uma delas.',
  not_owner: 'Uma ou mais cartas do squad não estão na sua conta online (prêmios só do aparelho não valem na ranqueada). Troque essas cartas e tente de novo.',
  unknown_card: 'Uma carta do squad não existe no catálogo atual. Troque essa carta e tente de novo.',
};

export interface OwnedRow { cardId: string; cardKey: string; meta: Record<string, unknown> }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clampBoost = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(SQUAD_EVO_MAX, n)) : 0;
};

// valida a forma crua do request: 5 ids string distintos + formação conhecida.
export function parseSquadRequest(rawIds: unknown, rawFormation: unknown):
  { ok: true; cardIds: string[]; formationId: string } | { ok: false; error: SquadBuildError } {
  if (!Array.isArray(rawIds) || rawIds.length !== SQUAD_SIZE) return { ok: false, error: 'bad_input' };
  const cardIds = rawIds.map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (cardIds.some((id) => !id || id.length > 80)) return { ok: false, error: 'bad_input' };
  if (new Set(cardIds).size !== cardIds.length) return { ok: false, error: 'duplicate_card' };
  const formationId = typeof rawFormation === 'string' ? rawFormation.trim() : '';
  if (!FORMATIONS.some((f) => f.id === formationId)) return { ok: false, error: 'bad_formation' };
  return { ok: true, cardIds, formationId };
}

// Núcleo puro: posse + catálogo + química. `owned` = coleção do servidor.
export function deriveServerSquad(
  owned: OwnedRow[],
  rawIds: unknown,
  rawFormation: unknown,
  lookup: SquadCardLookup,
  extras: { name?: unknown; elo?: unknown; approach?: unknown } = {},
): SquadBuildResult {
  const parsed = parseSquadRequest(rawIds, rawFormation);
  if (!parsed.ok) return { ok: false, error: parsed.error, message: SQUAD_ERROR_MSG[parsed.error] };
  const byId = new Map(owned.map((o) => [o.cardId, o] as const));
  const missing = parsed.cardIds.filter((id) => !byId.has(id));
  if (missing.length) return { ok: false, error: 'not_owner', message: SQUAD_ERROR_MSG.not_owner, cardIds: missing };
  const form = FORMATIONS.find((f) => f.id === parsed.formationId)!;

  const cards: { card: UltCard; style?: string }[] = [];
  for (const id of parsed.cardIds) {
    const o = byId.get(id)!;
    const base = lookup(o.cardKey);
    if (!base) return { ok: false, error: 'unknown_card', message: SQUAD_ERROR_MSG.unknown_card, cardIds: [id] };
    const b = clampBoost(o.meta.boost);
    const up = (v: number) => Math.min(99, v + b);
    const card: UltCard = b
      ? { ...base, ovr: Math.min(99, base.ovr + b), stats: { tiro: up(base.stats.tiro), mira: up(base.stats.mira), reflexo: up(base.stats.reflexo), visao: up(base.stats.visao), clutch: up(base.stats.clutch), util: up(base.stats.util) } }
      : base;
    const style = typeof o.meta.style === 'string' && STYLE_IDS.has(o.meta.style) ? o.meta.style : undefined;
    cards.push({ card, style });
  }

  // cardIds[i] ocupa o slot i da formação (mesma ordem do snapshot do cliente).
  const nodes: ChemNode[] = form.slots.map((fs, i) => {
    const c = cards[i].card;
    return { slot: fs.slot, slotRole: fs.role, card: { teamOrigin: c.teamOrigin, region: c.region, country: c.country, role: c.role } };
  });
  const chem = computeChemistry(form.adjacency, nodes);
  const duel = squadDuelBonus(cards.map((c) => ({ card: c.card, styleId: c.style })));
  const mult = Math.max(0.8, Math.min(1.2, chem.multiplier * duel.multiplier));

  const approach = extras.approach === 'aggressive' || extras.approach === 'control' || extras.approach === 'adaptive' ? extras.approach : null;
  return {
    ok: true,
    squad: {
      name: String(extras.name ?? '').slice(0, 24),
      elo: Math.max(0, Math.min(5000, Math.round(Number(extras.elo) || 0))),
      chem: mult,
      cards: cards.map((c) => ({ pid: c.card.playerId, ovr: c.card.ovr })),
      v: SERVER_SQUAD_VERSION,
      approach,
      auth: true,
      formation: form.id,
      chemTotal: chem.total,
      cardIds: [...parsed.cardIds],
    },
  };
}

// Carrega a coleção do servidor e monta o snapshot autoritativo.
export async function buildServerSquad(
  sql: SqlTag,
  email: string,
  input: { cardIds: unknown; formationId: unknown; name?: unknown; elo?: unknown; approach?: unknown },
  lookup: SquadCardLookup,
): Promise<SquadBuildResult> {
  // forma primeiro (barato, sem banco)
  const parsed = parseSquadRequest(input.cardIds, input.formationId);
  if (!parsed.ok) return { ok: false, error: parsed.error, message: SQUAD_ERROR_MSG[parsed.error] };
  const rows = await sql`SELECT card_id, card_key, meta FROM rtm_ult_cards WHERE email=${email}`;
  const want = new Set(parsed.cardIds);
  const owned: OwnedRow[] = rows
    .map((r) => ({ cardId: String(r.card_id ?? ''), cardKey: String(r.card_key ?? ''), meta: isObj(r.meta) ? r.meta : {} }))
    .filter((r) => want.has(r.cardId));
  return deriveServerSquad(owned, parsed.cardIds, parsed.formationId, lookup, input);
}
