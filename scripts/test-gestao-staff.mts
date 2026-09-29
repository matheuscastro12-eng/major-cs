// [fase 2 · frente STAFF] Comissão técnica: efeitos pelos atributos certos,
// linha de base neutra, migração do técnico, folha/contratos, olheiro × faixa de
// CA/PA e comissão da IA (efeito pequeno, média ~0 dentro do tier).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  staffEffects, defaultStaff, headCoachFromCoach, syncHeadCoach, coachFromStaff, staffRoleRating,
  hireStaff, fireStaff, renewStaff, staffSplitTick, staffPayroll, staffWageCap, staffSeverance, staffWage,
  staffMarket, retiredToStaff, staffCandidate, generateAiStaff, aiStaffEdge, scaleStep,
  STAFF_ATTRS, STAFF_ROLES, MEDIAN_ATTR, AI_EDGE_CAP,
} from '../src/engine/gestao/staff.ts';
import { migrateGestao } from '../src/engine/gestao/gestaoMigration.ts';
import type { StaffMember, StaffRole, StaffAttrKey, StaffState, StaffEffects, TrainingSession } from '../src/engine/gestao/model.ts';
import { paRange } from '../src/engine/attrs/stars.ts';
import { retiredStaffSources, aiStaffFor, aiStaffEdgeFor, aiTierOf } from '../src/engine/gestao/staffData.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';

const attrsAll = (v: number) => Object.fromEntries(STAFF_ATTRS.map((k) => [k, v])) as Record<StaffAttrKey, number>;
const member = (role: StaffRole, v: number, over: Partial<Record<StaffAttrKey, number>> = {}, id = `${role}-${v}`): StaffMember => {
  const attrs = { ...attrsAll(v), ...over };
  return { id, name: id, country: 'br', age: 35, role, attrs, wage: staffWage(role, attrs), contractUntil: 3, since: 1 };
};
const FULL: StaffRole[] = ['headCoach', 'assistant', 'analyst', 'psychologist', 'performance', 'scout'];
const staffAt = (v: number): StaffState => ({ v: 1, members: FULL.map((r) => member(r, v)) });
const flat = (e: StaffEffects) => [...Object.values(e.training), e.familiarityGain, e.moraleRecovery, e.injuryRecovery, e.youthGrowth, 2 - e.injuryRisk];
const SESS: TrainingSession[] = ['aim', 'utility', 'tactics', 'vod', 'scrim', 'physical', 'mental', 'rest'];

test('linha de base: sem comissão (null, vazia, save sem técnico) o jogo não muda', () => {
  for (const s of [null, undefined, { v: 1 as const, members: [] }, defaultStaff(), defaultStaff({ split: 3 })]) {
    const e = staffEffects(s);
    for (const v of Object.values(e.training)) assert.equal(v, 1);
    assert.equal(e.familiarityGain, 1); assert.equal(e.moraleRecovery, 1); assert.equal(e.youthGrowth, 1);
    assert.equal(e.injuryRisk, 1); assert.equal(e.injuryRecovery, 1);
    assert.equal(e.antiStratRead, 0); assert.equal(e.scoutAccuracy, 0);
  }
  assert.equal(scaleStep(2, 1, 'x'), 2);
});

test('comissão mediana (todos os atributos 10) = 1.0 exato; ruim < 1 < elite', () => {
  const med = staffEffects(staffAt(MEDIAN_ATTR));
  for (const v of flat(med)) assert.equal(v, 1);
  assert.ok(med.antiStratRead > 0.35 && med.antiStratRead < 0.5);
  assert.ok(med.scoutAccuracy > 0.35 && med.scoutAccuracy < 0.5);
  const bad = staffEffects(staffAt(5));
  const elite = staffEffects(staffAt(18));
  flat(bad).forEach((v) => assert.ok(v < 1, `ruim devia ser < 1: ${v}`));
  flat(elite).forEach((v) => assert.ok(v > 1, `elite devia ser > 1: ${v}`));
  assert.ok(elite.antiStratRead > med.antiStratRead && med.antiStratRead > bad.antiStratRead);
  assert.ok(elite.scoutAccuracy > med.scoutAccuracy && med.scoutAccuracy > bad.scoutAccuracy);
  assert.ok(elite.injuryRisk < 1 && bad.injuryRisk > 1);
});

