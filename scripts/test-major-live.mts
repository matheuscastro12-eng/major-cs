// MAJOR AO VIVO (24/11 a 13/12): a parte do dia por data (data/majorLive.ts),
// nas bordas das travas em UTC; o que está publicado no JSON de resultados; o
// "palpite ainda conta?" sem a lista de times e as regras novas da próxima ação
// do Início (state/homeNext.ts); o CTA da landing; o recap do placar com card
// (texto e kinds do share_card) e o relógio de teste ?agora= (só em dev).
// Roda `tsx --test scripts/test-major-live.mts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import repoResults from '../src/data/major-singapore-2026-results.json' with { type: 'json' };
import {
  LIVE_LOCKS, NOTHING_PUBLISHED, PUBLISHED, anyPublished, demoParam, latestResult, liveStage, publishedDemo, publishedFrom,
  requestPlacarFocus, takePlacarFocus, type Published,
} from '../src/data/majorLive.ts';
import { MAJOR_SG_FINAL_DAY_MS, MAJOR_SG_PROMO_ENDS_MS } from '../src/data/majorWindow.ts';
import { PICKEM_LOCKS } from '../src/data/majorResults.ts';
import { encodePicks, emptyPicks, simulateMajor, type MajorData, type MajorPicks, type MajorResult } from '../src/engine/majorSingapore.ts';
import {
  lockedOut, outcomesFromSim, placarRecap, placarView, validateMajorResults,
  type MajorOutcomes, type PlayoffOutcome, type StageOutcome,
} from '../src/engine/pickemScore.ts';
import {
  MAJOR_SNAPSHOTS_KEY, nextAction, pickPartsFromCode, pickPartsFromRaw, pickemStanding, snapPartsFromRaw,
  type HomeNextInput, type PickParts, type PickemProgress,
} from '../src/state/homeNext.ts';
import { landingMajorCta } from '../src/data/majorLanding.ts';
import { inviteKind, inviteUrl, placarShareText } from '../src/state/shareInvite.ts';
import { devAgoraMs } from '../src/state/devClock.ts';

const D = data as unknown as MajorData;
const iso = (ms: number) => new Date(ms).toISOString();
const SRC = 'https://www.hltv.org/events/9303/pgl-major-singapore-2026';

// ── travas e a parte do dia ─────────────────────────────────────────────────

test('travas do ao vivo = travas do placar (meia-noite de Singapura, em UTC)', () => {
  assert.deepEqual({ ...LIVE_LOCKS }, { ...PICKEM_LOCKS });
  assert.equal(iso(LIVE_LOCKS.s1), '2026-11-23T16:00:00.000Z');       // 23/11 13h em Brasília
  assert.equal(iso(LIVE_LOCKS.s2), '2026-11-27T16:00:00.000Z');
  assert.equal(iso(LIVE_LOCKS.s3), '2026-12-01T16:00:00.000Z');
  assert.equal(iso(LIVE_LOCKS.playoffs), '2026-12-09T16:00:00.000Z');
  assert.equal(iso(MAJOR_SG_FINAL_DAY_MS), '2026-12-13T03:00:00.000Z'); // final: 13/12 00h em Brasília
  assert.equal(iso(MAJOR_SG_PROMO_ENDS_MS), '2026-12-14T03:00:00.000Z');
});

const NONE = NOTHING_PUBLISHED;
const S3_OUT: Published = { stages: [true, true, true], playoffs: null };

