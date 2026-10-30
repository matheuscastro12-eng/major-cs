// INÍCIO · PRÓXIMA AÇÃO: a regra de prioridade (state/homeNext.ts), os
// empates, a leitura crua do pick'em e da campanha do Modo Major (sem o JSON
// dos 32 times) e o relógio do Major por data (data/majorWindow.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAJOR_CAMPAIGN_KEY, MAJOR_PICKS_KEY, homeQueue, majorRunFromRaw, nextAction, pickemFromRaw,
  type HomeNextInput, type MajorRunBrief, type PickemProgress,
} from '../src/state/homeNext.ts';
import {
  MAJOR_SG_DAYS, MAJOR_SG_FINAL_DAY_MS, MAJOR_SG_PLAYOFFS_MS, MAJOR_SG_PROMO_ENDS_MS, MAJOR_SG_STARTS_MS, majorClock, majorPromoOn,
} from '../src/data/majorWindow.ts';

const NO_PICKS: PickemProgress = { steps: 0, total: 4, complete: false };
const ALL_PICKS: PickemProgress = { steps: 4, total: 4, complete: true };
const RUN: MajorRunBrief = { phase: 2, wins: 3, losses: 1, done: false };

/** jogador sem nada pendente, fora da janela do Major, Diário de hoje completo */
const base = (over: Partial<HomeNextInput> = {}): HomeNextInput => ({
  majorRun: null,
  draftRun: null,
  streak: { atRisk: false, current: 0 },
  majorWindow: false,
  pickem: NO_PICKS,
  daily: { done: 4, total: 4 },
  can: { major: true, resume: true, daily: true, career: true },
  ...over,
});
const ids = (i: HomeNextInput) => { const p = nextAction(i); return [p.primary.id, ...p.secondary.map((a) => a.id)]; };

// ── cada prioridade ────────────────────────────────────────────────────────

test('a) campanha do Major em andamento: Continuar', () => {
  assert.equal(nextAction(base({ majorRun: RUN })).primary.id, 'major-run');
  assert.equal(nextAction(base({ majorRun: RUN })).primary.target, 'major');
});

test('a) Major avulso do Draft em andamento: Continuar', () => {
  const p = nextAction(base({ draftRun: { name: 'DREAM FIVE', phase: 'Fase suíça' } }));
  assert.equal(p.primary.id, 'draft-run');
  assert.equal(p.primary.target, 'resume');
});

test('b) sequência do Diário em risco: Salvar a sequência', () => {
  assert.equal(nextAction(base({ streak: { atRisk: true, current: 5 }, daily: { done: 0, total: 4 } })).primary.id, 'streak');
});

test("c) janela do Major e pick'em incompleto: Fazer meu pick'em", () => {
  assert.equal(nextAction(base({ majorWindow: true })).primary.id, 'pickem');
  assert.equal(nextAction(base({ majorWindow: true, pickem: { steps: 3, total: 4, complete: false } })).primary.id, 'pickem');
});

test('d) Diário de hoje não feito: Jogar o Diário', () => {
  assert.equal(nextAction(base({ daily: { done: 0, total: 4 } })).primary.id, 'daily');
  assert.equal(nextAction(base({ daily: { done: 3, total: 4 } })).primary.id, 'daily');
});

test('e) nada pendente: Carreira, com o Draft de secundária', () => {
  assert.deepEqual(ids(base()), ['career', 'draft-new']);
});

// ── empates e exclusões ─────────────────────────────────────────────────────

test('campanha do Major e Draft em andamento: a campanha ganha, o Draft vira secundária', () => {
  const p = nextAction(base({ majorRun: RUN, draftRun: { name: 'X', phase: 'Y' } }));
  assert.equal(p.primary.id, 'major-run');
  assert.equal(p.secondary[0].id, 'draft-run');
});

test('continuar ganha da sequência em risco, que vira a 1ª secundária', () => {
  assert.deepEqual(ids(base({ draftRun: { name: 'X', phase: 'Y' }, streak: { atRisk: true, current: 2 }, daily: { done: 0, total: 4 } })), ['draft-run', 'streak', 'career']);
});

