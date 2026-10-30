// Placar do pick'em contra o resultado REAL (engine/pickemScore.ts): pontuação
// parcial por Stage e dos playoffs, validação do JSON de resultados
// (src/data/major-singapore-2026-results.json) e a mensagem que a UI mostra.
// Roda `tsx --test scripts/test-pickem-score.mts`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import repoResults from '../src/data/major-singapore-2026-results.json' with { type: 'json' };
import {
  PICKEM_POINTS, bySeed, emptyPicks, scorePicks, simulateMajor,
  type MajorData, type MajorPicks, type MajorResult,
} from '../src/engine/majorSingapore.ts';
import {
  MAX_TOTAL, NO_OUTCOMES, STAGE_MAX, outcomesFromSim, placarView, scorePlayoffs, scoreSoFar, scoreStage, validateMajorResults,
  type MajorOutcomes, type PlayoffOutcome, type StageOutcome,
} from '../src/engine/pickemScore.ts';
import { STAGE1_END, STAGE1_ENDS_MS } from '../src/data/majorResults.ts';

const D = data as unknown as MajorData;
const SRC = 'https://www.hltv.org/events/9303/pgl-major-singapore-2026-stage-1';
const DAY = '2026-11-27';
/** o "Major real" das fixtures: um Major simulado com seed fixa */
const R = simulateMajor(D, 7);
const FULL = outcomesFromSim(R, 6, SRC);

const rec = (r: MajorResult, i: number, w: number, l: number) => r.stages[i].records.filter((x) => x.w === w && x.l === l).map((x) => x.id);
const loser = (m: { a: string; b: string; winner: string }) => (m.winner === m.a ? m.b : m.a);

/** o palpite que acerta tudo de `r` */
function perfectPicks(r: MajorResult): MajorPicks {
  return {
    s1: [...r.stages[0].advanced], s2: [...r.stages[1].advanced], s3: [...r.stages[2].advanced],
    bracket: [...r.playoffs.qf.map((m) => m.winner), ...r.playoffs.sf.map((m) => m.winner), r.playoffs.champion],
    x30: [rec(r, 0, 3, 0), rec(r, 1, 3, 0), rec(r, 2, 3, 0)],
    x03: [rec(r, 0, 0, 3), rec(r, 1, 0, 3), rec(r, 2, 0, 3)],
  };
}

/** o palpite que erra tudo de `r`: os eliminados como classificados, os perdedores na chave */
function zeroPicks(r: MajorResult): MajorPicks {
  const st = (i: number) => r.stages[i];
  return {
    s1: [...st(0).eliminated], s2: [...st(1).eliminated], s3: [...st(2).eliminated],
    bracket: [...r.playoffs.qf.map(loser), ...r.playoffs.sf.map(loser), loser(r.playoffs.final)],
    x30: [0, 1, 2].map((i) => st(i).eliminated.slice(0, 2)) as MajorPicks['x30'],
    x03: [0, 1, 2].map((i) => st(i).advanced.slice(0, 2)) as MajorPicks['x03'],
  };
}

/** o formato do arquivo JSON a partir de um resultado */
function toJson(o: MajorOutcomes): Record<string, unknown> {
  const st = (s: StageOutcome | null) => (s
    ? { qualified: s.qualified, x30: s.x30, x03: s.x03, source: s.source, updatedAt: DAY }
    : { qualified: [], x30: [], x03: [], source: null, updatedAt: null });
  const po = (p: PlayoffOutcome | null) => (p
    ? { qf: p.qf, sf: p.sf, champion: p.champion || null, source: p.source, updatedAt: DAY }
    : { qf: [], sf: [], champion: null, source: null, updatedAt: null });
  return { stage1: st(o.stages[0]), stage2: st(o.stages[1]), stage3: st(o.stages[2]), playoffs: po(o.playoffs) };
}
const withDay = (o: MajorOutcomes): MajorOutcomes => ({
  stages: o.stages.map((s) => (s ? { ...s, updatedAt: DAY } : null)) as MajorOutcomes['stages'],
  playoffs: o.playoffs ? { ...o.playoffs, updatedAt: DAY } : null,
});
/** JSON completo com um Stage trocado */
const patched = (stage: 'stage1' | 'stage2' | 'stage3' | 'playoffs', patch: Record<string, unknown>) => {
  const j = toJson(FULL);
  return { ...j, [stage]: { ...(j[stage] as object), ...patch } };
};

