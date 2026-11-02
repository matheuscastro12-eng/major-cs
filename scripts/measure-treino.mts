// [fase 2 · treino] Medição do treino semanal: ganho de atributo por temporada
// para cada perfil de treino e taxa de lesão por intensidade.
// Roda: `npx tsx scripts/measure-treino.mts` (não é teste; os portões ficam em
// scripts/test-gestao-treino.mts).
//
// Modelo da temporada da Carreira: 3 splits × ~10 séries (1 série = 1 semana de
// treino); cada série custa a fadiga média do motor antigo (4 + 2,5 mapas × 2);
// folga de 16 entre etapas (a cada ~3 semanas), 40 no fim do split.

import { deriveAttrs, ovrFromAttrs, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import { evolveAttrs, ATTR_CLASS } from '../src/engine/attrs/progression.ts';
import type { AttrKey } from '../src/engine/attributes.ts';
import {
  defaultTrainingState, runTrainingWeek, trainingGrowthMul, recoverCondition, defaultCondition, closeTrainingSplit,
} from '../src/engine/gestao/treino.ts';
import { defaultTactics } from '../src/engine/gestao/tatica.ts';
import type { IndividualFocus, PlayerCondition, TrainingIntensity, TrainingSession, TrainingState } from '../src/engine/gestao/model.ts';
import type { Role } from '../src/types.ts';

const WEEKS_PER_SPLIT = 10;
const SERIES_FATIGUE = 9;

interface Profile { name: string; week: TrainingSession[]; intensity: TrainingIntensity; focus?: (role: Role) => IndividualFocus; }
const P = (name: string, week: TrainingSession[], intensity: TrainingIntensity = 'normal', extra: Partial<Profile> = {}): Profile => ({ name, week, intensity, ...extra });
const DEF: TrainingSession[] = ['aim', 'tactics', 'scrim', 'vod', 'utility', 'physical', 'rest'];
const PROFILES: Profile[] = [
  P('Padrão · normal', DEF),
  P('Padrão · leve', DEF, 'low'),
  P('Padrão · intensa', DEF, 'high'),
  P('Mecânica (4× mira)', ['aim', 'aim', 'aim', 'aim', 'utility', 'physical', 'rest']),
  P('Tática (tática/VOD)', ['tactics', 'tactics', 'vod', 'vod', 'utility', 'scrim', 'rest']),
  P('Recuperação (4 folgas)', ['aim', 'tactics', 'vod', 'rest', 'rest', 'rest', 'rest']),
  P('Padrão + foco em Mira', DEF, 'normal', { focus: () => ({ kind: 'attr', attr: 'aim' })}),
  P('Padrão + foco na função', DEF, 'normal', { focus: (role) => ({ kind: 'role', role }) }),
];

const ROLES: Role[] = ['Rifler', 'Entry', 'AWP', 'IGL', 'Support', 'Lurker'];
function cohort(): { id: string; age: number; role: Role; x: PlayerAttrs }[] {
  const out = [];
  for (let i = 0; i < 90; i++) {
    const age = [18, 21, 25][i % 3];
    const role = ROLES[i % ROLES.length];
    const lvl = 68 + (i % 7);
    const id = `m${i}`;
    out.push({ id, age, role, x: deriveAttrs({ id, role, age, aim: lvl + 2, awp: role === 'AWP' ? lvl + 4 : lvl - 14, igl: role === 'IGL' ? lvl + 2 : lvl - 10, clutch: lvl - 1, consistency: lvl }) });
  }
  return out;
}

function seasonGain(pr: Profile) {
  const ps = cohort();
  let net = 0, ovr = 0, focused = 0, mech = 0, ment = 0, n = 0;
  for (const p of ps) {
    let x = p.x;
    const ovr0 = ovrFromAttrs(x);
    const a0 = { ...x.a };
    for (let split = 1; split <= 3; split++) {
      let t: TrainingState = { ...defaultTrainingState(), week: pr.week, intensity: pr.intensity, focus: pr.focus ? { [p.id]: pr.focus(p.role) } : {} };
      let cond: Record<string, PlayerCondition> = { [p.id]: defaultCondition() };
      for (let w = 0; w < WEEKS_PER_SPLIT; w++) {
        // sem lesão nesta medição (ganho puro por perfil): condição sempre ok
        const r = runTrainingWeek({ training: t, condition: cond, tactics: defaultTactics(), players: [{ id: p.id, nick: p.id }], maps: { [p.id]: 2 }, split });
        t = r.training;
        cond = { [p.id]: { ...r.condition[p.id], injury: null } };
      }
      const mul = trainingGrowthMul(t.progress?.[p.id], t.weeks);
      const r = evolveAttrs(x, { playerId: p.id, split, age: p.age, role: p.role, trainMul: mul });
      x = r.attrs;
      t = closeTrainingSplit(t);
    }
    for (const k of Object.keys(x.a) as AttrKey[]) {
      const d = x.a[k] - a0[k];
      net += d;
      if (ATTR_CLASS[k] === 'mechanical' || ATTR_CLASS[k] === 'reflex') mech += d; else ment += d;
    }
    focused += x.a.aim - a0.aim;
    ovr += ovrFromAttrs(x) - ovr0;
    n++;
  }
  return { net: net / n, ovr: ovr / n, mech: mech / n, ment: ment / n, focused: focused / n };
}

function injuryRate(intensity: TrainingIntensity, seasons = 300) {
  let injuries = 0, burnouts = 0, fitSum = 0, fitN = 0, weeksOut = 0;
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
  for (let s = 0; s < seasons; s++) {
    let cond: Record<string, PlayerCondition> = Object.fromEntries(ids.map((id) => [id, defaultCondition()]));
    let t: TrainingState = { ...defaultTrainingState(), intensity, weekNo: s * 1000 };
    for (let split = 1; split <= 3; split++) {
      for (let w = 0; w < WEEKS_PER_SPLIT; w++) {
        // série da semana: quem está bem joga (fadiga média do motor antigo)
        const maps: Record<string, number> = {};
        for (const id of ids) {
          const c = cond[id];
          if (c.injury && c.injury.weeksLeft > 0) continue;
          maps[id] = 2.5;
          cond[id] = { ...c, fitness: Math.max(0, c.fitness - SERIES_FATIGUE) };
        }
        const r = runTrainingWeek({
          training: t, condition: cond, tactics: defaultTactics(),
          players: ids.map((id, i) => ({ id, nick: id, proneness: 6 + i * 2 })), maps, split: s * 10 + split,
        });
        t = r.training;
        cond = r.condition;
        for (const inj of r.report.injuries) { injuries++; if (inj.kind === 'burnout') burnouts++; weeksOut += inj.weeks; }
        for (const id of ids) { fitSum += cond[id].fitness; fitN++; }
        if (w % 3 === 2) cond = recoverCondition(cond, 16);
      }
      cond = recoverCondition(cond, 40);
      t = closeTrainingSplit(t);
    }
  }
  return { perSeason: injuries / seasons, burnoutPerSeason: burnouts / seasons, perPlayerWeek: injuries / (seasons * 30 * 5), avgFitness: fitSum / fitN, weeksOutPerSeason: weeksOut / seasons };
}

console.log('# Ganho de atributo por temporada (3 splits × 10 semanas; 90 jogadores de 18/21/25 anos)');
console.log('perfil'.padEnd(28), 'Σatrib'.padStart(7), 'OVR'.padStart(6), 'mec+ref'.padStart(8), 'mental'.padStart(7), 'Mira'.padStart(6));
for (const pr of PROFILES) {
  const g = seasonGain(pr);
  console.log(pr.name.padEnd(28), g.net.toFixed(2).padStart(7), g.ovr.toFixed(2).padStart(6), g.mech.toFixed(2).padStart(8), g.ment.toFixed(2).padStart(7), g.focused.toFixed(2).padStart(6));
}
console.log('\n# Lesão por intensidade (time de 5, temporada = 30 semanas, agenda padrão)');
for (const it of ['low', 'normal', 'high'] as TrainingIntensity[]) {
  const r = injuryRate(it);
  console.log(it.padEnd(8), `lesões/temporada ${r.perSeason.toFixed(2)}`, `(burnout ${r.burnoutPerSeason.toFixed(2)})`, `por jogador-semana ${(r.perPlayerWeek * 100).toFixed(2)}%`, `semanas fora/temporada ${r.weeksOutPerSeason.toFixed(1)}`, `fitness médio ${r.avgFitness.toFixed(1)}`);
}
