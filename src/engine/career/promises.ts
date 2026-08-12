// PROMESSAS FORMAIS À DIRETORIA (#10 do gap Brasval). Puro, sem React.
//
// Diferença pra META do split (objective): a meta é IMPOSTA pela diretoria; a
// promessa é ESCOLHA SUA — você aposta o cargo em troca de dinheiro AGORA.
// Firmou: o aporte cai no caixa na hora e a diretoria anima (+4). No fim do
// split a promessa é julgada junto com a meta: cumpriu = confiança dispara;
// quebrou = despenca (-22) — e com a régua de demissão existente (board ≤ 12),
// promessa quebrada em momento ruim É demissão. Risco real, escolha real.
//
// Determinístico: as ofertas do split saem de hashStr(split) — sem RNG de save.

import { hashStr } from '../../state/hash';

export type PromiseType = 'title' | 'major' | 'top4' | 'noRelegation';

export interface BoardPromise {
  type: PromiseType;
  text: string;          // PT-BR pronto pra UI (o callsite embrulha em ct())
  split: number;         // split em que foi firmada — julgada no fechamento dele
  injection: number;     // aporte que caiu no caixa AO FIRMAR
  keepDelta: number;     // confiança ao cumprir
  breakDelta: number;    // confiança ao quebrar (negativo)
}

// resultado registrado no save pro dashboard/news citarem depois.
export interface PromiseOutcome { text: string; met: boolean; split: number }

export const PROMISE_SIGN_DELTA = 4;    // diretoria anima ao firmar

const PROMISE_DEFS: Record<PromiseType, { text: string; keepDelta: number; breakDelta: number }> = {
  title: { text: 'Prometo o TÍTULO deste split', keepDelta: 16, breakDelta: -22 },
  major: { text: 'Prometo classificar para o Major', keepDelta: 16, breakDelta: -22 },
  top4: { text: 'Prometo terminar no top 4', keepDelta: 10, breakDelta: -14 },
  noRelegation: { text: 'Prometo que NÃO seremos rebaixados', keepDelta: 6, breakDelta: -18 },
};

// Aportes por tier (o dinheiro que a promessa destrava AGORA). Título paga mais
// que top4; tier alto move números maiores.
const INJECTION: Record<PromiseType, [number, number, number]> = {
  // [tier1, tier2, tier3]
  title: [900_000, 450_000, 220_000],
  major: [1_100_000, 550_000, 0],       // major só existe no split de Major (tier 1-2)
  top4: [400_000, 220_000, 120_000],
  noRelegation: [0, 120_000, 80_000],
};

function offer(type: PromiseType, tier: number, split: number): BoardPromise {
  const d = PROMISE_DEFS[type];
  const tierIdx = Math.max(0, Math.min(2, (tier || 3) - 1));
  return { type, text: d.text, split, injection: INJECTION[type][tierIdx], keepDelta: d.keepDelta, breakDelta: d.breakDelta };
}

// As DUAS ofertas do split: uma agressiva (título/major — aporte grande, queda
// grande) e uma conservadora (top4/noRelegation). Determinístico por split.
export function promiseOffersFor(tier: number, split: number, majorNow: boolean): BoardPromise[] {
  const aggressive = majorNow && tier <= 2 && hashStr(`prom:${split}`) % 2 === 0
    ? offer('major', tier, split)
    : offer('title', tier, split);
  const safe = tier >= 3 || hashStr(`prom2:${split}`) % 3 === 0
    ? offer('noRelegation', tier, split)
    : offer('top4', tier, split);
  return [aggressive, safe];
}

// Julga a promessa no fechamento do split (mesmos predicados da meta).
export interface PromiseCtx {
  isChampion: boolean;
  qualifiedMajor: boolean;
  finalPos: number;
  tierChange: 'up' | 'down' | null;
}
export function evaluatePromise(p: BoardPromise, ctx: PromiseCtx): boolean {
  switch (p.type) {
    case 'title': return ctx.isChampion;
    case 'major': return ctx.qualifiedMajor;
    case 'top4': return ctx.finalPos <= 4;
    case 'noRelegation': return ctx.tierChange !== 'down';
  }
}