// ---------------------------------------------------------------- arquivo do repo

test('o JSON de resultados do repo valida sem nenhum aviso (o PR de dados quebra aqui se errar)', () => {
  const { warnings } = validateMajorResults(D, repoResults);
  assert.deepEqual(warnings, []);
});

test('regra de pontos é a do scorePicks: 16 por Stage, 17 nos playoffs, 65 no Major', () => {
  assert.deepEqual(PICKEM_POINTS, { qualified: 1, extreme: 2, playoffWin: 2, champion: 5 });
  assert.equal(STAGE_MAX, 16);
  assert.equal(MAX_TOTAL, 65);
  assert.equal(scorePicks(perfectPicks(R), R).max, MAX_TOTAL);
});

test('fim do Stage 1 sem campo no JSON dos times: 27/11, virada em 28/11 00:00 de Brasília', () => {
  assert.equal(STAGE1_END, '2026-11-27');
  assert.equal(STAGE1_ENDS_MS, Date.UTC(2026, 10, 28, 3, 0, 0));
});

// ---------------------------------------------------------------- pontuação

test('perfeito: todos os acertos, 65 de 65', () => {
  const p = perfectPicks(R);
  const s = scoreSoFar(p, FULL);
  assert.equal(s.points, 65);
  assert.equal(s.max, 65);
  for (const st of s.stages) {
    assert.ok(st);
    assert.equal(st.points, 16);
    assert.equal(st.hits, 8);
    assert.ok([...st.qualified, ...st.x30, ...st.x03].every((m) => m.hit));
  }
  assert.equal(s.playoffs?.points, 17);
  assert.equal(scorePicks(p, R).points, 65);
});

test('zero: nenhum acerto, 0 de 65, todo time do palpite marcado como erro', () => {
  const s = scoreSoFar(zeroPicks(R), FULL);
  assert.equal(s.points, 0);
  assert.equal(s.max, 65);
  for (const st of s.stages) {
    assert.ok(st);
    assert.equal(st.qualified.length, 8);
    assert.equal(st.x30.length, 2);
    assert.equal(st.x03.length, 2);
    assert.ok([...st.qualified, ...st.x30, ...st.x03].every((m) => !m.hit));
  }
  const po = s.playoffs!;
  assert.ok([...po.qf!, ...po.sf!, ...po.final!].every((m) => !m.hit));
});

test('parcial: 6 classificados e um 3-0 certos = 8 de 16 no Stage 1, com ✓/✗ por time', () => {
  const st1 = FULL.stages[0]!;
  const notThreeZero = st1.qualified.filter((id) => !st1.x30.includes(id));
  const out = R.stages[0].eliminated;
  const p: MajorPicks = {
    ...emptyPicks(),
    s1: [...st1.qualified.slice(0, 6), out[0], out[1]],
    x30: [[st1.x30[0], notThreeZero[0]], [], []],
    x03: [[st1.qualified[0], out.find((id) => !st1.x03.includes(id))!], [], []],
  };
  const s = scoreStage(p, 1, st1);
  assert.equal(s.hits, 6);
  assert.equal(s.points, 6 * 1 + 1 * 2);
  assert.equal(s.max, 16);
  assert.deepEqual(s.qualified.map((m) => m.hit), [true, true, true, true, true, true, false, false]);
  assert.deepEqual(s.x30.map((m) => m.hit), [true, false]);
  assert.deepEqual(s.x03.map((m) => m.hit), [false, false]);
});

