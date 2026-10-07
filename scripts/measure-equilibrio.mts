// [equilíbrio] Números do espelho (o mesmo elenco como seu time × como IA, MD3)
// por modo e plano, e o efeito do técnico. Os portões ficam em
// scripts/test-equilibrio.mts; isto só imprime.
//
//   npx tsx scripts/measure-equilibrio.mts [séries por elenco=400]
import type { Coach } from '../src/types.ts';
import { MODE_AI_EDGE, coachForMatch } from '../src/engine/career/equilibrio.ts';
import { headCoachFromCoach } from '../src/engine/gestao/staff.ts';
import { mirror } from './lib/equilibrio-harness.mts';

const N = Number(process.argv[2] ?? 400);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`espelho MD3 · ${N} séries × 8 elencos por linha`);
console.log(`sem vantagem, sem plano            ${pct(mirror(null, 'none', N))}`);
for (const mode of ['normal', 'hard', 'legend'] as const) {
  for (const plan of ['none', 'disciplined', 'aggressive'] as const) {
    console.log(`${mode.padEnd(7)} (IA +${MODE_AI_EDGE[mode].toFixed(1)}) ${plan.padEnd(12)} ${pct(mirror(mode, plan, N))}`);
  }
}
const mk = (nota: number): Coach => ({ nick: `c${nota}`, name: 'C', country: 'br', rating: 45 + (nota - 3) * 3, style: 'tactical' });
for (const nota of [5, 10, 14, 18]) {
  const c = mk(nota);
  console.log(`técnico nota ${String(nota).padStart(2)} (rating ${c.rating})   ${pct(mirror(null, 'none', N, () => coachForMatch(c, headCoachFromCoach(c, 'k'))))}`);
}
