// NEUTRALIDADE DA FASE 3 · VESTIÁRIO — quem não configura nada (elenco de 5,
// sem escalação, sem status) tem que jogar e se sentir como antes.
//
//   1. MOTOR: sem escalação salva, o motor joga os 5 primeiros do elenco — o
//      mesmo time de antes (checado aqui jogador a jogador em todos os times reais).
//   2. MORAL NO MOTOR: a moral já entrava pela forma (moraleForm, ±7%). Medimos
//      o efeito: vitória em MD3 contra time de força parecida com o elenco todo
//      na moral X (mesmas sementes, só a moral muda).
//   3. FELICIDADE: satisfação do modelo único × a de antes (5 fatores) num elenco
//      de 5 sem nada configurado (todo mundo joga tudo), times reais, tier 3 e 1.
//   4. PERSONALIDADE: tipo antigo por hash × derivado dos ocultos — distribuição e
//      o delta médio de moral por split (personalityMoraleDelta).
//
//   npx tsx scripts/measure-vestiario.mts [séries=1200] [--json]

import { simulateSeries } from '../src/engine/match.ts';
import { makeRng } from '../src/engine/rng.ts';
import { MAP_POOL, type MapId, type TTeam } from '../src/types.ts';
import { realTeams } from './calibrate-engine.mts';
import { computeHappiness, moraleForm } from '../src/engine/career/happiness.ts';
import {
  defaultDressingRoom, resolveLineup, statusesOf, socialGroups, toVPlayer, playTimeScore, roleScore, staffScore, socialScore, ambitionScore,
} from '../src/engine/clube/vestiario.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { derivePersonality, hashPersonality, personalityMoraleDelta, setPersonalitySource, type PlayerPersonality } from '../src/engine/career/personality.ts';

export interface VestiarioNeutrality {
  sameFive: { teams: number; identical: number };
  morale: { morale: number; form: number; win: number; diff: number }[];
  happiness: { tier: number; before: number; after: number; diff: number; maxAbs: number }[];
  personality: { oldDist: Record<PlayerPersonality, number>; newDist: Record<PlayerPersonality, number>; deltaOld: number; deltaNew: number };
}

function winRate(series: number, moraleValue: number, seed = 4242): number {
  const all = realTeams().sort((a, b) => b.strength - a.strength).slice(0, 60);
  let w = 0;
  for (let k = 0; k < series; k++) {
    const base = all[(k * 7) % all.length];
    const opps = all.filter((t) => t.id !== base.id && Math.abs(t.strength - base.strength) <= 6);
    const opp = opps[(k * 13) % opps.length];
    const user: TTeam = { ...base, id: 'user', isUser: true, players: base.players.map((p) => ({ ...p, id: `user__${p.id}`, form: moraleForm(moraleValue) })) };
    const maps = [0, 1, 2].map((i) => ({ map: MAP_POOL[(k * 2 + i * 3) % 7] as MapId, pickedBy: -1 as const }));
    const r = simulateSeries(makeRng((Math.imul(seed + k, 2654435761) >>> 0)), user, opp, maps, 3);
    if (r.winner === 0) w++;
  }
  return w / series;
}

