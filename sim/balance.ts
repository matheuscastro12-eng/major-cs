// Harness de simulação pra validar o balanceamento (rodado fora do app via esbuild+node).
import { CS2_REAL_2026 } from '../src/data/bo3';
import { teamSeasonToTTeam } from '../src/engine/ratings';
import { simulateSeries } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { MAP_POOL } from '../src/types';
import type { TTeam, MapId } from '../src/types';

const MAPS = MAP_POOL.map((m): { map: MapId; pickedBy: -1 } => ({ map: m, pickedBy: -1 }));

let seedCtr = 1;
function series(a: TTeam, b: TTeam, bestOf: 1 | 3 | 5): 0 | 1 {
  const rng = makeRng(seedCtr++ * 2654435761);
  return simulateSeries(rng, a, b, MAPS, bestOf).winner;
}
function winRate(a: TTeam, b: TTeam, bestOf: 1 | 3 | 5, n: number): number {
  let w = 0;
  for (let i = 0; i < n; i++) if (series(a, b, bestOf) === 0) w++;
  return w / n;
}

const teams = CS2_REAL_2026.map(teamSeasonToTTeam).sort((x, y) => y.strength - x.strength);
const withStrength = (base: TTeam, s: number): TTeam => ({ ...base, strength: s });

console.log('=== força das equipes (TTeam.strength) ===');
console.log('top5:', teams.slice(0, 5).map((t) => `${t.tag} ${t.strength.toFixed(1)}`).join(' '));
console.log('mediana:', teams[Math.floor(teams.length / 2)].strength.toFixed(1), '| min:', teams[teams.length - 1].strength.toFixed(1));

console.log('\n=== curva força→vitória (time-base clonado, gap controlado) ===');
const base = teams[Math.floor(teams.length / 2)];
const S = 80;
console.log('gap | BO1   BO3   (win% do time mais forte)');
for (const gap of [0, 2, 4, 6, 8, 10, 14, 20]) {
  const a = withStrength(base, S + gap);
  const b = withStrength(base, S);
  const bo1 = winRate(a, b, 1, 4000);
  const bo3 = winRate(a, b, 3, 3000);
  console.log(`+${String(gap).padStart(2)} | ${(bo1 * 100).toFixed(0).padStart(3)}%  ${(bo3 * 100).toFixed(0).padStart(3)}%`);
}

console.log('\n=== upset: quão fácil o mais fraco vira a série (BO3) ===');
for (const gap of [4, 8, 12]) {
  const a = withStrength(base, S + gap), b = withStrength(base, S);
  console.log(`gap +${gap}: time fraco ganha ${((1 - winRate(a, b, 3, 4000)) * 100).toFixed(0)}% dos BO3`);
}

// torneio: single-elim de 16 (BO3) + final BO5, seedeado por força. Mede a
// distribuição de colocação de um time conforme sua força relativa ao field.
function singleElim(field: TTeam[], rng: () => number): { championId: string; finalists: Set<string> } {
  let bracket = [...field];
  const finalists = new Set<string>();
  while (bracket.length > 1) {
    const next: TTeam[] = [];
    const bestOf: 1 | 3 | 5 = bracket.length === 2 ? 5 : 3;
    for (let i = 0; i < bracket.length; i += 2) {
      const a = bracket[i], b = bracket[i + 1];
      if (bracket.length === 2) { finalists.add(a.id); finalists.add(b.id); }
      const r = simulateSeries(rng, a, b, MAPS, bestOf);
      next.push(r.winner === 0 ? a : b);
    }
    bracket = next;
  }
  return { championId: bracket[0].id, finalists };
}

console.log('\n=== distribuição de colocação por força do time num field tier-1 (top 16) ===');
const t1Field = teams.slice(0, 16);
// substitui o time da posição p por um "usuário" de força U e mede campeão/final
function careerOutcome(userStrength: number, field: TTeam[], n: number) {
  const user = withStrength(field[0], userStrength);
  user.id = 'USER';
  user.isUser = true; // pra valer o AI_EDGE (a IA leva o bônus de dificuldade contra o usuário)
  const f = [user, ...field.slice(1)];
  let champ = 0, fin = 0;
  for (let i = 0; i < n; i++) {
    const rng = makeRng(seedCtr++ * 40503);
    // re-seeda a ordem do bracket por sim (seed determinístico)
    const shuffled = [...f].sort((x, y) => (makeRng(hashId(x.id) + i)() - makeRng(hashId(y.id) + i)()));
    const { championId, finalists } = singleElim(shuffled, rng);
    if (championId === 'USER') champ++;
    if (finalists.has('USER')) fin++;
  }
  return { champ: champ / n, fin: fin / n };
}
function hashId(s: string): number { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

const fieldAvg = t1Field.reduce((a, t) => a + t.strength, 0) / t1Field.length;
const fieldTop = t1Field[0].strength;
console.log(`field tier-1: top ${fieldTop.toFixed(1)} | média ${fieldAvg.toFixed(1)}`);
console.log('força do user | campeão%  final%');
for (const us of [fieldAvg - 6, fieldAvg - 2, fieldAvg + 2, fieldAvg + 6, fieldTop + 4]) {
  const o = careerOutcome(us, t1Field, 2000);
  console.log(`${us.toFixed(1).padStart(12)} | ${(o.champ * 100).toFixed(1).padStart(6)}%  ${(o.fin * 100).toFixed(1).padStart(5)}%`);
}