// Sobe UM atributo de UM cargo e confere: o efeito certo sobe e os que não
// dependem dele ficam parados.
function bump(role: StaffRole, key: StaffAttrKey, to = 18): [StaffEffects, StaffEffects] {
  const base = staffAt(MEDIAN_ATTR);
  const up: StaffState = { v: 1, members: base.members.map((m) => (m.role === role ? { ...m, attrs: { ...m.attrs, [key]: to } } : m)) };
  return [staffEffects(base), staffEffects(up)];
}
test('monotônico nos atributos certos (e só neles)', () => {
  let [a, b] = bump('assistant', 'aimCoaching');
  assert.ok(b.training.aim > a.training.aim);
  for (const s of SESS.filter((x) => x !== 'aim')) assert.equal(b.training[s], a.training[s], `aimCoaching mexeu em ${s}`);
  assert.equal(b.familiarityGain, a.familiarityGain);

  [a, b] = bump('headCoach', 'tactics');
  assert.ok(b.familiarityGain > a.familiarityGain && b.training.tactics > a.training.tactics && b.training.scrim > a.training.scrim);
  assert.equal(b.training.aim, a.training.aim);

  [a, b] = bump('analyst', 'analysis');
  assert.ok(b.antiStratRead > a.antiStratRead && b.training.vod > a.training.vod);
  assert.equal(b.familiarityGain, a.familiarityGain);

  [a, b] = bump('analyst', 'mapKnowledge');
  assert.ok(b.familiarityGain > a.familiarityGain && b.antiStratRead > a.antiStratRead);

  [a, b] = bump('scout', 'judgingAbility');
  assert.ok(b.scoutAccuracy > a.scoutAccuracy);
  [a, b] = bump('scout', 'judgingPotential');
  assert.ok(b.scoutAccuracy > a.scoutAccuracy);
  assert.deepEqual(b.training, a.training);

  [a, b] = bump('performance', 'fitness');
  assert.ok(b.training.physical > a.training.physical && b.training.rest > a.training.rest);
  assert.ok(b.injuryRisk < a.injuryRisk && b.injuryRecovery > a.injuryRecovery);
  assert.equal(b.moraleRecovery, a.moraleRecovery);

  for (const k of ['motivating', 'manManagement', 'mentalCoaching'] as StaffAttrKey[]) {
    [a, b] = bump('psychologist', k);
    assert.ok(b.moraleRecovery > a.moraleRecovery, `psicólogo ${k}`);
  }
  [a, b] = bump('headCoach', 'motivating');
  assert.ok(b.moraleRecovery > a.moraleRecovery);

  [a, b] = bump('assistant', 'youthDevelopment');
  assert.ok(b.youthGrowth > a.youthGrowth);
  assert.equal(b.training.aim, a.training.aim);

  // atributo fora de qualquer efeito do cargo não mexe em nada
  [a, b] = bump('performance', 'judgingAbility');
  assert.deepEqual(b, a);

  // segundo auxiliar só soma se for acima da mediana
  const base = staffAt(MEDIAN_ATTR);
  const two = staffEffects({ v: 1, members: [...base.members, member('assistant', 16, {}, 'asst2')] });
  const twoBad = staffEffects({ v: 1, members: [...base.members, member('assistant', 6, {}, 'asst3')] });
  assert.ok(two.training.aim > staffEffects(base).training.aim);
  assert.equal(twoBad.training.aim, staffEffects(base).training.aim);
});

test('cargo vago pesa (quebra-galho abaixo da mediana), mas não trava', () => {
  const noPerf = staffEffects({ v: 1, members: staffAt(MEDIAN_ATTR).members.filter((m) => m.role !== 'performance') });
  assert.ok(noPerf.training.physical < 1 && noPerf.training.physical > 0.85);
  assert.ok(noPerf.injuryRisk > 1 && noPerf.injuryRisk < 1.15);
  const noAnalyst = staffEffects({ v: 1, members: staffAt(MEDIAN_ATTR).members.filter((m) => m.role !== 'analyst') });
  assert.ok(noAnalyst.antiStratRead < 0.12, 'sem analista quase não lê o adversário');
  const noScout = staffEffects({ v: 1, members: staffAt(MEDIAN_ATTR).members.filter((m) => m.role !== 'scout') });
  assert.equal(noScout.scoutAccuracy, 0);
});