test('parte do dia nas bordas de cada trava (UTC)', () => {
  const at = (ms: number, p: Published = NONE) => liveStage(ms, p);
  assert.deepEqual(at(Date.UTC(2026, 9, 30, 15)), { kind: 'before' });
  assert.deepEqual(at(LIVE_LOCKS.s1 - 1), { kind: 'before' });
  assert.deepEqual(at(LIVE_LOCKS.s1), { kind: 'stage', n: 1 });
  assert.deepEqual(at(LIVE_LOCKS.s2 - 1), { kind: 'stage', n: 1 });
  assert.deepEqual(at(LIVE_LOCKS.s2), { kind: 'stage', n: 2 });
  assert.deepEqual(at(LIVE_LOCKS.s3 - 1), { kind: 'stage', n: 2 });
  assert.deepEqual(at(LIVE_LOCKS.s3), { kind: 'stage', n: 3 });
  assert.deepEqual(at(LIVE_LOCKS.playoffs - 1), { kind: 'stage', n: 3 });
  assert.deepEqual(at(LIVE_LOCKS.playoffs), { kind: 'playoffs' });
  assert.deepEqual(at(MAJOR_SG_FINAL_DAY_MS - 1), { kind: 'playoffs' });
  assert.deepEqual(at(MAJOR_SG_FINAL_DAY_MS), { kind: 'final' });
  assert.deepEqual(at(MAJOR_SG_PROMO_ENDS_MS - 1), { kind: 'final' });
  assert.deepEqual(at(MAJOR_SG_PROMO_ENDS_MS), { kind: 'after' });
  assert.deepEqual(at(Date.UTC(2027, 0, 1)), { kind: 'after' });
});

test('fim do Stage 3 não é inventado: "Stage 3" até o resultado entrar; depois "Playoffs em 10/12"', () => {
  const mid = Date.UTC(2026, 11, 6, 15); // 06/12
  assert.deepEqual(liveStage(mid, { stages: [true, true, false], playoffs: null }), { kind: 'stage', n: 3 });
  assert.deepEqual(liveStage(mid, S3_OUT), { kind: 'gap' });
  assert.deepEqual(liveStage(LIVE_LOCKS.s3, S3_OUT), { kind: 'gap' });
  assert.deepEqual(liveStage(LIVE_LOCKS.playoffs - 1, S3_OUT), { kind: 'gap' });
  assert.deepEqual(liveStage(LIVE_LOCKS.playoffs, S3_OUT), { kind: 'playoffs' });
  // resultado do Stage 3 publicado não adianta nada antes de 02/12 (só a data manda)
  assert.deepEqual(liveStage(LIVE_LOCKS.s2, S3_OUT), { kind: 'stage', n: 2 });
});

// ── publicado / não publicado ───────────────────────────────────────────────

/** o formato do arquivo JSON a partir de um resultado (igual ao de test-pickem-score) */
function toJson(o: MajorOutcomes): Record<string, unknown> {
  const st = (s: StageOutcome | null) => (s
    ? { qualified: s.qualified, x30: s.x30, x03: s.x03, source: s.source, updatedAt: '2026-11-27' }
    : { qualified: [], x30: [], x03: [], source: null, updatedAt: null });
  const po = (p: PlayoffOutcome | null) => (p
    ? { qf: p.qf, sf: p.sf, champion: p.champion || null, source: p.source, updatedAt: '2026-12-13' }
    : { qf: [], sf: [], champion: null, source: null, updatedAt: null });
  return { stage1: st(o.stages[0]), stage2: st(o.stages[1]), stage3: st(o.stages[2]), playoffs: po(o.playoffs) };
}
const R = simulateMajor(D, 7);

test('o arquivo do repo: o publicado aqui é o mesmo que o placar pontua', () => {
  const v = validateMajorResults(D, repoResults).outcomes;
  assert.deepEqual(PUBLISHED.stages, v.stages.map(Boolean));
  assert.equal(PUBLISHED.playoffs !== null, v.playoffs !== null);
  assert.deepEqual(publishedFrom(repoResults), PUBLISHED);
});

test('cada etapa do Major, do Stage 1 ao campeão: publicado = o recorte da prévia demoN = o validado', () => {
  for (const n of [1, 2, 3, 4, 5, 6] as const) {
    const file = toJson(outcomesFromSim(R, n, SRC));
    const pub = publishedFrom(file);
    assert.deepEqual(pub, publishedDemo(n), `demo${n}`);
    const v = validateMajorResults(D, file);
    assert.deepEqual(v.warnings, [], `demo${n}: o arquivo de teste devia ser válido`);
    assert.deepEqual(pub.stages, v.outcomes.stages.map(Boolean));
    assert.equal(pub.playoffs !== null, v.outcomes.playoffs !== null);
  }
  assert.deepEqual(publishedDemo(4).playoffs, 'qf');
  assert.deepEqual(publishedDemo(5).playoffs, 'sf');
  assert.deepEqual(publishedDemo(6).playoffs, 'final');
});