export function measureVestiario(series = 1200): VestiarioNeutrality {
  // 1. mesmo cinco
  const teams = CS2_REAL_2026.filter((t) => t.players.length >= 5);
  let identical = 0;
  for (const t of teams) {
    const ids = t.players.slice(0, 5).map((p) => p.id);
    const lu = resolveLineup(ids, defaultDressingRoom().lineup);
    if (lu.starters.join() === ids.join() && lu.bench.length === 0) identical++;
  }
  // 2. moral no motor
  const neutral = winRate(series, 70);
  const morale = [30, 50, 70, 85, 100].map((m) => {
    const win = m === 70 ? neutral : winRate(series, m);
    return { morale: m, form: moraleForm(m), win, diff: win - neutral };
  });
  // 3. felicidade: antes (5 fatores) × depois (modelo único), elenco de 5, todos jogam tudo
  const happiness = [3, 1].map((tier) => {
    let sb = 0, sa = 0, n = 0, maxAbs = 0;
    for (const t of teams.slice(0, 120)) {
      const vps = t.players.slice(0, 5).map((p) => toVPlayer({ ...p }, { ovr: 75, age: p.age ?? 24, tenure: 2 }));
      const st = statusesOf(defaultDressingRoom(), vps);
      const groups = socialGroups(vps);
      for (const vp of vps) {
        const base = { ratings: [1.0, 1.02], results01: 0.5, contractSplitsLeft: 2, bond: 50, chemistry: 50 };
        const before = computeHappiness(base).overall;
        const after = computeHappiness({
          ...base, playTime: playTimeScore(1, st[vp.id]), role: roleScore(vp.role, vp.role2, undefined),
          staff: staffScore(1), social: socialScore(vp.id, groups, []), ambition: ambitionScore(vp.ambition, tier),
        }).overall;
        sb += before; sa += after; n++; maxAbs = Math.max(maxAbs, Math.abs(after - before));
      }
    }
    return { tier, before: sb / n, after: sa / n, diff: (sa - sb) / n, maxAbs };
  });
  // 4. personalidade
  const players = CS2_REAL_2026.flatMap((t) => t.players);
  const byId = new Map(players.map((p) => [p.id, p]));
  const zero = (): Record<PlayerPersonality, number> => ({ leader: 0, mercenary: 0, prodigy: 0, hothead: 0, resilient: 0 });
  const oldDist = zero(), newDist = zero();
  for (const p of players) { oldDist[hashPersonality(p.id)]++; newDist[derivePersonality(p).legacy]++; }
  const ctxs = [
    { champion: false, objectiveMet: false, expiring: false },
    { champion: false, objectiveMet: true, expiring: false },
    { champion: true, objectiveMet: true, expiring: false },
    { champion: false, objectiveMet: false, expiring: true },
  ];
  const avgDelta = () => ctxs.reduce((s, c) => s + players.reduce((a, p) => a + personalityMoraleDelta(p.id, c), 0) / players.length, 0) / ctxs.length;
  setPersonalitySource(null);
  const deltaOld = avgDelta();
  setPersonalitySource((id) => byId.get(id) ?? null);
  const deltaNew = avgDelta();
  setPersonalitySource(null);
  return { sameFive: { teams: teams.length, identical }, morale, happiness, personality: { oldDist, newDist, deltaOld, deltaNew } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 1200);
  const r = measureVestiario(n);
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
    console.log(`1. mesmo cinco sem escalação: ${r.sameFive.identical}/${r.sameFive.teams} times`);
    console.log(`2. moral no motor (${n} séries MD3 vs força ±6, mesmas sementes):`);
    for (const m of r.morale) console.log(`   moral ${m.morale}: forma ×${m.form.toFixed(3)} → vitória ${pct(m.win)} (${m.diff >= 0 ? '+' : ''}${(m.diff * 100).toFixed(1)} pp)`);
    console.log('3. felicidade (elenco de 5, sem configurar nada): antes × modelo único');
    for (const h of r.happiness) console.log(`   tier ${h.tier}: ${h.before.toFixed(1)} → ${h.after.toFixed(1)} (Δ ${h.diff >= 0 ? '+' : ''}${h.diff.toFixed(2)}; maior |Δ| ${h.maxAbs})`);
    console.log(`4. personalidade: antes ${JSON.stringify(r.personality.oldDist)} · depois ${JSON.stringify(r.personality.newDist)}`);
    console.log(`   delta médio de moral por split (4 contextos): antes ${r.personality.deltaOld.toFixed(2)} · depois ${r.personality.deltaNew.toFixed(2)}`);
  }
}