test('migração: técnico do save vira headCoach (rating/estilo → atributos)', () => {
  const rookie = migrateGestao({ coachFromId: '__rookie__', split: 4, squad: [{ playerId: 'a' }] });
  const hc = rookie.gestao!.staff.members.find((m) => m.role === 'headCoach')!;
  assert.ok(hc, 'headCoach criado');
  assert.equal(hc.sourceCoachId, '__rookie__');
  assert.ok(Math.abs(staffRoleRating(hc.attrs, 'headCoach') - 10.5) < 1.6, 'rookie 66 ≈ mediano');
  assert.equal(hc.contractUntil, 6);
  assert.ok(rookie.gestao!.staff.members.some((m) => m.role === 'assistant'), 'auxiliar da casa');
  assert.deepEqual(migrateGestao(rookie), rookie, 'idempotente');

  const custom = migrateGestao({ coachFromId: '__custom__', customCoach: { nick: 'zonic', name: 'Danny', country: 'dk', rating: 88, style: 'tactical' } });
  const zc = custom.gestao!.staff.members.find((m) => m.role === 'headCoach')!;
  assert.equal(zc.nick, 'zonic');
  assert.ok(zc.attrs.tactics >= 18 && zc.attrs.tactics > zc.attrs.aimCoaching + 2, 'tático: tactics alto');
  assert.ok(staffRoleRating(zc.attrs, 'headCoach') > staffRoleRating(hc.attrs, 'headCoach') + 4);

  // sem técnico no save (antes do mercado) a comissão nasce vazia = neutra
  assert.equal(migrateGestao({ squad: [] }).gestao!.staff.members.length, 0);

  // técnico de time real (resolvido pelo CareerScreen com a base) → sync
  const real = CS2_REAL_2026.find((t) => t.coach?.rating >= 85)!;
  const synced = syncHeadCoach(rookie.gestao!.staff, real.coach, real.id, 4)!;
  assert.equal(synced.members.filter((m) => m.role === 'headCoach').length, 1);
  assert.equal(synced.members.find((m) => m.role === 'headCoach')!.sourceCoachId, real.id);
  assert.equal(synced.members.length, rookie.gestao!.staff.members.length, 'resto da comissão fica');
  assert.equal(syncHeadCoach(synced, real.coach, real.id, 4), null, 'idempotente');

  // rating monotônico e ida-e-volta plausível pro motor
  const r = (rating: number) => staffRoleRating(headCoachFromCoach({ nick: 'x', name: 'x', country: 'br', rating, style: 'discipline' }, 'k').attrs, 'headCoach');
  assert.ok(r(55) < r(66) && r(66) < r(80) && r(80) < r(92));
  const back = coachFromStaff(headCoachFromCoach(real.coach, real.id));
  assert.ok(Math.abs(back.rating - real.coach.rating) <= 6, `rating ${real.coach.rating} → ${back.rating}`);
  assert.equal(back.style, real.coach.style);
});

