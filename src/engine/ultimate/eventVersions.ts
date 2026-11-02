// [CSM-2] VERSÕES DE EVENTO POR JOGADOR — regras puras (portado do CS Manager).
//
// Um evento de live-ops declara versões especiais de alguns jogadores (OVR e
// atributos com boost + rótulo do evento). Enquanto o evento está ativo, a
// versão de evento SUBSTITUI a carta base daquele jogador no sorteio de packs e
// de drops (regra 3 do original: "a base é trocada pela de evento"), ocupando a
// MESMA vaga de raridade (poolRarity) — então as odds dos packs não mudam: só
// QUAL carta sai daquela raridade. Jogador sem versão continua com a base.
//
// Determinismo: a escolha dos jogadores sai do id do evento + catálogo base do
// mês (o mesmo no cliente e no servidor — snapshot com teste de drift). A carta
// em si é derivada só da chave (`<playerId>:evento@<eventId>`) + carta base do
// jogador, então ela resolve em qualquer índice (CardIndex) mesmo depois que o
// evento acabou: carta da coleção nunca some.
//
// Fonte do evento: o evento automático de fim de semana [URG-2]
// (weekendEvent.ts). Um item de live-ops manual pode usar a mesma declaração
// (EventVersionDecl) — ver eventVersionDeclFor.
// Imports com .js: roda no servidor (Node ESM sem bundle).
import { makeRng } from '../rng.js';
import type { UltCard } from './cards.js';
import type { UltRarity } from './rarities.js';
import { weekendEventById, weekendEventFor, weekendSeed } from './weekendEvent.js';

export const EVENT_VERSION_BOOST = 3;
export const EVENT_VERSION_SIZE = 5;
export const EVENT_VERSION_RARITY: UltRarity = 'evento';
// só Ouro Raro e Elite ganham versão: valor controlado (nada de Lendário +3)
export const EVENT_VERSION_SOURCE_RARITIES: readonly UltRarity[] = ['rareGold', 'elite'];
const BASE_RARITIES = new Set<string>(['bronze', 'silver', 'gold', 'rareGold', 'elite', 'legendary', 'icon']);
const SEP = '@';

export interface EventVersionDecl {
  eventId: string;
  label: string;
  playerIds: string[];
}

type BaseLike = Pick<UltCard, 'key' | 'playerId' | 'rarity' | 'ovr'>;

export function eventVersionKey(playerId: string, eventId: string): string {
  return `${playerId}:${EVENT_VERSION_RARITY}${SEP}${eventId}`;
}

export function parseEventVersionKey(key: string): { playerId: string; eventId: string } | null {
  const i = key.lastIndexOf(':');
  if (i <= 0) return null;
  const suffix = key.slice(i + 1);
  const prefix = `${EVENT_VERSION_RARITY}${SEP}`;
  if (!suffix.startsWith(prefix)) return null;
  const eventId = suffix.slice(prefix.length);
  if (!eventId || eventId.length > 40) return null;
  return { playerId: key.slice(0, i), eventId };
}

/** Rótulo do evento a partir só do id (resolve carta antiga sem o live-ops). */
export function eventLabelFor(eventId: string): string {
  return weekendEventById(eventId)?.name ?? 'Evento';
}

const clampStat = (n: number) => Math.max(1, Math.min(99, Math.round(n)));

/** Versão de evento derivada da carta BASE do jogador. */
export function makeEventVersion<T extends BaseLike & { stats?: UltCard['stats'] }>(base: T, eventId: string, label = eventLabelFor(eventId)): T {
  const out: Record<string, unknown> = {
    ...base,
    key: eventVersionKey(base.playerId, eventId),
    rarity: EVENT_VERSION_RARITY,
    ovr: clampStat(base.ovr + EVENT_VERSION_BOOST),
    eventId,
    eventLabel: label,
    poolRarity: base.rarity,
  };
  if (base.stats) {
    const s = base.stats;
    out.stats = {
      tiro: clampStat(s.tiro + EVENT_VERSION_BOOST), mira: clampStat(s.mira + EVENT_VERSION_BOOST),
      reflexo: clampStat(s.reflexo + EVENT_VERSION_BOOST), visao: clampStat(s.visao + EVENT_VERSION_BOOST),
      clutch: clampStat(s.clutch + EVENT_VERSION_BOOST), util: clampStat(s.util + EVENT_VERSION_BOOST),
    };
  }
  // snapshot do servidor (SnapCard): value/special pré-calculados
  if ('value' in base && typeof (base as { value?: unknown }).value === 'number') out.value = Math.round((base as unknown as { value: number }).value * 1.6);
  if ('special' in base) out.special = true;
  return out as T;
}

/** Declaração do evento de fim de semana: 5 jogadores Ouro Raro/Elite sorteados pela seed da semana. */
export function weekendEventVersionDecl(ev: { id: string; name: string; isoYear: number; isoWeek: number }, catalog: readonly BaseLike[]): EventVersionDecl {
  const pool = [...new Map(
    catalog
      .filter((c) => (EVENT_VERSION_SOURCE_RARITIES as readonly string[]).includes(c.rarity))
      .map((c) => [c.playerId, c] as const),
  ).keys()].sort();
  const rng = makeRng((weekendSeed(ev.isoYear, ev.isoWeek) ^ 0x0e7e0e7e) >>> 0);
  const playerIds: string[] = [];
  while (playerIds.length < EVENT_VERSION_SIZE && pool.length) {
    playerIds.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return { eventId: ev.id, label: ev.name, playerIds: playerIds.sort() };
}

/** Declaração ativa em `now` (null fora da janela do evento). */
export function activeEventVersionDecl(now: number, catalog: readonly BaseLike[]): EventVersionDecl | null {
  const ev = weekendEventFor(now);
  return ev ? weekendEventVersionDecl(ev, catalog) : null;
}

/**
 * Pool de sorteio com o evento aplicado: a carta BASE de cada jogador declarado
 * sai e entra a versão de evento no mesmo grupo de raridade. Sem declaração
 * devolve o próprio pool (mesma referência).
 */
export function applyEventVersions<T extends BaseLike>(pool: readonly T[], decl: EventVersionDecl | null): T[] {
  if (!decl || !decl.playerIds.length) return pool as T[];
  const chosen = new Set(decl.playerIds);
  const out: T[] = [];
  const added = new Set<string>();
  for (const c of pool) {
    if (chosen.has(c.playerId) && BASE_RARITIES.has(c.rarity)) {
      if (!added.has(c.playerId)) {
        added.add(c.playerId);
        out.push(makeEventVersion(c, decl.eventId, decl.label));
      }
      continue;
    }
    out.push(c);
  }
  return out;
}

/** Versões de evento declaradas (para a UI listar "cartas do evento"). */
export function eventVersionCards<T extends BaseLike>(catalog: readonly T[], decl: EventVersionDecl | null): T[] {
  if (!decl) return [];
  return applyEventVersions(catalog, decl).filter((c) => c.rarity === EVENT_VERSION_RARITY && (c as { eventId?: string }).eventId === decl.eventId);
}