test('3-0/0-3 são opcionais: sem palpite neles o Stage vale no máximo 8, mas o máximo segue 16', () => {
  const p = { ...perfectPicks(R), x30: [[], [], []], x03: [[], [], []] } as MajorPicks;
  const s = scoreStage(p, 2, FULL.stages[1]!);
  assert.equal(s.points, 8);
  assert.equal(s.max, 16);
  assert.deepEqual([s.x30, s.x03], [[], []]);
});

test('Stage sem resultado não pontua nem entra no máximo', () => {
  const p = perfectPicks(R);
  const only1 = scoreSoFar(p, outcomesFromSim(R, 1, SRC));
  assert.equal(only1.points, 16);
  assert.equal(only1.max, 16);
  assert.equal(only1.maxTotal, 65);
  assert.equal(only1.stages[1], null);
  assert.equal(only1.stages[2], null);
  assert.equal(only1.playoffs, null);
  assert.equal(scoreSoFar(p, outcomesFromSim(R, 3, SRC)).max, 48);
  assert.deepEqual(scoreSoFar(p, NO_OUTCOMES), { stages: [null, null, null], playoffs: null, points: 0, max: 0, maxTotal: 65 });
});

test('playoffs por rodada: quartas valem 8, semis 4, campeão 5; rodada sem resultado = null', () => {
  const p = perfectPicks(R);
  const qf = scorePlayoffs(p, outcomesFromSim(R, 4, SRC).playoffs!);
  assert.deepEqual([qf.points, qf.max, qf.sf, qf.final], [8, 8, null, null]);
  const sf = scorePlayoffs(p, outcomesFromSim(R, 5, SRC).playoffs!);
  assert.deepEqual([sf.points, sf.max, sf.final], [12, 12, null]);
  const f = scorePlayoffs(p, FULL.playoffs!);
  assert.deepEqual([f.points, f.max, f.final], [17, 17, [{ id: R.playoffs.champion, hit: true }]]);
  // campeão errado: só o 5 some
  const wrong = { ...p, bracket: [...p.bracket.slice(0, 6), loser(R.playoffs.final)] };
  assert.equal(scorePlayoffs(wrong, FULL.playoffs!).points, 12);
});

test('o placar completo bate com scorePicks em 200 Majors (mesma regra)', () => {
  for (let s = 1; s <= 200; s++) {
    const real = simulateMajor(D, s);
    const o = outcomesFromSim(real, 6, SRC);
    for (const p of [perfectPicks(simulateMajor(D, s + 5000)), zeroPicks(simulateMajor(D, s + 9000)), perfectPicks(real)]) {
      const mine = scoreSoFar(p, o);
      const ref = scorePicks(p, real);
      assert.equal(mine.points, ref.points, `seed ${s}`);
      assert.equal(mine.max, ref.max);
      assert.deepEqual(mine.stages.map((x) => x!.hits), ref.stage);
    }
  }
});

// ---------------------------------------------------------------- validação

test('arquivo vazio (nenhum Stage terminou): nada pontua e nenhum aviso', () => {
  assert.deepEqual(validateMajorResults(D, toJson(NO_OUTCOMES)), { outcomes: NO_OUTCOMES, warnings: [] });
});

test('resultado completo e coerente valida sem aviso (ida e volta em 50 Majors)', () => {
  for (let s = 1; s <= 50; s++) {
    const o = outcomesFromSim(simulateMajor(D, s), 6, SRC);
    assert.deepEqual(validateMajorResults(D, toJson(o)), { outcomes: withDay(o), warnings: [] });
  }
  // playoffs só com as quartas também valem
  const q = outcomesFromSim(R, 4, SRC);
  assert.deepEqual(validateMajorResults(D, toJson(q)), { outcomes: withDay(q), warnings: [] });
});

function expectIgnored(json: unknown, part: 0 | 1 | 2 | 'po', re: RegExp) {
  const { outcomes, warnings } = validateMajorResults(D, json);
  if (part === 'po') assert.equal(outcomes.playoffs, null);
  else assert.equal(outcomes.stages[part], null);
  assert.ok(warnings.some((w) => re.test(w)), `esperava aviso ${re} em ${JSON.stringify(warnings)}`);
  return outcomes;
}