test('folha: teto da diretoria, luvas, vaga, multa, renovação e virada de split', () => {
  const split = 5;
  const staff: StaffState = { v: 1, members: [member('headCoach', 12, {}, 'hc'), member('assistant', 10, {}, 'a1')] };
  const cap = staffWageCap({ tier: 3, board: 60, sponsorIncome: 200_000 });
  assert.equal(cap, 135_000);
  assert.ok(staffWageCap({ tier: 1, board: 90, sponsorIncome: 800_000 }) > staffWageCap({ tier: 3, board: 20, sponsorIncome: 200_000 }));

  const cand = member('analyst', 14, {}, 'an');
  const ok = hireStaff(staff, cand, { split, budget: 1_000_000, cap });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.cost, cand.wage, 'luvas = 1 salário');
    assert.equal(ok.staff.members.find((m) => m.id === 'an')!.contractUntil, split + 1);
    assert.equal(staffPayroll(ok.staff), staffPayroll(staff) + cand.wage);
  }
  const pricey = member('analyst', 20, {}, 'an20');
  const capped = hireStaff(staff, pricey, { split, budget: 10_000_000, cap: staffPayroll(staff) + pricey.wage - 1 });
  assert.ok(!capped.ok && /teto/.test(capped.reason));
  const broke = hireStaff(staff, cand, { split, budget: cand.wage - 1, cap });
  assert.ok(!broke.ok && /Caixa/.test(broke.reason));

  // vaga cheia exige substituição; o técnico principal é sempre trocado
  const full: StaffState = { v: 1, members: [...staff.members, member('assistant', 9, {}, 'a2')] };
  const noSlot = hireStaff(full, member('assistant', 13, {}, 'a3'), { split, budget: 1e7, cap: 1e7 });
  assert.ok(!noSlot.ok);
  const swap = hireStaff(full, member('assistant', 13, {}, 'a3'), { split, budget: 1e7, cap: 1e7, replaceId: 'a2' });
  assert.ok(swap.ok && swap.replaced?.id === 'a2' && swap.cost > member('assistant', 13).wage);
  const newHc = hireStaff(full, member('headCoach', 15, {}, 'hc2'), { split, budget: 1e7, cap: 1e7 });
  assert.ok(newHc.ok && newHc.replaced?.id === 'hc' && newHc.staff.members.filter((m) => m.role === 'headCoach').length === 1);

  // demissão: multa = metade dos salários restantes; técnico principal não
  const a1 = staff.members[1];
  const fired = fireStaff(staff, 'a1', split);
  assert.ok(fired.ok && fired.cost === staffSeverance(a1, split) && fired.staff.members.length === 1);
  assert.equal(staffSeverance({ ...a1, contractUntil: split + 2 }, split), Math.round(a1.wage * 1.5 / 1000) * 1000);
  assert.ok(!fireStaff(staff, 'hc', split).ok);

  // renovação só no último split
  assert.ok(!renewStaff(staff, 'a1', { split: 1, budget: 1e7, cap: 1e7 }).ok);
  const ren = renewStaff(staff, 'a1', { split: 3, budget: 1e7, cap: 1e7 });
  assert.ok(ren.ok && ren.staff.members.find((m) => m.id === 'a1')!.contractUntil === 5);

  // virada de split: paga a folha, quem venceu sai, técnico renova sozinho
  const tick = staffSplitTick(staff, 3);
  assert.equal(tick.payroll, staffPayroll(staff));
  assert.deepEqual(tick.left.map((m) => m.id), ['a1']);
  assert.deepEqual(tick.renewed.map((m) => m.id), ['hc']);
  assert.equal(tick.staff.members.find((m) => m.id === 'hc')!.contractUntil, 5);
  assert.equal(staffSplitTick(staff, 1).left.length, 0);
});

test('olheiro estreita a faixa de CA/PA (e sem olheiro nada muda)', () => {
  const width = ([lo, hi]: [number, number]) => hi - lo;
  for (const k of ['full', 'scouted', 'rumor'] as const) {
    assert.deepEqual(paRange(150, 120, k, 'p1', 0), paRange(150, 120, k, 'p1'));
    const acc = (v: number) => staffEffects({ v: 1, members: [member('scout', v)] }).scoutAccuracy;
    const w0 = width(paRange(150, 120, k, 'p1'));
    const wMed = width(paRange(150, 120, k, 'p1', acc(10)));
    const wElite = width(paRange(150, 120, k, 'p1', acc(19)));
    assert.ok(wElite < wMed && wMed < w0, `${k}: ${w0} > ${wMed} > ${wElite}`);
    for (const a of [0, acc(6), acc(10), acc(19)]) {
      const [lo, hi] = paRange(150, 120, k, 'p1', a);
      assert.ok(lo <= 150 && hi >= 150 && lo >= 120, 'faixa contém o PA real e nunca fica abaixo do CA');
    }
  }
});