test('sequência em risco e Diário pendente: mesma tela, o Diário não repete', () => {
  const p = nextAction(base({ streak: { atRisk: true, current: 3 }, daily: { done: 0, total: 4 } }));
  assert.equal(p.primary.id, 'streak');
  assert.ok(!p.secondary.some((a) => a.target === 'daily'));
});

test("sequência em risco ganha do pick'em; o pick'em ganha do Diário", () => {
  assert.deepEqual(ids(base({ streak: { atRisk: true, current: 1 }, majorWindow: true, daily: { done: 0, total: 4 } })), ['streak', 'pickem', 'career']);
  assert.deepEqual(ids(base({ majorWindow: true, daily: { done: 1, total: 4 } })), ['pickem', 'daily', 'career']);
});

test("campanha do Major e pick'em incompleto: mesma tela, o pick'em não repete", () => {
  const p = nextAction(base({ majorRun: RUN, majorWindow: true }));
  assert.equal(p.primary.id, 'major-run');
  assert.ok(!p.secondary.some((a) => a.target === 'major'));
});

test("pick'em completo ou fora da janela: não pede pick'em", () => {
  assert.equal(nextAction(base({ majorWindow: true, pickem: ALL_PICKS, daily: { done: 0, total: 4 } })).primary.id, 'daily');
  assert.equal(nextAction(base({ majorWindow: false, daily: { done: 0, total: 4 } })).primary.id, 'daily');
});

test('campanha do Major que acabou (eliminado/campeão) não é "continuar"', () => {
  assert.equal(nextAction(base({ majorRun: { ...RUN, done: true } })).primary.id, 'career');
});

test('streak zerada não está "em risco", mesmo com atRisk sujo', () => {
  assert.equal(nextAction(base({ streak: { atRisk: true, current: 0 } })).primary.id, 'career');
});

test('destino ausente nesta sessão some da fila (props opcionais do Home)', () => {
  const none = { major: false, resume: false, daily: false, career: false };
  assert.deepEqual(ids(base({ majorRun: RUN, draftRun: { name: 'X', phase: 'Y' }, streak: { atRisk: true, current: 4 }, majorWindow: true, daily: { done: 0, total: 4 }, can: none })), ['draft-new']);
  assert.equal(nextAction(base({ majorRun: RUN, can: { ...base().can, major: false } })).primary.id, 'career');
  assert.equal(nextAction(base({ can: { ...base().can, career: false } })).primary.id, 'draft-new');
});

test('no máximo 2 secundárias, sem destino repetido, e a fila completa na ordem', () => {
  const all = base({ majorRun: RUN, draftRun: { name: 'X', phase: 'Y' }, streak: { atRisk: true, current: 9 }, majorWindow: true, daily: { done: 0, total: 4 } });
  assert.deepEqual(homeQueue(all), ['major-run', 'draft-run', 'streak', 'pickem', 'daily', 'career', 'draft-new']);
  const p = nextAction(all);
  assert.equal(p.secondary.length, 2);
  assert.deepEqual(ids(all), ['major-run', 'draft-run', 'streak']);
  const targets = [p.primary, ...p.secondary].map((a) => a.target);
  assert.equal(new Set(targets).size, targets.length);
  assert.equal(nextAction(all, 0).secondary.length, 0);
});

// ── pick'em cru do navegador ────────────────────────────────────────────────

const eight = (p: string) => Array.from({ length: 8 }, (_, i) => `${p}${i}`);
const picks = (o: Record<string, unknown>) => JSON.stringify({ s1: [], s2: [], s3: [], bracket: ['', '', '', '', '', '', ''], x30: [[], [], []], x03: [[], [], []], ...o });

test("pick'em: vazio, lixo e sem storage contam 0 etapas", () => {
  assert.deepEqual(pickemFromRaw(null), NO_PICKS);
  assert.deepEqual(pickemFromRaw('não é json'), NO_PICKS);
  assert.deepEqual(pickemFromRaw('[1,2]'), NO_PICKS);
  assert.deepEqual(pickemFromRaw('null'), NO_PICKS);
  assert.deepEqual(pickemFromRaw(picks({})), NO_PICKS); // o Modo Major grava o vazio ao abrir
});

