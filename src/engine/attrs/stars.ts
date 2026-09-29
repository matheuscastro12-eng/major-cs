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
 */
export function paRange(pa: number, ca: number, knowledge: ScoutKnowledge, playerId: string): [number, number] {
  const w = SPREAD[knowledge];
  const shift = ((hashStr(`paband:${playerId}`) % 1000) / 1000 - 0.5) * w; // o real não fica sempre no meio
  let lo = Math.round(pa - w / 2 + shift);
  let hi = lo + w;
  if (lo < ca) { hi += ca - lo; lo = ca; }
  if (hi > 200) { lo = Math.max(ca, lo - (hi - 200)); hi = 200; }
  lo = Math.min(lo, pa);
  hi = Math.max(hi, pa);
  return [lo, hi];
}