test('mercado: determinístico, todas as faixas, aposentados da base como candidatos', () => {
  const retired = retiredStaffSources();
  assert.ok(retired.length >= 10);
  const m1 = staffMarket({ split: 7, region: 'americas', tier: 2, retired });
  assert.deepEqual(staffMarket({ split: 7, region: 'americas', tier: 2, retired }), m1);
  assert.notDeepEqual(staffMarket({ split: 8, region: 'americas', tier: 2, retired }).map((c) => c.id), m1.map((c) => c.id));
  for (const r of STAFF_ROLES) assert.ok(m1.some((c) => c.role === r), `falta ${r}`);
  const ratings = m1.map((c) => staffRoleRating(c.attrs, c.role));
  assert.ok(Math.min(...ratings) < 8 && Math.max(...ratings) > 14, 'do fraco barato ao elite');
  assert.ok(m1.every((c) => c.wage >= 4000 && c.age >= 22 && c.name && c.country));
  // aposentados aparecem ao longo dos splits
  const exPlayers = new Set<string>();
  for (let s = 1; s <= 9; s++) staffMarket({ split: s, retired }).filter((c) => c.sourcePlayerId).forEach((c) => exPlayers.add(c.sourcePlayerId!));
  assert.ok(exPlayers.size >= 8, `ex-jogadores no mercado: ${exPlayers.size}`);
  // exclui quem já está na comissão
  assert.ok(!staffMarket({ split: 7, region: 'americas', tier: 2, retired, exclude: [m1[0].id] }).some((c) => c.id === m1[0].id));
  // IGL aposentado com leitura vira técnico/auxiliar com tactics > aimCoaching típico de AWPer
  const igl = retired.find((r) => r.role === 'IGL')!;
  const s = retiredToStaff(igl);
  assert.ok(s.role === 'headCoach' || s.role === 'assistant');
  // candidato: nota sobe com a qualidade
  assert.ok(staffRoleRating(staffCandidate('x', 'analyst', 16, 'europe').attrs, 'analyst') > staffRoleRating(staffCandidate('x', 'analyst', 8, 'europe').attrs, 'analyst'));
});

test('IA: comissão coerente com o tier e efeito pequeno (média ~0, |δ| ≤ 0,5)', () => {
  const teams = CS2_REAL_2026.filter((t) => !t.defunct && !t.id.startsWith('__') && t.players.length >= 5);
  const byTier: Record<number, number[]> = { 1: [], 2: [], 3: [] };
  const edges: Record<number, number[]> = { 1: [], 2: [], 3: [] };
  for (const t of teams) {
    const tier = aiTierOf(t.id);
    const st = aiStaffFor(t);
    const support = st.members.filter((m) => m.role !== 'headCoach');
    byTier[tier].push(support.reduce((s, m) => s + staffRoleRating(m.attrs, m.role), 0) / support.length);
    const e = aiStaffEdgeFor(t);
    assert.ok(Math.abs(e) <= AI_EDGE_CAP, `${t.id}: ${e}`);
    edges[tier].push(e);
  }
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(mean(byTier[1]) > mean(byTier[2]) && mean(byTier[2]) > mean(byTier[3]), 'tier 1 contrata melhor');
  for (const t of [1, 2, 3]) assert.ok(Math.abs(mean(edges[t])) < 0.12, `média do delta no tier ${t}: ${mean(edges[t]).toFixed(3)}`);
  // determinístico
  assert.deepEqual(generateAiStaff('x', null, 2, 'europe'), generateAiStaff('x', null, 2, 'europe'));
  // comissão mais forte que a típica do tier → delta positivo (e vice-versa)
  const strong = generateAiStaff('y', null, 3, 'europe');
  const boosted: StaffState = { v: 1, members: strong.members.map((m) => ({ ...m, attrs: attrsAll(17) })) };
  assert.ok(aiStaffEdge(boosted, 'y', 3) > 0);
  const weak: StaffState = { v: 1, members: strong.members.map((m) => ({ ...m, attrs: attrsAll(3) })) };
  assert.ok(aiStaffEdge(weak, 'y', 1) < 0);
});

test('escala de passo inteiro: multiplicador > 1 nunca reduz, < 1 nunca aumenta', () => {
  for (let i = 0; i < 50; i++) {
    const seed = `s${i}`;
    assert.ok(scaleStep(2, 1.2, seed) >= 2 && scaleStep(2, 1.2, seed) <= 3);
    assert.ok(scaleStep(2, 0.8, seed) <= 2 && scaleStep(2, 0.8, seed) >= 1);
  }
  const avg = Array.from({ length: 400 }, (_, i) => scaleStep(2, 1.25, `a${i}`)).reduce((s, x) => s + x, 0) / 400;
  assert.ok(Math.abs(avg - 2.5) < 0.12, `média ${avg}`);
});
