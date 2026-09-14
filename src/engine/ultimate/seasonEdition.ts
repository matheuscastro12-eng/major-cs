// [URG-1] EDIÇÃO DA TEMPORADA — cartas "em forma" que perdem o bônus na virada.
//
// Uma cópia possuída pode carregar `ed` (número da temporada em que saiu como
// edição). Enquanto `season.n === ed` ela vale +SEASON_EDITION_BOOST OVR (e nos
// 6 atributos, igual ao evolveCard); quando a temporada vira, o bônus some e a
// cópia vira "Legado S{ed}" — continua jogável, só perde o "em forma". É a
// perda visível que dá motivo pra jogar AGORA, sem apagar o que o jogador tem.
//
// Como a edição cai: TODAS as cartas do Pacote da Temporada saem com `ed`, e
// cada carta de pacote comum tem SEASON_EDITION_CHANCE de sair como edição.
// Tudo puro e determinístico: rng vem de fora (makeRng), relógio vem de `now`.
import type { UltCard } from './cards.js';
import type { PackDef } from './packs.js';
import type { Rng } from '../rng.js';
import type { OwnedCard } from './state.js';

export const SEASON_EDITION_BOOST = 2;
export const SEASON_EDITION_CHANCE = 0.10; // por carta, em pacote comum

// Pacote da Temporada — fora de PACK_DEFS de propósito (como o Promo): só vende
// enquanto a temporada está ativa e a Loja o renderiza à parte com o contador.
// NÃO entra no packById: o roll é sempre LOCAL (o servidor não carimba `ed`).
// Custo entre o Ouro (14k, 7 cartas) e o Promo (25k): paga-se pelo carimbo.
export const SEASON_PACK: PackDef = {
  id: 'season', name: 'Pacote da Temporada', desc: '7 cartas · 2 Ouro ou melhor garantidas · TODAS em forma (+2 OVR até o fim da temporada)',
  cost: 20000, cards: 7, color: '#f97316',
  weights: { gold: 50, rareGold: 38, elite: 10, legendary: 1.7, icon: 0.3 },
  guaranteed: [{ bucket: 'gold', count: 2 }],
};

// `ed` válido = inteiro ≥ 1. Qualquer outra coisa (string, NaN, 0, negativo)
// é ignorada no normalize — save antigo sem `ed` segue idêntico.
export function normalizeEdition(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 1 ? v : undefined;
}

export type EditionStatus = 'current' | 'legacy';

// null = carta comum (sem selo). 'current' = em forma (+OVR). 'legacy' = já virou.
export function editionStatus(owned: Pick<OwnedCard, 'ed'>, seasonN: number | undefined): EditionStatus | null {
  const ed = normalizeEdition(owned.ed);
  if (ed == null) return null;
  return seasonN != null && ed === seasonN ? 'current' : 'legacy';
}

export function editionBoost(owned: Pick<OwnedCard, 'ed'>, seasonN: number | undefined): number {
  return editionStatus(owned, seasonN) === 'current' ? SEASON_EDITION_BOOST : 0;
}

export function editionLabel(ed: number): string {
  return `S${ed}`;
}

// aplica o bônus da edição numa carta (OVR + 6 atributos, clamp 99). Base
// intacta quando a cópia não está em forma — mesmo contrato do boostCard da UI.
export function applyEditionBoost(base: UltCard, owned: Pick<OwnedCard, 'ed'>, seasonN: number | undefined): UltCard {
  const b = editionBoost(owned, seasonN);
  if (!b) return base;
  const up = (v: number) => Math.min(99, v + b);
  return {
    ...base,
    ovr: Math.min(99, base.ovr + b),
    stats: { tiro: up(base.stats.tiro), mira: up(base.stats.mira), reflexo: up(base.stats.reflexo), visao: up(base.stats.visao), clutch: up(base.stats.clutch), util: up(base.stats.util) },
  };
}

// quantas cópias do inventário estão em forma nesta temporada (as que vão
// perder o bônus quando ela virar).
export function countEditionCards(inventory: Pick<OwnedCard, 'ed'>[], seasonN: number | undefined): number {
  if (seasonN == null) return 0;
  let n = 0;
  for (const o of inventory) if (editionStatus(o, seasonN) === 'current') n++;
  return n;
}

// carimbo de edição das cartas de um pacote recém-aberto. Pacote da Temporada:
// todas. Pacote comum: cada carta rola SEASON_EDITION_CHANCE no MESMO rng do
// pack (um rng() por carta, sempre, pra ser reproduzível por seed). Sem
// temporada aberta (seasonN undefined) ninguém recebe carimbo.
export function stampPackEditions(count: number, rng: Rng, seasonN: number | undefined, isSeasonPack: boolean, chance = SEASON_EDITION_CHANCE): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rng();
    if (seasonN == null) { out.push(undefined); continue; }
    out.push(isSeasonPack || roll < chance ? seasonN : undefined);
  }
  return out;
}

export function isSeasonPack(packId: string): boolean {
  return packId === SEASON_PACK.id;
}

// janela da temporada pra UI: quanto falta e o que o jogador vai perder.
export interface SeasonEnding {
  active: boolean;        // temporada aberta e ainda não vencida
  msLeft: number;
  days: number;           // dias inteiros restantes (arredonda pra cima quando há resto)
  dd: number;             // componente "Xd" do contador
  hh: number;             // componente "Yh" do contador
  losing: number;         // cópias que vão perder o +OVR
  seasonN: number | undefined;
}

export function seasonEnding(
  season: { n?: number; endsAt: number } | null | undefined,
  inventory: Pick<OwnedCard, 'ed'>[],
  now: number,
): SeasonEnding {
  if (!season) return { active: false, msLeft: 0, days: 0, dd: 0, hh: 0, losing: 0, seasonN: undefined };
  const seasonN = season.n ?? 1;
  const msLeft = Math.max(0, season.endsAt - now);
  const dd = Math.floor(msLeft / 86400000);
  const hh = Math.floor((msLeft % 86400000) / 3_600_000);
  return {
    active: msLeft > 0,
    msLeft,
    days: Math.ceil(msLeft / 86400000),
    dd,
    hh,
    losing: countEditionCards(inventory, seasonN),
    seasonN,
  };
}
