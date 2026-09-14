// [URG-4] STREAK DO DIÁRIO: dia no fuso de SP, ramos do recordDailyPlay, status
// (atRisk/lost/hoursLeft), merge local×servidor e marcos idempotentes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, dayKey, emptyStreak, mergeStreak, nextMilestone, pendingMilestones, recordDailyPlay,
  streakKey, streakRewardFor, streakStatus, STREAK_MILESTONES, STREAK_REWARDS,
} from '../src/engine/daily/streak.ts';
import { FRAMES, frameById } from '../src/engine/ultimate/cosmetics.ts';

const T = (iso: string) => new Date(iso).getTime();

test('dayKey: calendário de São Paulo (UTC-3), inclusive na virada da meia-noite', () => {
  assert.equal(dayKey(T('2026-09-14T12:00:00Z')), '2026-09-14');
  // 02:59Z = 23:59 de SP do dia anterior; 03:00Z = 00:00 de SP do dia
  assert.equal(dayKey(T('2026-09-15T02:59:59Z')), '2026-09-14');
  assert.equal(dayKey(T('2026-09-15T03:00:00Z')), '2026-09-15');
  // virada de mês/ano
  assert.equal(dayKey(T('2027-01-01T01:00:00Z')), '2026-12-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('recordDailyPlay: mesmo dia no-op, dia seguinte +1, pulou ≥1 dia reinicia em 1, best acompanha', () => {
  let s = recordDailyPlay(emptyStreak(), '2026-09-01');
  assert.deepEqual(s, { current: 1, best: 1, lastDay: '2026-09-01' });
  assert.equal(recordDailyPlay(s, '2026-09-01'), s);                // no-op (mesma referência)
  s = recordDailyPlay(s, '2026-09-02');
  s = recordDailyPlay(s, '2026-09-03');
  assert.deepEqual(s, { current: 3, best: 3, lastDay: '2026-09-03' });
  s = recordDailyPlay(s, '2026-09-05');                             // pulou o dia 4
  assert.deepEqual(s, { current: 1, best: 3, lastDay: '2026-09-05' });
  s = recordDailyPlay(s, '2026-09-06');
  assert.deepEqual(s, { current: 2, best: 3, lastDay: '2026-09-06' });
});

test('streakStatus: hoje ok, ontem = atRisk com horas até a meia-noite de SP, antes de ontem = lost', () => {
  const s = { current: 5, best: 5, lastDay: '2026-09-13' };
  // 2026-09-14 20:00 de SP = 23:00Z → faltam 4h
  const risk = streakStatus(s, T('2026-09-14T23:00:00Z'));
  assert.deepEqual(risk, { current: 5, atRisk: true, hoursLeft: 4, lost: false, previous: 0 });
  // 23:30 de SP → arredonda pra cima: 1h
  assert.equal(streakStatus(s, T('2026-09-15T02:30:00Z')).hoursLeft, 1);
  const ok = streakStatus(s, T('2026-09-13T15:00:00Z'));
  assert.equal(ok.atRisk, false); assert.equal(ok.current, 5); assert.equal(ok.lost, false);
  const lost = streakStatus(s, T('2026-09-15T15:00:00Z'));
  assert.deepEqual({ current: lost.current, atRisk: lost.atRisk, lost: lost.lost, previous: lost.previous }, { current: 0, atRisk: false, lost: true, previous: 5 });
  // sem streak nunca está em risco
  assert.equal(streakStatus(emptyStreak(), T('2026-09-14T12:00:00Z')).atRisk, false);
});

test('mergeStreak: o dia mais recente vence, empate = maior current, best nunca regride', () => {
  const local = { current: 2, best: 9, lastDay: '2026-09-14' };
  const server = { current: 6, best: 6, lastDay: '2026-09-13' };
  assert.deepEqual(mergeStreak(local, server), { current: 2, best: 9, lastDay: '2026-09-14' });
  assert.deepEqual(mergeStreak(server, local), { current: 2, best: 9, lastDay: '2026-09-14' });
  assert.deepEqual(mergeStreak({ current: 3, best: 3, lastDay: '2026-09-14' }, local), { current: 3, best: 9, lastDay: '2026-09-14' });
  assert.deepEqual(mergeStreak(emptyStreak(), server), { current: 6, best: 6, lastDay: '2026-09-13' });
  assert.deepEqual(mergeStreak(server, emptyStreak()), server);
});

test('marcos: 3/7/14/30/60/100, próximo marco, prêmios e molduras existem no catálogo', () => {
  assert.deepEqual([...STREAK_MILESTONES], [3, 7, 14, 30, 60, 100]);
  assert.equal(nextMilestone(0), 3); assert.equal(nextMilestone(3), 7); assert.equal(nextMilestone(99), 100); assert.equal(nextMilestone(100), null);
  assert.equal(streakRewardFor(3)?.coins, 1000);
  assert.equal(streakRewardFor(7)?.coins, 3000); assert.equal(streakRewardFor(7)?.frame, 'streak-7');
  assert.equal(streakRewardFor(30)?.coins, 15000); assert.equal(streakRewardFor(30)?.frame, 'streak-30');
  assert.equal(streakRewardFor(100)?.frame, 'streak-100');
  assert.equal(streakRewardFor(5), null);
  for (const r of STREAK_REWARDS) if (r.frame) assert.ok(frameById(r.frame), `moldura ${r.frame} existe`);
  assert.equal(new Set(FRAMES.map((f) => f.id)).size, FRAMES.length);
  assert.equal(frameById('streak-7')?.name, 'Sete dias');
  assert.equal(frameById('streak-30')?.name, 'Um mês sem falhar');
  assert.equal(frameById('streak-100')?.name, 'Centurião');
});

test('marcos idempotentes: pendingMilestones só devolve o que ainda não foi resgatado (chave streak:<n>)', () => {
  assert.deepEqual(pendingMilestones(2, []), []);
  assert.deepEqual(pendingMilestones(7, []), [3, 7]);
  assert.deepEqual(pendingMilestones(7, [streakKey(3)]), [7]);
  assert.deepEqual(pendingMilestones(7, [streakKey(3), streakKey(7)]), []);
  assert.equal(streakKey(30), 'streak:30');
});
