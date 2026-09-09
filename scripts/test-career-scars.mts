// CICATRIZES (W4 — engine/career/scars.ts + ganchos). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateScars, activeScars, scarsEarnedAt, scarEffects, scarCitedForTier, coreSize,
  applyScarsOnMarket, describeScarEffects, describeScarTerm, SCAR_DEFS,
  SCAR_STAR_OVR, SCAR_UNHAPPY_MORALE, type ScarCtx, type CoachScar,
} from '../src/engine/career/scars.ts';
import { listJobOffers, rejectionReason, offerPitch, jobChance } from '../src/engine/career/jobHunt.ts';
import { summarizeCoach } from '../src/engine/coachCareer.ts';
import { storyPromiseCalledBack, storyScarEarned, storyScarCited } from '../src/engine/career/newsroom.ts';
import { tallyPlayerPromises, playerPromisesTouching, judgePlayerPromises, type PlayerPromise } from '../src/engine/career/playerPromises.ts';
import { appendPromiseOutcome, PROMISE_LOG_CAP } from '../src/engine/career/promises.ts';
import { hydrateScars, hydrateScarEvents } from '../src/engine/career/save.ts';

const baseCtx = (over: Partial<ScarCtx> = {}): ScarCtx => ({
  split: 6,
  history: [],
  boardPromises: [],
  promiseHitsNow: [],
  promiseTally: { kept: 0, broken: 0 },
  squadIds: ['a', 'b', 'c', 'd', 'e'],
  // elenco inteiro joga junto desde o split 1 (núcleo estável por padrão)
  splitsPlayed: () => [1, 2, 3, 4, 5, 6],
  youthPromoted: 0,
  breakthroughs: 0,
  events: [],
  ...over,
});

test('catálogo: ≥8 traits, pares positivo/negativo, efeitos explícitos', () => {
  const ids = Object.keys(SCAR_DEFS);
  assert.ok(ids.length >= 8);
  const good = ids.filter((id) => SCAR_DEFS[id as keyof typeof SCAR_DEFS].tone === 'good');
  const bad = ids.filter((id) => SCAR_DEFS[id as keyof typeof SCAR_DEFS].tone === 'bad');
  assert.equal(good.length, 4);
  assert.equal(bad.length, 4);
  for (const id of ids) assert.ok(Object.keys(SCAR_DEFS[id as keyof typeof SCAR_DEFS].effects).length > 0, id);
});

test('evaluateScars: determinístico, sem duplicar trait ativo, origem com dados reais', () => {
  const ctx = baseCtx({
    promiseHitsNow: [{ nick: 'FalleN', ovr: 88, kept: false }],
    history: [{ split: 4, champion: true }, { split: 6, champion: true }],
  });
  const a = evaluateScars(ctx, undefined);
  const b = evaluateScars(ctx, undefined);
  assert.deepEqual(a, b);                                  // determinístico
  const ids = a.map((s) => s.id).sort();
  assert.deepEqual(ids, ['cacador-de-titulos', 'fiel-ao-grupo', 'palavra-quebrada']);
  const pq = a.find((s) => s.id === 'palavra-quebrada')!;
  assert.match(pq.origin, /Split 6/);
  assert.match(pq.origin, /FalleN/);
  assert.match(pq.origin, /OVR 88/);
  assert.equal(pq.since, 6);
  assert.equal(pq.expires, 6 + SCAR_DEFS['palavra-quebrada'].duration!);
  // re-avaliar no mesmo split com a lista existente NÃO duplica
  const again = evaluateScars(ctx, a);
  assert.equal(again.length, a.length);
  // split seguinte, mesmo gatilho: ainda ativo → não duplica; ganhos do split = 0
  const next = evaluateScars({ ...ctx, split: 7, splitsPlayed: () => [1, 2, 3, 4, 5, 6, 7] }, a);
  assert.equal(next.filter((s) => s.id === 'palavra-quebrada').length, 1);
  assert.deepEqual(scarsEarnedAt(next, 7), []);
  // palavra de ferro NUNCA nasce junto com palavra quebrada ativa
  const ferro = evaluateScars(baseCtx({ promiseTally: { kept: 5, broken: 0 } }), a);
  assert.equal(ferro.some((s) => s.id === 'palavra-de-ferro'), false);
  assert.equal(evaluateScars(baseCtx({ promiseTally: { kept: 3, broken: 0 } }), []).some((s) => s.id === 'palavra-de-ferro'), true);
});