test('id desconhecido: ignora aquele Stage, avisa e mantém os outros', () => {
  const q = [...FULL.stages[0]!.qualified];
  q[7] = 'team-nao-existe';
  const o = expectIgnored(patched('stage1', { qualified: q }), 0, /Stage 1 ignorado: .*id desconhecido: team-nao-existe/);
  assert.ok(o.stages[1] && o.stages[2] && o.playoffs, 'os outros Stages continuam valendo');
});

test('Stage incompleto: 7 classificados, 1 em 3-0 ou 0-3 vazio → ignorado', () => {
  const st = FULL.stages[1]!;
  expectIgnored(patched('stage2', { qualified: st.qualified.slice(0, 7) }), 1, /Stage 2 ignorado: incompleto: 7 classificados/);
  expectIgnored(patched('stage2', { x30: st.x30.slice(0, 1) }), 1, /incompleto: 1 em 3-0/);
  expectIgnored(patched('stage2', { x03: [] }), 1, /incompleto: 0 em 0-3/);
});

test('sem source (ou source que não é URL) → ignorado', () => {
  expectIgnored(patched('stage3', { source: null }), 2, /Stage 3 ignorado: sem source/);
  expectIgnored(patched('stage3', { source: 'hltv.org/events' }), 2, /sem source/);
  expectIgnored(patched('playoffs', { source: '' }), 'po', /Playoffs ignorados: sem source/);
});

test('coerência do suíço: 3-0 fora dos classificados, 0-3 entre eles, id repetido → ignorado', () => {
  const st = FULL.stages[0]!;
  const out = R.stages[0].eliminated;
  expectIgnored(patched('stage1', { x30: [st.x30[0], out[0]] }), 0, /3-0 fora dos classificados/);
  expectIgnored(patched('stage1', { x03: [st.qualified[0], st.x03[1]] }), 0, /0-3 entre os classificados/);
  expectIgnored(patched('stage1', { qualified: [...st.qualified.slice(0, 7), st.qualified[0]] }), 0, /id repetido em qualified/);
});

test('time que não joga aquele Stage → ignorado', () => {
  const st1 = FULL.stages[0]!;
  const seed1 = bySeed(D)[0].id; // entra direto no Stage 3
  expectIgnored(patched('stage1', { qualified: [...st1.qualified.slice(0, 7), seed1] }), 0, new RegExp(`${seed1} não joga o Stage 1`));
  // com o Stage 1 válido, quem caiu nele não pode classificar no Stage 2
  const st2 = FULL.stages[1]!;
  const outS1 = R.stages[0].eliminated[0];
  const q2 = st2.qualified.filter((id) => !st2.x30.includes(id)).slice(0, 5);
  expectIgnored(patched('stage2', { qualified: [...st2.x30, ...q2, outS1] }), 1, new RegExp(`${outS1} não joga o Stage 2`));
  // sem o Stage 1, o Stage 2 aceita qualquer time dos Stages 1 e 2 (o resto do arquivo segue valendo)
  const loose = validateMajorResults(D, { ...toJson(FULL), stage1: toJson(NO_OUTCOMES).stage1 });
  assert.deepEqual(loose.warnings, []);
  assert.ok(loose.outcomes.stages[1]);
});

test('playoffs incoerentes → ignorados', () => {
  const po = FULL.playoffs!;
  const s3out = R.stages[2].eliminated[0];
  expectIgnored(patched('playoffs', { qf: [], sf: po.sf }), 'po', /semis preenchidas sem as quartas/);
  expectIgnored(patched('playoffs', { qf: po.qf.slice(0, 3), sf: [], champion: null }), 'po', /quartas incompletas: 3/);
  expectIgnored(patched('playoffs', { champion: po.qf.find((id) => !po.sf.includes(id)) }), 'po', /campeão não venceu uma semi/);
  expectIgnored(patched('playoffs', { qf: [...po.qf.slice(0, 3), s3out] }), 'po', new RegExp(`${s3out} não está entre os 8 do Stage 3`));
  expectIgnored(patched('playoffs', { sf: [], champion: po.champion }), 'po', /campeão preenchido sem as semis/);
});