test('não publicado: vazio, sem fonte, Stage pela metade ou lixo', () => {
  assert.deepEqual(publishedFrom(null), NONE);
  assert.deepEqual(publishedFrom('x'), NONE);
  assert.deepEqual(publishedFrom([]), NONE);
  const full = toJson(outcomesFromSim(R, 6, SRC));
  const noSrc = { ...full, stage1: { ...(full.stage1 as object), source: null } };
  assert.equal(publishedFrom(noSrc).stages[0], false);
  const blankSrc = { ...full, stage2: { ...(full.stage2 as object), source: '  ' } };
  assert.equal(publishedFrom(blankSrc).stages[1], false);
  const seven = { ...full, stage3: { ...(full.stage3 as Record<string, unknown>), qualified: (full.stage3 as { qualified: string[] }).qualified.slice(0, 7) } };
  assert.equal(publishedFrom(seven).stages[2], false);
  const po3 = { ...full, playoffs: { ...(full.playoffs as Record<string, unknown>), qf: ['a', 'b', 'c'] } };
  assert.equal(publishedFrom(po3).playoffs, null);
  assert.equal(anyPublished(NONE), false);
  assert.equal(anyPublished(publishedDemo(1)), true);
});

test('o resultado mais recente: campeão > semis > quartas > Stage 3 > 2 > 1', () => {
  assert.equal(latestResult(NONE), null);
  assert.deepEqual(latestResult(publishedDemo(1)), { kind: 'stage', n: 1 });
  assert.deepEqual(latestResult(publishedDemo(2)), { kind: 'stage', n: 2 });
  assert.deepEqual(latestResult(publishedDemo(3)), { kind: 'stage', n: 3 });
  assert.deepEqual(latestResult(publishedDemo(4)), { kind: 'qf' });
  assert.deepEqual(latestResult(publishedDemo(5)), { kind: 'sf' });
  assert.deepEqual(latestResult(publishedDemo(6)), { kind: 'final' });
});

test('?placar=demoN (prévia de dev) e o pedido de rolar até o placar', () => {
  assert.equal(demoParam('?placar=demo3'), 3);
  assert.equal(demoParam('?p=x&placar=demo6'), 6);
  assert.equal(demoParam('?placar=demo7'), null);
  assert.equal(demoParam('?placar=3'), null);
  assert.equal(demoParam(''), null);
  assert.equal(takePlacarFocus(), false);
  requestPlacarFocus();
  assert.equal(takePlacarFocus(), true);
  assert.equal(takePlacarFocus(), false, 'consome uma vez só');
});

