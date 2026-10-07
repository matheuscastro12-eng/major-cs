// MOMENTOS-CHAVE de um round, lidos do que o motor já decidiu (killFeed,
// roundLog, compras). Puro e determinístico: vira o card "momento do jogo" e a
// lista de destaques (o modo "só destaques" do radar toca só esses rounds).

import type { KillEvent } from '../../types';
import type { BuyTier } from '../../engine/match';

export type MomentKind = 'ace' | 'clutch' | 'multi' | 'eco' | 'comeback' | 'pistol';

export interface Moment {
  kind: MomentKind;
  round: number;          // 0-based
  team: 0 | 1;            // time que fez o momento
  playerId: string | null;
  weight: number;         // ordena o "momento do jogo" (maior = mais forte)
  vs?: number;            // clutch 1vN
  kills?: number;         // multi-kill
}

export interface MomentInput {
  round: number;
  kills: KillEvent[];               // killFeed deste round
  winner: 0 | 1;
  roundLog: (0 | 1)[];              // log do mapa ATÉ este round (inclusive)
  buys?: [BuyTier, BuyTier] | null; // compras deste round
}

const ECO_LIKE: BuyTier[] = ['eco', 'force'];

export function detectMoments(inp: MomentInput): Moment[] {
  const out: Moment[] = [];
  const { kills, winner, round } = inp;

  // multi-kill / ace
  const per = new Map<string, { n: number; team: 0 | 1 }>();
  for (const k of kills) {
    const c = per.get(k.killerId) ?? { n: 0, team: k.killerTeam };
    c.n++;
    per.set(k.killerId, c);
  }
  for (const [id, c] of per) {
    if (c.n >= 5) out.push({ kind: 'ace', round, team: c.team, playerId: id, weight: 100, kills: c.n });
    else if (c.n >= 3) out.push({ kind: 'multi', round, team: c.team, playerId: id, weight: c.n === 4 ? 60 : 35, kills: c.n });
  }

  // clutch: o time vencedor ficou com 1 vivo contra 2+ e venceu
  // vivos por contagem (5 − mortes de cada lado, na ordem do killFeed)
  let wAlive = 5, lAlive = 5;
  let clutchVs = 0;
  let clutcher: string | null = null;
  for (const k of kills) {
    if (k.victimTeam === winner) wAlive--; else lAlive--;
    if (wAlive === 1 && lAlive >= 2 && !clutchVs) clutchVs = lAlive;
  }
  if (clutchVs) {
    // o clutcher é quem matou depois de o time ficar sozinho (ou o último vencedor a matar)
    let w = 5;
    for (const k of kills) {
      if (k.victimTeam === winner) w--;
      if (w === 1 && k.killerTeam === winner) clutcher = k.killerId;
    }
    if (!clutcher) {
      const wk = kills.filter((k) => k.killerTeam === winner);
      clutcher = wk.length ? wk[wk.length - 1].killerId : null;
    }
    out.push({ kind: 'clutch', round, team: winner, playerId: clutcher, weight: 50 + clutchVs * 15, vs: clutchVs });
  }

  // eco vencido: venceu de eco/force contra compra cheia
  if (inp.buys) {
    const wb = inp.buys[winner], lb = inp.buys[winner === 0 ? 1 : 0];
    if (ECO_LIKE.includes(wb) && lb === 'full') out.push({ kind: 'eco', round, team: winner, playerId: topKiller(kills, winner), weight: wb === 'eco' ? 55 : 30 });
    if (wb === 'pistol') out.push({ kind: 'pistol', round, team: winner, playerId: topKiller(kills, winner), weight: 12 });
  }

  // virada: o vencedor esteve 4+ atrás no mapa e agora passa à frente pela 1ª vez
  const log = inp.roundLog;
  if (log.length) {
    let a = 0, b = 0, worst = 0, ledBefore = false;
    for (let i = 0; i < log.length - 1; i++) {
      if (log[i] === 0) a++; else b++;
      const diff = winner === 0 ? a - b : b - a;
      worst = Math.min(worst, diff);
      if (diff > 0 && worst <= -4) ledBefore = true;
    }
    if (log[log.length - 1] === 0) a++; else b++;
    const now = winner === 0 ? a - b : b - a;
    if (worst <= -4 && now === 1 && !ledBefore) out.push({ kind: 'comeback', round, team: winner, playerId: null, weight: 45 - worst });
  }

  return out.sort((x, y) => y.weight - x.weight);
}

function topKiller(kills: KillEvent[], team: 0 | 1): string | null {
  const c = new Map<string, number>();
  for (const k of kills) if (k.killerTeam === team) c.set(k.killerId, (c.get(k.killerId) ?? 0) + 1);
  let best: string | null = null, bn = 0;
  for (const [id, v] of c) if (v > bn) { best = id; bn = v; }
  return best;
}

/** Round "destaque" (o modo só destaques toca estes em velocidade normal). */
export function isHighlight(ms: Moment[]): boolean {
  return ms.length > 0;
}