test("pick'em: conta as etapas e só fecha com a chave inteira", () => {
  assert.equal(pickemFromRaw(picks({ s1: eight('a') })).steps, 1);
  assert.equal(pickemFromRaw(picks({ s1: eight('a'), s2: eight('b'), s3: eight('c') })).steps, 3);
  const almost = picks({ s1: eight('a'), s2: eight('b'), s3: eight('c'), bracket: ['a0', 'a1', 'a2', 'a3', 'a0', 'a2', ''] });
  assert.deepEqual(pickemFromRaw(almost), { steps: 3, total: 4, complete: false });
  const done = picks({ s1: eight('a'), s2: eight('b'), s3: eight('c'), bracket: ['a0', 'a1', 'a2', 'a3', 'a0', 'a2', 'a0'] });
  assert.deepEqual(pickemFromRaw(done), ALL_PICKS);
  assert.equal(pickemFromRaw(picks({ s1: eight('a').slice(0, 7) })).steps, 0);
});

// ── campanha crua do navegador ──────────────────────────────────────────────

const camp = (played: { phase: number; label: string; winner: string }[]) => JSON.stringify({ v: 1, seed: 7, teamId: 'me', role: 'Rifler', nick: 'você', played });
const s = (phase: number, label: string, won: boolean) => ({ phase, label, a: 'me', b: 'x', winner: won ? 'me' : 'x', score: [1, 0], heroRating: 1 });

test('campanha: sem save, lixo ou versão errada = nenhuma', () => {
  assert.equal(majorRunFromRaw(null), null);
  assert.equal(majorRunFromRaw('{'), null);
  assert.equal(majorRunFromRaw(JSON.stringify({ v: 2, teamId: 'me', played: [] })), null);
  assert.equal(majorRunFromRaw(JSON.stringify({ v: 1, played: [] })), null);
});

test('campanha: time escolhido e nenhuma série = em andamento', () => {
  assert.deepEqual(majorRunFromRaw(camp([])), { phase: 1, wins: 0, losses: 0, done: false });
});

test('campanha: no suíço, 3 derrotas no stage eliminam; 2 não', () => {
  assert.equal(majorRunFromRaw(camp([s(1, 'R1', false), s(1, 'R2', true), s(1, 'R3', false)]))!.done, false);
  const out = majorRunFromRaw(camp([s(1, 'R1', false), s(1, 'R2', true), s(1, 'R3', false), s(1, 'R4', false)]))!;
  assert.deepEqual(out, { phase: 1, wins: 1, losses: 3, done: true });
  // 2 derrotas no Stage 1 + 2 no Stage 2 = ainda vivo (conta só o stage atual)
  const alive = majorRunFromRaw(camp([s(1, 'R1', false), s(1, 'R2', false), s(1, 'R3', true), s(1, 'R4', true), s(1, 'R5', true), s(2, 'R1', false), s(2, 'R2', false)]))!;
  assert.equal(alive.done, false);
  assert.equal(alive.phase, 2);
});

test('campanha: classificou no stage = esperando o próximo (em andamento)', () => {
  assert.equal(majorRunFromRaw(camp([s(3, 'R1', true), s(3, 'R2', true), s(3, 'R3', true)]))!.done, false);
});

test('campanha: playoffs são eliminação simples; vencer a final encerra', () => {
  assert.equal(majorRunFromRaw(camp([s(4, 'QF1', true)]))!.done, false);
  assert.equal(majorRunFromRaw(camp([s(4, 'QF1', true), s(4, 'SF1', false)]))!.done, true);
  assert.deepEqual(majorRunFromRaw(camp([s(4, 'QF1', true), s(4, 'SF1', true), s(4, 'F', true)])), { phase: 4, wins: 3, losses: 0, done: true });
});