test('expiração: expirado sai do ativo, fica no histórico e pode ser re-ganho', () => {
  const ctx = baseCtx({ split: 3, squadIds: ['a', 'b', 'c', 'd', 'e'], splitsPlayed: (pid) => (pid === 'a' ? [1, 2, 3] : [3]) });
  const list = evaluateScars(ctx, undefined);
  const pg = list.find((s) => s.id === 'porta-giratoria')!;
  assert.ok(pg, 'porta giratória: só 1 do elenco há 3 splits');
  assert.equal(pg.expires, 3 + SCAR_DEFS['porta-giratoria'].duration!);
  assert.equal(activeScars(list, pg.expires!).length, 1);
  assert.equal(activeScars(list, pg.expires! + 1).length, 0);
  assert.equal(describeScarTerm(pg, pg.expires! + 1), `expirou no split ${pg.expires}`);
  // re-ganha depois de expirar: nova entrada, histórico preserva a antiga
  const later = evaluateScars({ ...ctx, split: pg.expires! + 1, splitsPlayed: (pid) => (pid === 'a' ? [1, 2, 3, 4, 5, 6, 7] : [7]) }, list);
  assert.equal(later.filter((s) => s.id === 'porta-giratoria').length, 2);
  assert.equal(later.filter((s) => s.id === 'porta-giratoria' && s.since === pg.expires! + 1).length, 1);
  // permanente: formador nunca expira
  const f = evaluateScars(baseCtx({ youthPromoted: 2, breakthroughs: 1 }), []).find((s) => s.id === 'formador')!;
  assert.equal(f.expires, undefined);
  assert.equal(describeScarTerm(f, 99), 'permanente');
  assert.match(f.origin, /2 promovidos/);
  assert.match(f.origin, /1 furos de teto/);
});

test('gatilhos: núcleo, mão de ferro, traidor de projeto, caçador (janela de 3)', () => {
  assert.equal(coreSize(baseCtx(), 4), 5);
  assert.equal(coreSize(baseCtx({ split: 2 }), 4), 0);      // sem histórico suficiente
  const iron = evaluateScars(baseCtx({
    events: [
      { kind: 'dismissedUnhappyStar', split: 2, nick: 'X', ovr: 85, morale: 20 },
      { kind: 'dismissedUnhappyStar', split: 5, nick: 'Y', ovr: 82, morale: 30 },
    ],
  }), []);
  const mf = iron.find((s) => s.id === 'mao-de-ferro')!;
  assert.match(mf.origin, /X \(S2\), Y \(S5\)/);
  const traitor = evaluateScars(baseCtx({ boardPromises: [{ split: 2, met: false }, { split: 5, met: false }, { split: 6, met: true }] }), []);
  assert.match(traitor.find((s) => s.id === 'traidor-de-projeto')!.origin, /S2, S5/);
  // 2 quebradas mas fora da janela de 6 → não conta
  assert.equal(evaluateScars(baseCtx({ split: 12, boardPromises: [{ split: 2, met: false }, { split: 5, met: false }] }), []).some((s) => s.id === 'traidor-de-projeto'), false);
  // caçador: títulos precisam estar nos últimos 3 splits
  assert.equal(evaluateScars(baseCtx({ history: [{ split: 1, champion: true }, { split: 6, champion: true }] }), []).some((s) => s.id === 'cacador-de-titulos'), false);
  assert.equal(evaluateScars(baseCtx({ history: [{ split: 5, champion: false, majorChampion: true }, { split: 6, champion: true }] }), []).some((s) => s.id === 'cacador-de-titulos'), true);
});

test('efeitos: soma dos ativos, citação por tier, descrição PT-BR', () => {
  const list = evaluateScars(baseCtx({
    promiseHitsNow: [{ nick: 'Z', ovr: 90, kept: false }],
    history: [{ split: 5, champion: true }, { split: 6, champion: true }],
  }), []);
  const fx = scarEffects(list, 6);
  // palavra quebrada (−8 bond, −6pp todos) + fiel (chem +5, t3 +4pp, t2 +2pp) + caçador (t1 +10pp, t2 +5pp)
  assert.equal(fx.bondNewSigning, -8);
  assert.equal(fx.chemNewSigning, 5);
  assert.ok(Math.abs(fx.jobChanceByTier[1] - 0.04) < 1e-9);
  assert.ok(Math.abs(fx.jobChanceByTier[2] - 0.01) < 1e-9);
  assert.ok(Math.abs(fx.jobChanceByTier[3] - -0.02) < 1e-9);
  assert.equal(scarCitedForTier(list, 6, 1)!.scar.id, 'cacador-de-titulos');
  assert.equal(scarCitedForTier(list, 6, 3)!.scar.id, 'palavra-quebrada');
  assert.equal(scarCitedForTier(list, 99, 1), null);               // tudo expirado
  const desc = describeScarEffects(list.find((s) => s.id === 'palavra-quebrada')!);
  assert.ok(desc.some((d) => d.includes('-8 vínculo')));
  assert.ok(desc.some((d) => d.includes('tier 1 -6pp')));
});

