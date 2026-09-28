// MONTE CARLO DE ESTILOS DA SALA — harness de balanceamento (O1-44 / O1-28).
//
// Joga N Séries do Dia (fixture determinístico por data) pela interface real
// da Sala com estratégias fixas: sempre agressivo, sempre seguro, sempre
// inteligente, pular tudo e "ler e contra-atacar" (usa a Leitura e escolhe o
// estilo que vence a postura revelada). Mede vitória e rating de cada uma.
// Usado pelo teste (scripts/test-rtp-invariants.mts) e à mão:
//   npx tsx scripts/rtp-style-mc.mts [N=200] [perf=0.7]

import {
  createRoom, currentMoment, spotlightOf, useRead, lockIn, advance, skipRest,
  currentPosture, roomOdds, type RoomState,
} from '../src/engine/rtp/room.ts';
import { counterOf, type MomentStyle } from '../src/engine/rtp/moments.ts';
import { dailyChallengeOf, finishDailySeries } from '../src/engine/rtp/dailySeries.ts';

export type Strategy = MomentStyle | 'skip' | 'read';
export const STRATEGIES: Strategy[] = ['aggro', 'safe', 'smart', 'skip', 'read'];

export interface StratStats { win: number; rating: number; n: number }

function dateKeyAt(i: number): string {
  const d = new Date(Date.UTC(2026, 7, 1) + i * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function playWith(strategy: Strategy, dateKey: string, perf: number): { won: boolean; rating: number } {
  const ch = dailyChallengeOf(dateKey);
  let s: RoomState = createRoom(ch.save, ch.prep);
  if (strategy === 'skip') s = skipRest(s);
  let guard = 0;
  while (s.phase !== 'done' && guard++ < 400) {
    if (s.phase === 'decide') {
      const m = currentMoment(s);
      let opt = m.options.find((o) => o.style === strategy);
      if (strategy === 'read') {
        if (s.reads > 0 && !s.readUsed) s = useRead(s);
        const posture = currentPosture(s);
        const want = posture ? counterOf(posture) : null;
        // postura revelada → o estilo que a vence; sem leitura → a melhor odd.
        opt = (want && m.options.find((o) => o.style === want))
          ?? [...m.options].sort((a, b) => roomOdds(s, b).total - roomOdds(s, a).total)[0];
      }
      opt ??= m.options[0];
      s = lockIn(s, opt.id, spotlightOf(s) ? perf : null).state;
    } else {
      s = advance(s);
    }
  }
  const r = finishDailySeries(ch, s.final!.outcomes, s.final!.liveMaps);
  return { won: r.won, rating: r.heroRating };
}

export function runStyleMc(n = 200, perf = 0.7, strategies: Strategy[] = STRATEGIES): Record<Strategy, StratStats> {
  const out = {} as Record<Strategy, StratStats>;
  for (const st of strategies) {
    let w = 0, r = 0;
    for (let i = 0; i < n; i++) {
      const res = playWith(st, dateKeyAt(i), perf);
      if (res.won) w++;
      r += res.rating;
    }
    out[st] = { win: w / n, rating: r / n, n };
  }
  return out;
}

// A domina B quando é MELHOR OU IGUAL nas duas métricas e estritamente melhor
// em pelo menos uma (com uma folga pro ruído do Monte Carlo).
export function dominates(a: StratStats, b: StratStats, eps = { win: 0.005, rating: 0.002 }): boolean {
  const winGe = a.win >= b.win - eps.win, ratGe = a.rating >= b.rating - eps.rating;
  const winGt = a.win > b.win + eps.win, ratGt = a.rating > b.rating + eps.rating;
  return winGe && ratGe && (winGt || ratGt);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] ?? 200);
  const perf = Number(process.argv[3] ?? 0.7);
  const res = runStyleMc(n, perf);
  for (const [k, v] of Object.entries(res)) console.log(`${k.padEnd(6)} vitória ${(v.win * 100).toFixed(1)}%  rating ${v.rating.toFixed(3)}`);
}
