// [evolução · out/2026] CURVA ÚNICA, continuidade na troca de clube, potencial
// honesto e a curva recalibrada (engine/attrs/progression.ts,
// engine/career/worldEvo.ts, engine/career/potential.ts).
// Roda: `tsx --test scripts/test-evolucao.mts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { Player } from '../src/types.ts';
import { playerOvr } from '../src/engine/ratings.ts';
import { attrsOf, caFromOvr, ovrFromAttrs, withAttrs, deriveAttrs, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import { evolveAttrs, perfMul } from '../src/engine/attrs/progression.ts';
import { applyAttrDelta, attrDelta, type AttrDelta } from '../src/engine/career/attrEvo.ts';
import {
  aiClock, aiPotentialOvr, aiSlotPlayer, baseAge, buildAiWorld, evolvedExtras, regenPotOvr,
} from '../src/engine/career/aiWorld.ts';
import { effectiveAge } from '../src/engine/career/playerAge.ts';
import { migrateWorldEvo, replayAttrs, replaySteps, worldEvoEntry, clearReplayMemo } from '../src/engine/career/worldEvo.ts';
import { careerPotentialOvr } from '../src/engine/career/potential.ts';
import { parseRegenPlayerId } from '../src/engine/career/signings.ts';
import { SPLITS_PER_YEAR } from '../src/engine/clock.ts';
import { declinePerYear, youthShare } from './lib/evolucaoCurva.ts';
import { academyGrowthMul, projectAcademyOvr } from '../src/engine/career/academyGrowth.ts';

const NS = new Set<string>();
const TEAMS = CS2_REAL_2026.filter((t) => t.id !== '__free__' && t.players.length >= 5);

/** O evolveSquad da Carreira em contexto NEUTRO (sem treino, sem rodagem
 *  registrada, sem rating, CT nível 0): a mesma conta, split a split. */
function squadNeutral(base: Player, upto: number, from = 1, start?: AttrDelta): PlayerAttrs {
  let delta: AttrDelta = start ?? {};
  for (let s = from; s < upto; s++) {
    const current = applyAttrDelta(attrsOf(base), delta);
    const pot = careerPotentialOvr({}, withAttrs(base, current));
    const r = evolveAttrs({ ...current, pa: Math.max(current.ca, caFromOvr(pot)) }, {
      playerId: base.id, split: s, age: effectiveAge(base, s), role: base.role,
    });
    delta = attrDelta(r.attrs.a, attrsOf(base).a);
  }
  return applyAttrDelta(attrsOf(base), delta);
}

test('replay da IA = evolveSquad em contexto neutro (atributo a atributo)', () => {
  let checked = 0;
  for (const t of TEAMS.slice(0, 24)) {
    for (const p of t.players.slice(0, 5)) {
      const a0 = baseAge(p);
      const clock = aiClock(1, a0, aiPotentialOvr(p.id, playerOvr(p), a0));
      for (const split of [2, 5, 9]) {
        assert.deepEqual(replayAttrs(p, split, clock).a, squadNeutral(p, split).a, `${p.id} no split ${split}`);
      }
      checked++;
    }
  }
  assert.ok(checked >= 100);
  // e o mundo montado (buildAiWorld) mostra exatamente esse jogador
  const w = buildAiWorld({ base: CS2_REAL_2026, split: 7, skip: NS });
  const byId = new Map(w.flatMap((t) => t.players.map((p) => [p.id, p] as const)));
  let same = 0;
  for (const t of TEAMS.slice(0, 24)) for (const p of t.players.slice(0, 5)) {
    const q = byId.get(p.id);
    if (!q) continue; // aposentou / foi substituído
    assert.deepEqual(attrsOf(q).a, squadNeutral(p, 7).a, `${p.id} no mundo`);
    same++;
  }
  assert.ok(same >= 90, `conferidos no mundo: ${same}`);
});

test('venda: a IA continua do estado da saída (OVR contínuo no split da troca)', () => {
  const T = TEAMS[3], B = TEAMS[10];
  const p = T.players.find((x) => baseAge(x) <= 23) ?? T.players[0];
  const exit = 9;
  // seu elenco: treino forte (foco, CT, agenda) por 8 splits — longe da curva neutra
  let x = attrsOf(p);
  for (let s = 1; s < exit; s++) {
    const pot = careerPotentialOvr({}, withAttrs(p, x));
    x = evolveAttrs({ ...x, pa: Math.max(x.ca, caFromOvr(pot)) }, {
      playerId: p.id, split: s, age: effectiveAge(p, s), role: p.role, focusPlayer: true, growthMul: 1.35, rating: 1.15,
    }).attrs;
  }
  const worldEvo = { [p.id]: worldEvoEntry(p, x, exit, careerPotentialOvr({}, withAttrs(p, x))) };
  const at = (split: number, we = worldEvo) => buildAiWorld({ base: CS2_REAL_2026, moves: { [p.id]: B.id }, split, skip: NS, worldEvo: we })
    .find((t) => t.id === B.id)!.players.find((q) => q.id === p.id)!;
  assert.equal(playerOvr(at(exit)), ovrFromAttrs(x), 'no split da venda o mundo tem o MESMO jogador');
  assert.deepEqual(attrsOf(at(exit)).a, x.a);
  const next = playerOvr(at(exit + 1));
  assert.ok(Math.abs(next - ovrFromAttrs(x)) <= 2, `split seguinte: ${ovrFromAttrs(x)} → ${next}`);
  // sem o worldEvo (o comportamento antigo) ele voltava à curva da base
  assert.notDeepEqual(attrsOf(at(exit, {})).a, x.a);
});

test('compra: o contratado chega com os atributos que o mercado mostrava', () => {
  const split = 8;
  const w = buildAiWorld({ base: CS2_REAL_2026, split, skip: NS });
  let checked = 0, regens = 0;
  for (const t of TEAMS.slice(0, 40)) {
    const team = w.find((x) => x.id === t.id);
    if (!team) continue;
    team.players.slice(0, 5).forEach((q) => {
      const rg = parseRegenPlayerId(q.id);
      let now: PlayerAttrs;
      if (rg) {
        // jovem da base: refeito pelo id (o findSigning) + relógio/teto da vaga
        const slot = aiSlotPlayer(t.players[rg.slot], t, rg.slot, rg.debut, new Set([q.id]));
        now = replayAttrs(slot, split, aiClock(rg.debut, rg.ageAtDebut, regenPotOvr(q.id, playerOvr(t.players[rg.slot]))));
        regens++;
      } else {
        const base = t.players.find((b) => b.id === q.id);
        if (!base) return;
        const a0 = baseAge(base);
        now = replayAttrs(base, split, aiClock(1, a0, aiPotentialOvr(base.id, playerOvr(base), a0)));
      }
      assert.deepEqual(now.a, attrsOf(q).a, `${q.id}: mercado ≠ contratado`);
      assert.equal(ovrFromAttrs(now), playerOvr(q));
      checked++;
    });
  }
  assert.ok(checked > 150, `conferidos ${checked}`);
});

test('newgen/academia vendidos: a cópia da venda segue pela curva única, sem salto', () => {
  const x = deriveAttrs({ id: 'ng.1.17.eu.900', role: 'Entry', age: 18, aim: 74, awp: 58, igl: 56, clutch: 70, consistency: 71 });
  const p: Player = withAttrs({ id: 'ng.1.17.eu.900', nick: 'kid', name: 'Kid', country: 'se', role: 'Entry', aim: 0, awp: 0, igl: 0, clutch: 0, consistency: 0 }, x);
  const list = [{ player: p, arrival: 6 }];
  const we = { [p.id]: { attrDelta: {}, split: 5, pot: 86 } };
  const atArrival = evolvedExtras(list, 6, we)![0].player;
  assert.equal(playerOvr(atArrival), playerOvr(p), 'na chegada: o mesmo jogador');
  const later = evolvedExtras(list, 10, we)![0].player;
  assert.ok(playerOvr(later) > playerOvr(p), 'jovem segue crescendo no comprador');
  assert.ok(playerOvr(later) <= 86, 'com o teto que tinha no seu elenco');
  for (let s = 7; s <= 10; s++) {
    const a = playerOvr(evolvedExtras(list, s - 1, we)![0].player), b = playerOvr(evolvedExtras(list, s, we)![0].player);
    assert.ok(Math.abs(b - a) <= 2, `split ${s}: ${a} → ${b}`);
  }
});

test('migração do worldEvo: idempotente, pela passagem encerrada e pelo declínio antigo', () => {
  const mid = TEAMS.flatMap((t) => t.players).filter((p) => playerOvr(p) >= 72 && playerOvr(p) <= 82);
  const base = mid[0], other = mid[1];
  const byId = new Map([[base.id, base], [other.id, other]]);
  const save = {
    split: 12, squad: [],
    stints: { [base.id]: [{ team: 'X', from: 2, to: 8, startOvr: playerOvr(base), endOvr: playerOvr(base) + 3 }] },
    evo: { [other.id]: -4 },
  };
  const m1 = migrateWorldEvo(save, byId);
  assert.equal(m1[base.id].split, 8);
  assert.equal(ovrFromAttrs(applyAttrDelta(attrsOf(base), m1[base.id].attrDelta)), playerOvr(base) + 3);
  assert.equal(ovrFromAttrs(applyAttrDelta(attrsOf(other), m1[other.id].attrDelta)), playerOvr(other) - 4);
  assert.deepEqual(migrateWorldEvo({ ...save, worldEvo: m1 }, byId), m1, 'rodar de novo não muda nada');
  assert.deepEqual(migrateWorldEvo({ ...save, squad: [{ playerId: base.id }, { playerId: other.id }] }, byId), {}, 'quem está no elenco não migra');
});

test('PA mostrado = teto usado na evolução e nunca abaixo do OVR', () => {
  for (const t of TEAMS.slice(0, 30)) for (const p of t.players.slice(0, 5)) {
    const a0 = baseAge(p);
    const cap = aiPotentialOvr(p.id, playerOvr(p), a0);
    const shown = careerPotentialOvr({}, p);
    assert.equal(shown, Math.max(playerOvr(p), cap), `${p.id}: mostrado ${shown} × teto ${cap}`);
    // o mesmo jogador evoluído: o teto não muda com a idade/OVR atuais
    const later = withAttrs(p, replayAttrs(p, 13, aiClock(1, a0, cap)));
    assert.equal(careerPotentialOvr({}, later), Math.max(playerOvr(later), cap));
    assert.ok(careerPotentialOvr({}, later) >= playerOvr(later));
    assert.ok(playerOvr(later) <= Math.max(playerOvr(p), cap), `${p.id}: passou do teto`);
  }
  // potencial furado por desempenho entra no teto (e no mostrado)
  const p = TEAMS[2].players[0];
  assert.equal(careerPotentialOvr({ dynamicPotBonus: { [p.id]: 3 } }, p), Math.min(99, Math.max(playerOvr(p), aiPotentialOvr(p.id, playerOvr(p), baseAge(p)) + 3)));
  // prospecto da academia: o potencial dele
  const ac = { id: 'prospect__x', nick: 'x', name: 'x', country: 'br', role: 'Rifler' as const, aim: 62, awp: 50, igl: 50, clutch: 60, consistency: 61, age: 16, joinedSplit: 1, potential: 84 };
  assert.equal(careerPotentialOvr({ academy: [ac] }, ac), 84);
});

test('curva: jovem de 18 com PA 170 em 3 anos (treino bom 85–90%, neutro 80–85%, banco ≤ 80%)', () => {
  const bom = youthShare(170, 'bom'), neutro = youthShare(170, 'neutro'), banco = youthShare(170, 'banco');
  assert.ok(bom >= 0.85 && bom <= 0.9, `bom ${bom}`);
  assert.ok(neutro >= 0.8 && neutro <= 0.85, `neutro ${neutro}`);
  assert.ok(banco <= 0.8, `banco ${banco}`);
});

test('curva: 27–29 cai 0,5–1 OVR/ano; 33+ cai 3–4,5/ano; IGL 30–33 cai ≥ 25% menos que Entry', () => {
  const mid = declinePerYear(27, 3);
  assert.ok(mid <= -0.5 && mid >= -1, `27–29: ${mid}`);
  const vet = declinePerYear(33, 3);
  assert.ok(vet <= -3 && vet >= -4.5, `33+: ${vet}`);
  const igl = declinePerYear(30, 3, 'IGL'), entry = declinePerYear(30, 3, 'Entry');
  assert.ok(igl > entry && igl / entry <= 0.75, `IGL ${igl} × Entry ${entry}`);
});

test('desempenho: rating 1.0 → neutro; bônus e penalidade com teto; IA neutra', () => {
  assert.equal(perfMul(1.0, 12), 1);
  assert.equal(perfMul(undefined, 12), 1);
  assert.equal(perfMul(3, 12), 1.2);
  assert.equal(perfMul(0.2, 12), 0.85);
  assert.ok(Math.abs(perfMul(1.1, 12) - 1.08) < 1e-9);
  assert.ok(Math.abs(perfMul(1.1, 6) - 1.04) < 1e-9, 'pondera pela rodagem');
  // rating 1.0 dá exatamente a evolução sem rating (Δ 0)
  const x = deriveAttrs({ id: 'pf', role: 'Rifler', age: 19, aim: 72, awp: 55, igl: 56, clutch: 69, consistency: 70 });
  assert.deepEqual(evolveAttrs(x, { playerId: 'pf', split: 3, age: 19, rating: 1.0 }), evolveAttrs(x, { playerId: 'pf', split: 3, age: 19 }));
  // bom rating cresce mais (média), boa forma segura a queda
  let hi = 0, lo = 0, vHi = 0, vLo = 0;
  for (let i = 0; i < 150; i++) {
    const y = { ...deriveAttrs({ id: `pg${i}`, role: 'Rifler', age: 19, aim: 72, awp: 55, igl: 56, clutch: 69, consistency: 70 }), pa: 200 };
    hi += ovrFromAttrs(evolveAttrs(y, { playerId: `pg${i}`, split: 2, age: 19, rating: 1.3 }).attrs);
    lo += ovrFromAttrs(evolveAttrs(y, { playerId: `pg${i}`, split: 2, age: 19, rating: 1.0 }).attrs);
    const v = deriveAttrs({ id: `pv${i}`, role: 'Rifler', age: 33, aim: 82, awp: 60, igl: 66, clutch: 79, consistency: 80 });
    vHi += ovrFromAttrs(evolveAttrs(v, { playerId: `pv${i}`, split: 2, age: 34, rating: 1.3 }).attrs);
    vLo += ovrFromAttrs(evolveAttrs(v, { playerId: `pv${i}`, split: 2, age: 34 }).attrs);
  }
  assert.ok(hi > lo, 'rating alto acelera o crescimento');
  assert.ok(vHi > vLo, 'boa forma segura a queda');
});

test('idade: 1 ano = 1 temporada (4 splits)', () => {
  assert.equal(SPLITS_PER_YEAR, 4);
  const p = TEAMS[0].players[0];
  assert.equal(effectiveAge(p, 4) - effectiveAge(p, 1), 0);
  assert.equal(effectiveAge(p, 5) - effectiveAge(p, 1), 1);
  assert.equal(effectiveAge(p, 13) - effectiveAge(p, 1), 3);
});

test('custo: avançar 1 split do mundo inteiro (~1.300 jogadores) é incremental e barato', () => {
  clearReplayMemo();
  const n = CS2_REAL_2026.reduce((a, t) => a + t.players.length, 0);
  buildAiWorld({ base: CS2_REAL_2026, split: 12, skip: NS });
  const s0 = replaySteps();
  const t0 = performance.now();
  buildAiWorld({ base: CS2_REAL_2026, split: 13, skip: NS });
  const ms = performance.now() - t0;
  // o custo real é o nº de passos (determinístico); o tempo só pega regressão grosseira (a suíte roda em paralelo)
  const steps = replaySteps() - s0;
  assert.ok(steps <= n * 1.2, `passos no avanço: ${steps} (${n} jogadores)`);
  assert.ok(ms < 3000, `avanço de split: ${ms.toFixed(0)} ms`);
  const t1 = performance.now();
  buildAiWorld({ base: CS2_REAL_2026, split: 13, skip: NS });
  assert.ok(performance.now() - t1 < 1000, 'repetir o mesmo split sai do cache');
});

test('academia: treino de base intenso — 16 anos OVR 65 / pot 86 chega a 85–90% do teto em 8–10 splits (estrutura média), sem furar o teto', () => {
  const share = (lv: number, yg: number, at: number) => {
    let s = 0;
    for (let i = 0; i < 60; i++) {
      const a = { id: `prospect__t${i}`, nick: 'x', name: 'x', country: 'br', role: (['Entry', 'AWP', 'Rifler', 'IGL', 'Support'] as const)[i % 5], aim: 67, consistency: 64, clutch: 63, awp: 56, igl: 56, age: 16, potential: 86 };
      const o = projectAcademyOvr(a, 3, 16, academyGrowthMul(lv, yg), false);
      assert.ok(o.every((v) => v <= 86), 'nunca passa o potencial');
      s += caFromOvr(o[at - 1]) / caFromOvr(86);
    }
    return s / 60;
  };
  const s9 = share(1, 1, 9);
  assert.ok(s9 >= 0.85 && s9 <= 0.9, `9 splits, estrutura média: ${s9}`);
  assert.ok(share(3, 1.3, 9) > s9, 'estrutura/comissão boa acelera');
  assert.ok(share(1, 1, 8) >= 0.8 && share(1, 1, 10) <= 0.92);
});