test('mercado: registra dispensa de estrela infeliz e aplica vínculo/química inicial', () => {
  const scars: CoachScar[] = evaluateScars(baseCtx({ promiseHitsNow: [{ nick: 'Z', ovr: 90, kept: false }] }), []);
  const r = applyScarsOnMarket({
    split: 7, scars, events: undefined,
    departed: [
      { nick: 'Star', ovr: SCAR_STAR_OVR, morale: SCAR_UNHAPPY_MORALE - 1 },   // conta
      { nick: 'Happy', ovr: 90, morale: 80 },                                    // feliz: não conta
      { nick: 'Role', ovr: 70, morale: 10 },                                     // não é estrela
    ],
    arrivedIds: ['n1'], squadIds: ['a', 'b', 'n1'],
    coachBond: { a: 60 }, pairChem: {}, bondDefault: 50, chemDefault: 30, pairKey: (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`),
  });
  assert.equal(r.scarEvents.length, 1);
  assert.equal(r.scarEvents[0].nick, 'Star');
  assert.equal(r.coachBond.n1, 50 - 8);          // palavra quebrada: −8 no vínculo inicial
  assert.equal(r.coachBond.a, 60);               // quem já estava não muda
  assert.equal(r.pairChem['a|n1'], 30 + 5);      // fiel ao grupo: +5 química inicial
  assert.equal(r.pairChem['b|n1'], 35);
  assert.equal(Object.keys(r.pairChem).length, 2);
});

test('jobHunt: propostas mudam com o trait e citam a cicatriz (texto + recusa)', () => {
  const mkTeam = (id: string, n: number) => ({
    t: { id, team: `Org ${id}`, tag: id.toUpperCase(), colors: ['#000', '#fff'] as [string, string], players: Array.from({ length: 5 }, (_, i) => ({ id: `${id}${i}` })) } as unknown as Parameters<typeof listJobOffers>[0][number]['t'],
    tier: n,
  });
  const world = [mkTeam('a', 3), mkTeam('b', 3), mkTeam('c', 2), mkTeam('d', 2), mkTeam('e', 1), mkTeam('f', 3), mkTeam('g', 3), mkTeam('h', 2)];
  const plain = listJobOffers(world, 'Minha org', 3, [], 9);
  const scars = evaluateScars(baseCtx({ split: 9, boardPromises: [{ split: 5, met: false }, { split: 9, met: false }] }), []);
  assert.ok(scars.some((s) => s.id === 'traidor-de-projeto'));
  const withScar = listJobOffers(world, 'Minha org', 3, [], 9, scars);
  assert.equal(withScar.length, plain.length);                                 // mesmos clubes (determinístico por split)
  for (let i = 0; i < plain.length; i++) {
    assert.equal(withScar[i].teamId, plain[i].teamId);
    if (plain[i].tier === 3) {
      assert.ok(Math.abs(withScar[i].chance - (plain[i].chance - 0.10)) < 1e-9 || withScar[i].chance === 0.05, 'tier 3 desconfia (−10pp)');
      assert.equal(withScar[i].citedScar?.id, 'traidor-de-projeto');
      assert.match(rejectionReason(withScar[i]), /Traidor de projeto/);
      assert.match(offerPitch(withScar[i])!, /Traidor de projeto/);
      assert.match(offerPitch(withScar[i])!, /-10pp/);
    }
  }
  assert.equal(offerPitch(plain[0]), null);
  assert.ok(jobChance(50, 3, 3) > 0);
  // trait positivo: formador ABRE porta em tier 3 (+10pp) e a recusa não cita
  const formador = evaluateScars(baseCtx({ split: 9, youthPromoted: 3 }), []);
  const open = listJobOffers(world, 'Minha org', 3, [], 9, formador);
  const t3 = open.find((o) => o.tier === 3)!;
  assert.ok(t3.chance > plain.find((o) => o.teamId === t3.teamId)!.chance);
  assert.match(offerPitch(t3)!, /Formador/);
  assert.doesNotMatch(rejectionReason(t3), /Formador/);
});

test('summarizeCoach inclui cicatrizes ativas do split', () => {
  const scars = evaluateScars(baseCtx({ split: 6, youthPromoted: 3, promiseHitsNow: [{ nick: 'Z', ovr: 90, kept: false }] }), []);
  assert.equal(summarizeCoach([], scars, 6).scars.length, 3);   // formador + palavra quebrada + fiel
  assert.equal(summarizeCoach([], scars, 50).scars.length, 1);  // só o permanente
  assert.deepEqual(summarizeCoach([]).scars, []);
  assert.equal(summarizeCoach([], scars).scars.length, 3);      // sem split: lista inteira
});

test('newsroom com memória: cita split da promessa, nome, o que aconteceu', () => {
  const kept = storyPromiseCalledBack('s', 'coldzera', 3, 5, 'extension', true);
  assert.match(`${kept.title} ${kept.body}`, /coldzera/);
  assert.match(kept.body, /Split 3/);
  assert.match(kept.body, /Split 5/);
  assert.match(kept.body, /renovar o contrato/);
  const broken = storyPromiseCalledBack('s2', 'kscerato', 2, 4, 'signing', false);
  assert.match(broken.body, /Split 2/);
  assert.match(broken.body, /Split 4/);
  assert.match(broken.body, /trazer reforço/);
  // determinístico por seed; seeds diferentes podem variar
  assert.deepEqual(storyPromiseCalledBack('s', 'coldzera', 3, 5, 'extension', true), kept);
  const scar = evaluateScars(baseCtx({ promiseHitsNow: [{ nick: 'FalleN', ovr: 88, kept: false }] }), []).find((s) => s.id === 'palavra-quebrada')!;
  const earned = storyScarEarned('e', scar);
  assert.match(earned.title, /Palavra quebrada/);
  assert.match(`${earned.title} ${earned.body}`, /FalleN/);
  assert.match(earned.body, new RegExp(`Split ${scar.expires}`));
  const cited = storyScarCited('c', 'FURIA', scar);
  assert.match(`${cited.title} ${cited.body}`, /FURIA/);
  assert.match(`${cited.title} ${cited.body}`, /Palavra quebrada/);
});

test('ganchos: outcomes carregam madeAtSplit, tally e promessas por split, log da diretoria com teto e dedupe', () => {
  const p: Record<string, PlayerPromise[]> = {
    p1: [{ kind: 'extension', madeAtSplit: 3, deadlineSplit: 5, status: 'open', contractUntilAt: 6 }],
    p2: [{ kind: 'signing', madeAtSplit: 1, deadlineSplit: 3, status: 'kept' }, { kind: 'workload', madeAtSplit: 4, deadlineSplit: 6, status: 'broken' }],
  };
  const j = judgePlayerPromises(p, { split: 5, contractUntil: () => 6, squadIds: [], fatigue: () => 50 });
  assert.deepEqual(j.outcomes, [{ playerId: 'p1', kind: 'extension', kept: false, madeAtSplit: 3, deadlineSplit: 5 }]);
  assert.deepEqual(tallyPlayerPromises(j.promises), { kept: 1, broken: 2 });
  assert.deepEqual(tallyPlayerPromises(undefined), { kept: 0, broken: 0 });
  const touch3 = playerPromisesTouching(j.promises, 3);
  assert.deepEqual(touch3.map((t) => [t.playerId, t.role]), [['p1', 'made']]);
  const touch6 = playerPromisesTouching(j.promises, 6);
  assert.deepEqual(touch6.map((t) => [t.playerId, t.role]), [['p2', 'judged']]);
  // log da diretoria
  let log = appendPromiseOutcome(undefined, { text: 'Prometo o TÍTULO deste split', met: false, split: 2 });
  log = appendPromiseOutcome(log, { text: 'Prometo o TÍTULO deste split', met: false, split: 2 }); // F5: não duplica
  assert.equal(log.length, 1);
  assert.equal(appendPromiseOutcome(log, null), log);
  for (let s = 3; s < 3 + PROMISE_LOG_CAP + 5; s++) log = appendPromiseOutcome(log, { text: 'x', met: true, split: s });
  assert.equal(log.length, PROMISE_LOG_CAP);
  // leitores tolerantes (save antigo)
  assert.deepEqual(hydrateScars(undefined), []);
  assert.deepEqual(hydrateScars([{ id: 'formador', since: 2 }, 'lixo', null]).length, 1);
  assert.deepEqual(hydrateScarEvents([{ kind: 'dismissedUnhappyStar', split: 1 }, {}]).length, 1);
});