test('as chaves lidas são as mesmas que o Modo Major grava', () => {
  const screen = readFileSync(new URL('../src/components/major/MajorSingaporeScreen.tsx', import.meta.url), 'utf8');
  const play = readFileSync(new URL('../src/components/major/MajorPlay.tsx', import.meta.url), 'utf8');
  assert.ok(screen.includes(`const STORE = '${MAJOR_PICKS_KEY}'`), 'chave do pick\'em mudou em MajorSingaporeScreen.tsx');
  assert.ok(play.includes(`const STORE = '${MAJOR_CAMPAIGN_KEY}'`), 'chave da campanha mudou em MajorPlay.tsx');
});

test('o Início e o módulo da regra não importam o JSON dos 32 times', () => {
  for (const f of ['../src/components/Home.tsx', '../src/state/homeNext.ts', '../src/data/majorWindow.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/major-singapore-2026\.json['"]/.test(src.replace(/^\s*\/\/.*$/gm, '')), `${f} importa o JSON do Major`);
    assert.ok(!/engine\/majorSingapore['"]/.test(src), `${f} importa o motor do Major`);
  }
});

// ── relógio do Major por data ────────────────────────────────────────────────

const BRT = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h + 3, min); // Brasília = UTC-3

test('datas: 24/11/2026 e 13/12/2026 à meia-noite de Brasília; 20 dias de evento', () => {
  assert.equal(new Date(MAJOR_SG_STARTS_MS).toISOString(), '2026-11-24T03:00:00.000Z');
  assert.equal(new Date(MAJOR_SG_PLAYOFFS_MS).toISOString(), '2026-12-10T03:00:00.000Z');
  assert.equal(new Date(MAJOR_SG_FINAL_DAY_MS).toISOString(), '2026-12-13T03:00:00.000Z');
  assert.equal(new Date(MAJOR_SG_PROMO_ENDS_MS).toISOString(), '2026-12-14T03:00:00.000Z');
  assert.equal(MAJOR_SG_DAYS, 20);
});

test('antes de 24/11: contagem em dias, horas e minutos', () => {
  // 30/10 12:00 em Brasília → 24/11 00:00 = 24 dias e 12 horas
  assert.deepEqual(majorClock(BRT(2026, 10, 30, 12)), { phase: 'before', msLeft: MAJOR_SG_STARTS_MS - BRT(2026, 10, 30, 12), days: 24, hours: 12, minutes: 0 });
  const c = majorClock(BRT(2026, 11, 23, 22, 15)); // véspera, 22:15
  assert.equal(c.phase, 'before');
  if (c.phase === 'before') assert.deepEqual([c.days, c.hours, c.minutes], [0, 1, 45]);
  const last = majorClock(MAJOR_SG_STARTS_MS - 1);
  assert.equal(last.phase, 'before');
  if (last.phase === 'before') assert.deepEqual([last.days, last.hours, last.minutes], [0, 0, 0]);
});

test('de 24/11 a 13/12: ao vivo, com o dia do evento, playoffs e final', () => {
  assert.deepEqual(majorClock(MAJOR_SG_STARTS_MS), { phase: 'live', day: 1, of: 20, playoffs: false, finalDay: false });
  assert.deepEqual(majorClock(BRT(2026, 12, 9, 23, 59)), { phase: 'live', day: 16, of: 20, playoffs: false, finalDay: false });
  assert.deepEqual(majorClock(BRT(2026, 12, 10, 0, 0)), { phase: 'live', day: 17, of: 20, playoffs: true, finalDay: false });
  assert.deepEqual(majorClock(BRT(2026, 12, 13, 20)), { phase: 'live', day: 20, of: 20, playoffs: true, finalDay: true });
  assert.equal(majorClock(MAJOR_SG_PROMO_ENDS_MS - 1).phase, 'live');
});

test('depois de 13/12: nada (e a vitrine sai do ar junto)', () => {
  assert.deepEqual(majorClock(MAJOR_SG_PROMO_ENDS_MS), { phase: 'after' });
  assert.deepEqual(majorClock(Date.UTC(2027, 0, 1)), { phase: 'after' });
  assert.equal(majorPromoOn(MAJOR_SG_PROMO_ENDS_MS), false);
  assert.equal(majorPromoOn(MAJOR_SG_PROMO_ENDS_MS - 1), true);
});
