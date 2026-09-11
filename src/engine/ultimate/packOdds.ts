// [U01] PROBABILIDADES EFETIVAS de um pack — derivadas da MESMA definição que o
// roll usa (PackDef.weights + guaranteed), nunca de texto fixo.
//
// O rollPack faz: (1) as cartas GARANTIDAS saem do bucket prometido, sorteando a
// raridade dentro do bucket pelos weights; (2) as demais (cards − garantidas)
// saem pelos weights inteiros. Aqui reproduzimos essa conta em vez de exibir o
// peso bruto como se fosse "chance do pack" — o peso de raridade sozinho não é
// a probabilidade de a carta aparecer no pack.
import type { PackDef } from './packs.js';
import { rarityInfo, rarityMatchesBucket, type RarityBucket, type UltRarity } from './rarities.js';

export interface PackOdds {
  /** rótulo da garantia ("1 carta Ouro ou melhor", "1 Time da Temporada") */
  guaranteed: { bucket: RarityBucket; count: number; label: string }[];
  /** P(≥1 carta desta raridade no pack), por raridade com peso > 0 — 0..1 */
  atLeastOne: Partial<Record<UltRarity, number>>;
  /** cartas esperadas por raridade (soma = pack.cards quando o catálogo cobre tudo) */
  expected: Partial<Record<UltRarity, number>>;
  cards: number;
}

const BUCKET_LABEL: Record<RarityBucket, string> = {
  bronze: 'Bronze ou melhor', silver: 'Prata ou melhor', gold: 'Ouro ou melhor', special: 'especial',
};

// Distribuição de raridade de UMA carta sorteada com estes pesos (normalizada).
function dist(weights: PackDef['weights'], filter?: (r: UltRarity) => boolean): Map<UltRarity, number> {
  const keys = (Object.keys(weights) as UltRarity[]).filter((k) => (weights[k] ?? 0) > 0 && (!filter || filter(k)));
  const total = keys.reduce((a, k) => a + (weights[k] ?? 0), 0);
  const m = new Map<UltRarity, number>();
  if (total <= 0) return m;
  for (const k of keys) m.set(k, (weights[k] ?? 0) / total);
  return m;
}

export function packOdds(pack: PackDef): PackOdds {
  const guaranteed = (pack.guaranteed ?? []).map((g) => {
    // garantia 'special' com um único special nos weights (tots/promo/totw/histIcon):
    // o rótulo é a raridade em si, que é o que o jogador quer saber
    const specials = (Object.keys(pack.weights) as UltRarity[]).filter((k) => rarityMatchesBucket(k, g.bucket) && (pack.weights[k] ?? 0) > 0);
    const label = g.bucket === 'special' && specials.length === 1
      ? `${g.count} ${rarityInfo(specials[0]).label}`
      : `${g.count} ${BUCKET_LABEL[g.bucket]}`;
    return { bucket: g.bucket, count: g.count, label };
  });
  const gCount = guaranteed.reduce((a, g) => a + g.count, 0);
  const rest = Math.max(0, pack.cards - gCount);

  // probabilidade de NÃO sair a raridade r em nenhuma das cartas
  const none: Partial<Record<UltRarity, number>> = {};
  const expected: Partial<Record<UltRarity, number>> = {};
  const all = (Object.keys(pack.weights) as UltRarity[]).filter((k) => (pack.weights[k] ?? 0) > 0);
  for (const r of all) { none[r] = 1; expected[r] = 0; }
  const restDist = dist(pack.weights);
  for (const r of all) {
    const p = restDist.get(r) ?? 0;
    none[r] = (none[r] ?? 1) * Math.pow(1 - p, rest);
    expected[r] = (expected[r] ?? 0) + p * rest;
  }
  for (const g of pack.guaranteed ?? []) {
    const gd = dist(pack.weights, (r) => rarityMatchesBucket(r, g.bucket));
    for (let i = 0; i < g.count; i++) {
      for (const r of all) {
        const p = gd.get(r) ?? 0;
        none[r] = (none[r] ?? 1) * (1 - p);
        expected[r] = (expected[r] ?? 0) + p;
      }
    }
  }
  const atLeastOne: Partial<Record<UltRarity, number>> = {};
  for (const r of all) atLeastOne[r] = 1 - (none[r] ?? 1);
  return { guaranteed, atLeastOne, expected, cards: pack.cards };
}

// Linha curta pra loja: garantia + as 3 raridades mais raras com chance (≥1 no pack).
// Ex.: "Garantido: 2 Ouro ou melhor · Elite 40% · Lendário 6% · Ícone 0,7%"
export function packOddsLine(pack: PackDef): string {
  const o = packOdds(pack);
  const rare = (Object.keys(o.atLeastOne) as UltRarity[])
    .filter((r) => rarityInfo(r).tier >= 5)
    .sort((a, b) => rarityInfo(a).tier - rarityInfo(b).tier)
    .slice(0, 3)
    .map((r) => `${rarityInfo(r).label} ${fmtPct(o.atLeastOne[r] ?? 0)}`);
  const g = o.guaranteed.map((x) => x.label).join(' + ');
  return [g ? `Garantido: ${g}` : '', ...rare].filter(Boolean).join(' · ');
}

export function fmtPct(p: number): string {
  const v = p * 100;
  if (v >= 99.95) return '100%';
  if (v >= 10) return `${Math.round(v)}%`;
  if (v >= 1) return `${v.toFixed(1).replace('.', ',')}%`;
  return `${v.toFixed(2).replace('.', ',')}%`;
}