test('o módulo do ao vivo é leve: sem o JSON dos 32 times nem o motor do Major', () => {
  const src = readFileSync(new URL('../src/data/majorLive.ts', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/major-singapore-2026\.json['"]/.test(src));
  assert.ok(!/engine\/majorSingapore['"]/.test(src));
  assert.ok(!/majorResults['"]/.test(src), 'majorResults.ts importa o JSON dos 32 times');
});

// ── o palpite ainda conta? (sem a lista de times) ───────────────────────────

const perfect = (r: MajorResult): MajorPicks => ({
  s1: [...r.stages[0].advanced], s2: [...r.stages[1].advanced], s3: [...r.stages[2].advanced],
  bracket: [...r.playoffs.qf.map((m) => m.winner), ...r.playoffs.sf.map((m) => m.winner), r.playoffs.champion],
  x30: [[], [], []], x03: [[], [], []],
});
const FULL = perfect(R);
const S1_ONLY: MajorPicks = { ...emptyPicks(), s1: [...FULL.s1] };
const ALL: PickParts = [true, true, true, true];
const NO: PickParts = [false, false, false, false];

test('partes do palpite pelo código do encodePicks (a foto) e pelo JSON salvo', () => {
  assert.deepEqual(pickPartsFromCode(encodePicks(D, FULL)), ALL);
  assert.deepEqual(pickPartsFromCode(encodePicks(D, emptyPicks())), NO);
  assert.deepEqual(pickPartsFromCode(encodePicks(D, S1_ONLY)), [true, false, false, false]);
  const noChamp = { ...FULL, bracket: [...FULL.bracket.slice(0, 6), ''] };
  assert.deepEqual(pickPartsFromCode(encodePicks(D, noChamp)), [true, true, true, false]);
  assert.equal(pickPartsFromCode('lixo'), null);
  assert.deepEqual(pickPartsFromRaw(JSON.stringify(FULL)), ALL);
  assert.deepEqual(pickPartsFromRaw(null), NO);
  assert.deepEqual(snapPartsFromRaw(JSON.stringify({ s1: encodePicks(D, S1_ONLY), s2: 'lixo', x: 1 })), { s1: [true, false, false, false] });
  assert.deepEqual(snapPartsFromRaw('{'), {});
  assert.deepEqual(snapPartsFromRaw(null), {});
});

test('a chave das fotos é a mesma que state/pickSnapshots.ts grava', () => {
  const src = readFileSync(new URL('../src/state/pickSnapshots.ts', import.meta.url), 'utf8');
  assert.ok(src.includes(`const KEY = '${MAJOR_SNAPSHOTS_KEY}'`));
});

test('pickemStanding: aberto antes da trava; depois, in / partial / out', () => {
  const L = LIVE_LOCKS;
  assert.equal(pickemStanding(NO, {}, L, L.s1 - 1), 'open');
  // palpite inteiro e sem foto (não abriu o Modo Major depois da trava): conta
  assert.equal(pickemStanding(ALL, {}, L, L.s1), 'in');
  // chegou depois: palpite novo, mas a foto do Stage 1 saiu vazia
  assert.equal(pickemStanding(ALL, { s1: NO }, L, L.s1 + 1), 'out');
  // sem palpite nenhum
  assert.equal(pickemStanding(NO, {}, L, L.s1), 'out');
  // Stage 1 fechado na trava, falta o resto, que ainda não travou: dá pra completar
  assert.equal(pickemStanding([true, false, false, false], {}, L, L.s1), 'partial');
  // ... mas o Stage 2 travou aberto
  assert.equal(pickemStanding([true, false, false, false], { s1: [true, false, false, false] }, L, L.s2), 'out');
  // completou depois da trava do Stage 1 com a foto do Stage 1 fechada: conta
  assert.equal(pickemStanding(ALL, { s1: [true, false, false, false] }, L, L.s1 + 5), 'in');
  // foto da chave aberta nos playoffs = fora
  assert.equal(pickemStanding(ALL, { s1: ALL, s2: ALL, s3: ALL, playoffs: [true, true, true, false] }, L, L.playoffs), 'out');
});

test('lockedOut (placar): parte travada aberta no palpite pontuado', () => {
  const L = PICKEM_LOCKS;
  assert.equal(lockedOut(FULL, L, L.playoffs), false);
  assert.equal(lockedOut(emptyPicks(), L, L.s1 - 1), false, 'antes da trava ainda dá');
  assert.equal(lockedOut(emptyPicks(), L, L.s1), true);
  assert.equal(lockedOut(S1_ONLY, L, L.s1), false, 'só o Stage 1 travou');
  assert.equal(lockedOut(S1_ONLY, L, L.s2), true);
});

// ── próxima ação do Início depois da trava ──────────────────────────────────

const DONE: PickemProgress = { steps: 4, total: 4, complete: true };
const HALF: PickemProgress = { steps: 1, total: 4, complete: false };
const NOPICK: PickemProgress = { steps: 0, total: 4, complete: false };
const live = (over: Partial<HomeNextInput> = {}): HomeNextInput => ({
  majorRun: null, draftRun: null, streak: { atRisk: false, current: 0 }, majorWindow: true,
  pickem: DONE, daily: { done: 0, total: 4 }, can: { major: true, resume: true, daily: true, career: true }, ...over,
});
const ids = (i: HomeNextInput) => { const p = nextAction(i); return [p.primary.id, ...p.secondary.map((a) => a.id)]; };

test("antes da trava nada muda: Fazer meu pick'em enquanto incompleto", () => {
  assert.deepEqual(ids(live({ pickem: NOPICK, standing: 'open' })), ['pickem', 'daily', 'career']);
  assert.deepEqual(ids(live({ pickem: NOPICK })), ['pickem', 'daily', 'career'], 'sem standing = open');
  assert.deepEqual(ids(live({ pickem: DONE, standing: 'open' })), ['daily', 'career', 'draft-new']);
});

test('depois da trava, palpite que conta e resultado publicado: Conferir meu placar na frente do Diário', () => {
  assert.deepEqual(ids(live({ standing: 'in', resultOut: true })), ['placar', 'daily', 'career']);
  assert.equal(nextAction(live({ standing: 'in', resultOut: true })).primary.target, 'major');
});

test('palpite que conta, ainda sem resultado: o placar vem depois do Diário', () => {
  assert.deepEqual(ids(live({ standing: 'in', resultOut: false })), ['daily', 'placar', 'career']);
  assert.deepEqual(ids(live({ standing: 'in', daily: { done: 4, total: 4 } })), ['placar', 'career', 'draft-new']);
});

test("sem palpite que conte: o pick'em some (nem 'Fazer', nem placar)", () => {
  for (const pickem of [NOPICK, HALF, DONE]) {
    const q = ids(live({ pickem, standing: 'out', resultOut: true }));
    assert.ok(!q.includes('pickem') && !q.includes('placar'), JSON.stringify(q));
  }
  // o Modo Major com um time continua pela campanha
  assert.equal(nextAction(live({ pickem: NOPICK, standing: 'out', majorRun: { phase: 2, wins: 1, losses: 0, done: false } })).primary.id, 'major-run');
});

test("palpite que ainda dá pra completar (partial): segue 'Fazer meu pick'em'", () => {
  assert.deepEqual(ids(live({ pickem: HALF, standing: 'partial', resultOut: true })), ['pickem', 'daily', 'career']);
});

test('fora da janela do Major ou sem o Modo Major: nada de placar', () => {
  assert.ok(!ids(live({ standing: 'in', resultOut: true, majorWindow: false })).includes('placar'));
  assert.ok(!ids(live({ standing: 'in', resultOut: true, can: { major: false, resume: true, daily: true, career: true } })).includes('placar'));
  // a campanha e o placar abrem a mesma tela: não aparecem juntos
  const p = nextAction(live({ standing: 'in', resultOut: true, majorRun: { phase: 1, wins: 0, losses: 0, done: false } }));
  assert.equal(p.primary.id, 'major-run');
  assert.ok(!p.secondary.some((a) => a.id === 'placar'));
});

// ── landing ─────────────────────────────────────────────────────────────────

test("CTA da landing: pick'em antes da trava; depois, placar pra quem tem palpite e Jogar pra quem chegou depois", () => {
  assert.equal(landingMajorCta('open'), 'pickem');
  assert.equal(landingMajorCta('in'), 'placar');
  assert.equal(landingMajorCta('partial'), 'placar');
  assert.equal(landingMajorCta('out'), 'jogar');
});

// ── recap do placar com card ────────────────────────────────────────────────

const TPL = {
  title: "Meu pick'em do PGL Major Singapore",
  hitsStage: 'acertei {hits} de {of} classificados',
  hitsPlayoffs: 'acertei {hits} de {of} vencedores',
  total: 'total até agora: {pts} de {max}',
  totalFinal: 'total no Major: {pts} de {max}',
};
const scored = (picks: MajorPicks, upTo: 1 | 2 | 3 | 4 | 5 | 6) => {
  const v = placarView(picks, outcomesFromSim(R, upTo, SRC), Date.UTC(2026, 11, 13, 20), 0);
  assert.equal(v.kind, 'scored');
  return v as Extract<typeof v, { kind: 'scored' }>;
};
// 6 de 8 classificados certos no Stage 1 (os 2 últimos trocados por eliminados), resto perfeito
const SIX = { ...FULL, s1: [...FULL.s1.slice(0, 6), ...R.stages[0].eliminated.slice(0, 2)] };

test('recap do Stage 1: pontos, acertos e o texto do card', () => {
  const r = placarRecap(scored(SIX, 1));
  assert.equal(r.part, 1);
  assert.equal(r.points, 6); // 1 por classificado, sem 3-0/0-3 no palpite
  assert.equal(r.max, 16);
  assert.deepEqual([r.hits, r.of], [6, 8]);
  assert.deepEqual(r.x30, [0, 0]);
  assert.deepEqual(r.parts, [{ points: 6, max: 16 }, null, null, null]);
  assert.equal(r.final, false);
  // uma parte só: sem "total até agora" (repetiria o número)
  assert.equal(placarShareText(r, TPL), "Meu pick'em do PGL Major Singapore · Stage 1: 6 pts · acertei 6 de 8 classificados");
});

test('recap com mais de um Stage soma o total; nos playoffs conta vencedores; no fim, "total no Major"', () => {
  const r2 = placarRecap(scored(SIX, 2));
  assert.equal(r2.part, 2);
  assert.equal(placarShareText(r2, TPL), "Meu pick'em do PGL Major Singapore · Stage 2: 8 pts · acertei 8 de 8 classificados · total até agora: 14 de 32");
  const qf = placarRecap(scored(FULL, 4));
  assert.equal(qf.part, 'playoffs');
  assert.deepEqual([qf.hits, qf.of], [4, 4]);
  assert.equal(qf.x30, null);
  assert.match(placarShareText(qf, TPL), /· Playoffs: 8 pts · acertei 4 de 4 vencedores · total até agora: 32 de 56$/);
  const fin = placarRecap(scored(FULL, 6));
  assert.equal(fin.final, true);
  assert.deepEqual([fin.hits, fin.of, fin.points, fin.max], [7, 7, 17, 17]);
  assert.match(placarShareText(fin, TPL), /total no Major: 41 de 65$/);
});

test('kinds e links do recap: placar-desafio (com nick) e placar-card (sem), no ?p= do palpite', () => {
  assert.equal(inviteKind('placar', 'desafio'), 'placar-desafio');
  assert.equal(inviteKind('placar', 'card'), 'placar-card');
  const code = encodePicks(D, FULL);
  const dare = new URL(inviteUrl('placar', 'desafio', { code, nick: 'Fallen' }));
  assert.equal(dare.pathname, '/major-singapore');
  assert.equal(dare.searchParams.get('p'), code);
  assert.equal(dare.searchParams.get('de'), 'fallen');
  assert.equal(dare.searchParams.get('ref'), 'placar-desafio');
  const card = new URL(inviteUrl('placar', 'card', { code, nick: 'Fallen' }));
  assert.equal(card.searchParams.get('ref'), 'placar-card');
  assert.equal(card.searchParams.has('de'), false);
  // o kind antigo do placar saiu da tela
  const sb = readFileSync(new URL('../src/components/major/MajorScoreboard.tsx', import.meta.url), 'utf8');
  assert.ok(!sb.includes("'major-pickem-placar'"));
  assert.ok(sb.includes("inviteKind('placar', 'desafio')") && sb.includes("inviteKind('placar', 'card')"));
});

// ── relógio de teste (só em dev) ────────────────────────────────────────────

test('?agora= em horário de Brasília; formato errado não mexe no relógio', () => {
  assert.equal(iso(devAgoraMs('?agora=2026-11-29')!), '2026-11-29T15:00:00.000Z'); // meio-dia em Brasília
  assert.equal(iso(devAgoraMs('?agora=2026-11-23T13:00')!), iso(LIVE_LOCKS.s1));
  assert.equal(devAgoraMs('?agora=amanha'), null);
  assert.equal(devAgoraMs('?agora=2026-11-29T25'), null);
  assert.equal(devAgoraMs(''), null);
  const src = readFileSync(new URL('../src/state/devClock.ts', import.meta.url), 'utf8');
  assert.match(src, /env\?\.DEV\) install\(\)/, 'a instalação só roda em dev');
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(main.split('\n').filter((l) => /^import /.test(l))[0], /state\/devClock/, 'devClock é o 1º import do main.tsx');
});