test('chave desconhecida e updatedAt fora do formato só avisam (o Stage vale)', () => {
  const j = patched('stage1', { updatedAt: '27/11/2026', classificados: [] });
  const { outcomes, warnings } = validateMajorResults(D, { ...j, stage4: {} });
  assert.ok(outcomes.stages[0]);
  assert.equal(outcomes.stages[0].updatedAt, '');
  assert.ok(warnings.some((w) => /Stage 1: updatedAt devia ser AAAA-MM-DD/.test(w)));
  assert.ok(warnings.some((w) => /Stage 1: chave desconhecida "classificados"/.test(w)));
  assert.ok(warnings.some((w) => /arquivo: chave desconhecida "stage4"/.test(w)));
});

test('lixo no lugar do arquivo ou do Stage não quebra: ignora e avisa', () => {
  assert.deepEqual(validateMajorResults(D, null).outcomes, NO_OUTCOMES);
  assert.deepEqual(validateMajorResults(D, []).outcomes, NO_OUTCOMES);
  expectIgnored({ ...toJson(FULL), stage1: 'oi' }, 0, /Stage 1 ignorado: devia ser um objeto/);
  expectIgnored(patched('stage1', { qualified: 'team-vitality' }), 0, /listas de ids/);
  expectIgnored(patched('playoffs', { champion: 3 }), 'po', /champion é um id ou null/);
});

// ---------------------------------------------------------------- estado da UI

test('UI: palpite incompleto pede para completar (antes e depois dos resultados)', () => {
  const half = { ...perfectPicks(R), bracket: ['', '', '', '', '', '', ''] };
  assert.deepEqual(placarView(emptyPicks(), NO_OUTCOMES, 0, STAGE1_ENDS_MS), { kind: 'incomplete', started: false });
  assert.deepEqual(placarView(half, outcomesFromSim(R, 1, SRC), 0, STAGE1_ENDS_MS), { kind: 'incomplete', started: true });
});

test('UI: palpite completo sem resultado espera o fim do Stage 1 (e avisa se o resultado atrasar)', () => {
  const p = perfectPicks(R);
  assert.deepEqual(placarView(p, NO_OUTCOMES, Date.UTC(2026, 10, 1), STAGE1_ENDS_MS), { kind: 'waiting', late: false });
  assert.deepEqual(placarView(p, NO_OUTCOMES, STAGE1_ENDS_MS - 1, STAGE1_ENDS_MS), { kind: 'waiting', late: false });
  assert.deepEqual(placarView(p, NO_OUTCOMES, STAGE1_ENDS_MS, STAGE1_ENDS_MS), { kind: 'waiting', late: true });
});

test('UI: com resultado mostra o placar, até onde vai e o Stage seguinte aguardando', () => {
  const p = zeroPicks(R);
  const at = (upTo: 1 | 2 | 3 | 4 | 5 | 6) => {
    const v = placarView(p, outcomesFromSim(R, upTo, SRC), STAGE1_ENDS_MS, STAGE1_ENDS_MS);
    assert.equal(v.kind, 'scored');
    return v.kind === 'scored' ? [v.through, v.next, v.final, v.score.max] : [];
  };
  assert.deepEqual(at(1), [1, 2, false, 16]);
  assert.deepEqual(at(2), [2, 3, false, 32]);
  assert.deepEqual(at(3), [3, 'playoffs', false, 48]);
  assert.deepEqual(at(4), ['qf', null, false, 56]);
  assert.deepEqual(at(5), ['sf', null, false, 60]);
  assert.deepEqual(at(6), ['final', null, true, 65]);
});
