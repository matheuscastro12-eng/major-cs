// [realismo FM] CA/PA em ESTRELAS, como o relatório de olheiro do FM: 5 estrelas
// = 200, passos de meia estrela. O PA aparece como FAIXA — quanto menos você
// conhece o jogador, mais larga (e o valor real não fica sempre no meio).
import { hashStr } from '../../state/hash';

/** 1–200 → 0,5..5 estrelas (passo de meia; nunca zero para quem joga). */
export function starsOf(v: number): number {
  return Math.max(0.5, Math.min(5, Math.round((v / 40) * 2) / 2));
}

/** Conhecimento sobre o jogador: seu elenco (full), acompanhado pelo olheiro (scouted) ou só fama (rumor). */
export type ScoutKnowledge = 'full' | 'scouted' | 'rumor';
const SPREAD: Record<ScoutKnowledge, number> = { full: 8, scouted: 16, rumor: 28 };

/**
 * Faixa do PA (escala 1–200) para exibir: contém o PA real, nunca abaixo do CA
 * e com largura pela incerteza. Determinística por jogador.
 * `scoutAccuracy` (0–1, `staffEffects().scoutAccuracy` dos olheiros da comissão)
 * estreita a faixa: 0 = largura de antes; olheiro mediano (~0,43) ≈ 74%; elite
 * (0,9) ≈ 46%. Nunca abaixo de 4 pontos.
 */
export function paRange(pa: number, ca: number, knowledge: ScoutKnowledge, playerId: string, scoutAccuracy = 0): [number, number] {
  const acc = Math.max(0, Math.min(0.95, Number.isFinite(scoutAccuracy) ? scoutAccuracy : 0));
  const w = acc > 0 ? Math.max(4, Math.round(SPREAD[knowledge] * (1 - 0.6 * acc))) : SPREAD[knowledge];
  const shift = ((hashStr(`paband:${playerId}`) % 1000) / 1000 - 0.5) * w; // o real não fica sempre no meio
  let lo = Math.round(pa - w / 2 + shift);
  let hi = lo + w;
  if (lo < ca) { hi += ca - lo; lo = ca; }
  if (hi > 200) { lo = Math.max(ca, lo - (hi - 200)); hi = 200; }
  lo = Math.min(lo, pa);
  hi = Math.max(hi, pa);
  return [lo, hi];
}
