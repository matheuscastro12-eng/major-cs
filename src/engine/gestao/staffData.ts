// [fase 2 · frente STAFF] Comissão técnica × base real (bo3-2026). Só a Carreira
// importa este módulo (a base entra no chunk da carreira, nunca no bundle
// inicial — o `staff.ts` puro é que vai para a migração do save).
//
//   - aposentados (`__retired__`) viram candidatos no mercado de staff;
//   - cada clube da IA tem comissão coerente com o tier (ranking de força da
//     base): técnico real + staff em torno da média do tier, e um delta de força
//     pequeno (|δ| ≤ 0,5, média ~0 dentro do tier) — `aiStaffEdgeFor`.
import { CS2_REAL_2026 } from '../../data/bo3';
import { macroRegionOf, type MacroRegion } from '../../data/regions';
import { attrsOf } from '../attrs/model';
import { teamSeasonToTTeam } from '../ratings';
import type { TeamSeason } from '../../types';
import type { StaffState } from './model';
import { aiStaffEdge, generateAiStaff, type RetiredSource } from './staff';

let retiredCache: RetiredSource[] | null = null;
/** Ex-jogadores aposentados da base, com os atributos 1–20 (fonte da verdade). */
export function retiredStaffSources(): RetiredSource[] {
  if (retiredCache) return retiredCache;
  const team = CS2_REAL_2026.find((t) => t.id === '__retired__');
  retiredCache = (team?.players ?? []).map((p) => ({
    id: p.id, nick: p.nick, name: p.name, country: p.country, age: p.age, role: p.role,
    a: attrsOf(p).a,
  }));
  return retiredCache;
}

// Tier do clube da IA pela força na base (proxy do orçamento): top 24 = tier 1,
// próximos 40 = tier 2, o resto tier 3.
let tierCache: Map<string, 1 | 2 | 3> | null = null;
function tierMap(): Map<string, 1 | 2 | 3> {
  if (tierCache) return tierCache;
  const ranked = CS2_REAL_2026
    .filter((t) => !t.defunct && !t.id.startsWith('__') && t.players.length >= 5)
    .map((t) => ({ id: t.id, s: teamSeasonToTTeam(t).strength }))
    .sort((a, b) => b.s - a.s);
  tierCache = new Map(ranked.map((x, i) => [x.id, i < 24 ? 1 : i < 64 ? 2 : 3]));
  return tierCache;
}
export function aiTierOf(teamId: string): 1 | 2 | 3 {
  return tierMap().get(teamId) ?? 3;
}

const regionOfTeam = (ts: TeamSeason): MacroRegion => {
  const counts = new Map<MacroRegion, number>();
  for (const p of ts.players) { const r = macroRegionOf(p.country); if (r) counts.set(r, (counts.get(r) ?? 0) + 1); }
  let best: MacroRegion = macroRegionOf(ts.country) ?? 'europe', n = 0;
  for (const [r, c] of counts) if (c > n) { best = r; n = c; }
  return best;
};

const staffCache = new Map<string, StaffState>();
/** Comissão (determinística) de um clube da IA. */
export function aiStaffFor(ts: TeamSeason): StaffState {
  const hit = staffCache.get(ts.id);
  if (hit) return hit;
  const s = generateAiStaff(ts.id, ts.coach, aiTierOf(ts.id), regionOfTeam(ts));
  staffCache.set(ts.id, s);
  return s;
}

/** Delta de força do clube da IA pela comissão (somar em `TTeam.strength`). */
export function aiStaffEdgeFor(ts: TeamSeason): number {
  if (ts.id === 'user' || ts.id.startsWith('__')) return 0;
  return aiStaffEdge(aiStaffFor(ts), ts.id, aiTierOf(ts.id));
}
