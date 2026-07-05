// Ultimate Squad P6 — leaderboard de IA (offline): ladder com os NOMES REAIS
// dos jogadores (elo derivado do OVR). Puro/determinístico (seed).
// O "bazar diário" (listagens fake de IA) que morava aqui foi REMOVIDO em
// favor do Mercado de Jogadores P2P real (iter38) — o mercado agora é 100%
// entre managers. Ver docs-but-map.md §4 (P6).

import { makeRng } from '../rng';

export interface AiPlayer { id: string; nick: string; country: string; elo: number; w: number; l: number }

export interface LadderSeed { nick: string; country: string; ovr: number }

// ladder de IA a partir do pool real: cada pro vira um rival com elo ~ f(OVR).
export function buildAiLadder(pool: LadderSeed[], seed: number): AiPlayer[] {
  const rng = makeRng((seed >>> 0) || 1);
  const out: AiPlayer[] = [];
  for (const p of pool) {
    const base = 900 + (p.ovr - 70) * 42;                 // OVR 70→900, 95→1950
    const elo = Math.max(600, Math.round(base + (rng() * 2 - 1) * 110));
    const games = 25 + Math.floor(rng() * 75);
    const wrTarget = 0.35 + (p.ovr - 70) / 55 + (rng() * 0.2 - 0.1);
    const wr = Math.max(0.15, Math.min(0.9, wrTarget));
    const w = Math.round(games * wr);
    out.push({ id: `ai_${p.nick.toLowerCase()}`, nick: p.nick, country: p.country, elo, w, l: Math.max(0, games - w) });
  }
  return out.sort((a, b) => b.elo - a.elo);
}
