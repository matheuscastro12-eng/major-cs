// [U07] JOGADOR DOS SONHOS — carta-alvo persistente + caminhos REAIS de obtenção
// + preview de escalação. Puro: quem consulta mercado (assíncrono) é a UI.
//
// Regras do plano: não inventar disponibilidade nem chance individual. Aqui
// mostramos (a) se a carta está em circulação (base sempre; TOTW só na semana;
// promo só no mês), (b) quais packs podem sortear a RARIDADE dela, com a
// P(≥1 carta dessa raridade) do packOdds e o tamanho do pool da raridade —
// dois números separados, nunca multiplicados como "chance da carta", (c)
// recompensas que dão essa raridade (SBC/passe/temporada) marcadas como
// "não específica", (d) a diferença de saldo para o caminho mais barato.
import type { Role } from '../../types';
import type { UltCard } from './cards';
import type { PackDef } from './packs';
import { packOdds } from './packOdds';
import { computeChemistry, roleFitsSlot, type ChemNode } from './chemistry';
import { SBCS } from './sbc';
import type { UltRarity } from './rarities';

export interface TargetRef { cardKey: string; setAt: number }

export function normalizeTarget(v: unknown): TargetRef | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<TargetRef>;
  if (typeof o.cardKey !== 'string' || !o.cardKey.includes(':')) return null;
  return { cardKey: o.cardKey, setAt: Number(o.setAt) || 0 };
}

export type Circulation = 'sempre' | 'agora' | 'fora';
export interface PackPath { id: string; name: string; cost: number; pRarity: number; rarityPoolSize: number }
export interface TargetPaths {
  owned: boolean;
  circulation: Circulation;
  circulationNote: string;
  packs: PackPath[];               // packs cujo weights contêm a raridade (e a carta está no pool)
  rarityRewards: string[];         // "SBC X → 1 carta Elite (não específica)"
  cheapestPackCost: number | null;
}

export interface TargetCtx {
  catalog: UltCard[];              // catálogo de propriedade (resolve qualquer carta)
  packs: PackDef[];                // PACK_DEFS + TOTW_PACK + ICON_PACK (+ promo do mês)
  promoPlayerIds: string[];        // promo ATIVA do mês
  totwPool: UltCard[] | null;      // pool elegível do TOTW da semana (null = indisponível)
  owned: boolean;
}

const SPECIAL: UltRarity[] = ['totw', 'promo', 'tots', 'major', 'histIcon'];

export function targetPaths(card: UltCard, ctx: TargetCtx): TargetPaths {
  // circulação
  let circulation: Circulation = 'sempre'; let note = 'Carta do catálogo base: pode sair em qualquer pack que contenha a raridade.';
  if (card.rarity === 'totw') {
    const inWeek = !!ctx.totwPool?.some((c) => c.key === card.key);
    circulation = inWeek ? 'agora' : 'fora';
    note = inWeek ? 'In-form desta semana: só sai do Pacote TOTW até a rotação de segunda 00:00 UTC.' : 'TOTW de outra semana: não sai mais de pack — só no mercado.';
  } else if (card.rarity === 'promo') {
    const inMonth = ctx.promoPlayerIds.includes(card.playerId);
    circulation = inMonth ? 'agora' : 'fora';
    note = inMonth ? 'Promo deste mês: só sai do Pacote Promo enquanto o tema estiver ativo.' : 'Promo de outro mês: não sai mais de pack — só no mercado.';
  } else if (card.rarity === 'tots' || card.rarity === 'major') {
    note = 'Special curada: sai na garantia do Pacote TOTS (bucket especial) e no mercado.';
  } else if (card.rarity === 'histIcon') {
    note = 'Ícone Histórico: só no Pacote Ícone (1 garantido) e no mercado.';
  }
  // packs que podem sortear a raridade — e cuja pool contém a carta
  const packs: PackPath[] = [];
  for (const p of ctx.packs) {
    if (!((p.weights[card.rarity] ?? 0) > 0)) continue;
    const pool = p.id === 'totw' ? ctx.totwPool : p.id === 'promo' ? ctx.catalog.filter((c) => c.rarity !== 'promo' || ctx.promoPlayerIds.includes(c.playerId)) : ctx.catalog;
    if (!pool || !pool.some((c) => c.key === card.key)) continue;
    const rarityPoolSize = pool.filter((c) => c.rarity === card.rarity).length;
    packs.push({ id: p.id, name: p.name, cost: p.cost, pRarity: packOdds(p).atLeastOne[card.rarity] ?? 0, rarityPoolSize });
  }
  packs.sort((a, b) => a.cost - b.cost);
  // recompensas por raridade (nunca específicas)
  const rarityRewards: string[] = [];
  for (const s of SBCS) if (s.reward.card === card.rarity) rarityRewards.push(`SBC "${s.name}" → 1 carta ${card.rarity} (não específica)`);
  if (SPECIAL.includes(card.rarity) && rarityRewards.length === 0 && card.rarity !== 'totw' && card.rarity !== 'promo') rarityRewards.push('Passe/temporada podem dar esta raridade (não específica) — ver aba Passe');
  return { owned: ctx.owned, circulation, circulationNote: note, packs, rarityRewards, cheapestPackCost: packs.length ? packs[0].cost : null };
}

export function missingCredits(credits: number, cost: number | null): number | null {
  if (cost == null) return null;
  return Math.max(0, cost - credits);
}

// ── Preview de escalação (sem consumir nada) ────────────────────────────────
export interface SwapPreview {
  slot: number; slotRole: Role;
  roleFit: boolean;
  chemBefore: number; chemAfter: number;     // total 0..15
  multBefore: number; multAfter: number;
  ovrBefore: number | null; ovrAfter: number;
  outNick: string | null;
}
export function slotSwapPreview(adjacency: [number, number][], nodes: ChemNode[], slot: number, card: UltCard & { role2?: Role }): SwapPreview | null {
  const node = nodes.find((n) => n.slot === slot);
  if (!node) return null;
  const before = computeChemistry(adjacency, nodes);
  const after = computeChemistry(adjacency, nodes.map((n) => (n.slot === slot ? { ...n, card } : n)));
  const cur = node.card as (ChemNode['card'] & { ovr?: number; nick?: string }) | null;
  return {
    slot, slotRole: node.slotRole, roleFit: roleFitsSlot(card.role, node.slotRole, card.role2),
    chemBefore: before.total, chemAfter: after.total, multBefore: before.multiplier, multAfter: after.multiplier,
    ovrBefore: cur?.ovr ?? null, ovrAfter: card.ovr, outNick: cur?.nick ?? null,
  };
}

/** Melhor slot para estrear: primeiro os que encaixam a função; entre eles o de
 *  maior ganho de química; empata pelo menor OVR atual (troca o mais fraco). */
export function bestSlotFor(adjacency: [number, number][], nodes: ChemNode[], card: UltCard & { role2?: Role }): SwapPreview | null {
  const previews = nodes.map((n) => slotSwapPreview(adjacency, nodes, n.slot, card)).filter((p): p is SwapPreview => !!p);
  if (!previews.length) return null;
  previews.sort((a, b) => Number(b.roleFit) - Number(a.roleFit) || (b.chemAfter - b.chemBefore) - (a.chemAfter - a.chemBefore) || (a.ovrBefore ?? 0) - (b.ovrBefore ?? 0));
  return previews[0];
}
