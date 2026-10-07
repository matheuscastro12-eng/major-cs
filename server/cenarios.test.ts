// Modo Cenário + Desafio da Semana: engine (objetivos, nota, mods, semana) e servidor (plausibilidade, tempo mínimo, melhor da semana).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CENARIOS, cenarioById, createRun, evaluateRun, recordEvent, validateLog, verifySubmission, maxScore,
  weeklyChallenge, weeklyFromId, weeklyId, multiplierOf, brokenMods, startingSquad, normalizeMods, parseRun,
  type CenarioDef, type CenarioRun, type CenEventCtx,
} from '../src/engine/cenarios/index.js';
import { MAJOR_EVERY } from '../src/engine/mundo/circuito.js';
import { CEN_MAJOR_EVERY } from '../src/engine/cenarios/validate.js';
import { acceptWeek, cenarioBoard, cenarioMe, cenarioStart, cenarioSubmit, maybeCleanup, resetCleanupClock, retentionCutoffId } from './cenarios.js';
import type { SqlTag } from './ultimate-economy.js';

const def = cenarioById('mibr_rebuild')!;
const ev = (split: number, o: Partial<CenEventCtx> = {}): CenEventCtx => ({ phase: 'e', split, finalPos: 6, tier: 2, budget: 1_000_000, ...o });

/** simula um split: 2 etapas + fechamento (com a 3ª etapa); Major só nos splits de Major */
function playSplit(d: CenarioDef, run: CenarioRun, split: number, o: { champ?: number; tier: number; q?: boolean; wonMajor?: boolean; budget?: number }): CenarioRun {
  let r = run;
  const tierNow = () => (r.log.length ? r.log[r.log.length - 1].t : r.startTier);
  for (let i = 0; i < 2; i++) r = recordEvent(d, r, ev(split, { isChampion: i === 0 && (o.champ ?? 0) > 0, finalPos: i === 0 && (o.champ ?? 0) > 0 ? 1 : 5, tier: tierNow(), budget: o.budget ?? 1_000_000 }));
  const major = !!o.q && split % 4 === 0;
  r = recordEvent(d, r, { phase: major ? 'm' : 's', split, finalPos: 6, tier: o.tier, budget: o.budget ?? 1_000_000, qualified: o.q, wonMajor: major && o.wonMajor });
  return r;
}

test('catálogo: ids únicos, textos nos 3 idiomas, prazo e objetivos', () => {
  assert.equal(new Set(CENARIOS.map((c) => c.id)).size, CENARIOS.length);
  for (const c of CENARIOS) {
    for (const t of [c.title, c.context, c.tagline, ...c.objectives.map((o) => o.text)]) assert.ok(t.pt && t.en && t.es, c.id);
    assert.ok(c.deadline >= 3 && c.objectives.length >= 2);
  }
});

test('objetivos com prazo: cumpridos, velocidade e nota A; nada conta fora do prazo', () => {
  let run = createRun(def, { startSplit: 4, startTier: 2, mods: [] });
  run = playSplit(def, run, 4, { champ: 1, tier: 2 });
  run = playSplit(def, run, 5, { tier: 1, q: true });
  const r = evaluateRun(def, run, 6);
  assert.equal(r.allDone, true);
  assert.equal(r.finished, true);
  assert.equal(r.objPts, 750);
  assert.ok(r.speed > 0);
  assert.ok(['A', 'S'].includes(r.grade));
  // congelado depois de cumprir tudo
  assert.equal(recordEvent(def, run, ev(6)).log.length, run.log.length);
  // fora do prazo não registra
  const late = createRun(def, { startSplit: 1, startTier: 2, mods: [] });
  assert.equal(recordEvent(def, late, ev(9)).log.length, 0);
});

test('nota B/C e medalha; stayTier1 só fecha no fim e falha ao cair', () => {
  let run = createRun(def, { startSplit: 1, startTier: 2, mods: [] });
  for (let s = 1; s <= 8; s++) run = playSplit(def, run, s, { champ: s === 2 ? 1 : 0, tier: 2 });
  const r = evaluateRun(def, run, 9);
  assert.equal(r.finished, true);
  assert.equal(r.objPts, 200);
  assert.equal(r.grade, 'C');
  assert.equal(r.medal, 'bronze');
  const vit = cenarioById('dinastia_vitality')!;
  let v = createRun(vit, { startSplit: 1, startTier: 1, mods: [] });
  v = playSplit(vit, v, 1, { tier: 1 });
  assert.equal(evaluateRun(vit, v, 2).objectives.find((o) => o.def.kind === 'stayTier1')!.doneAt, null);
  v = playSplit(vit, v, 2, { tier: 2 });
  assert.equal(evaluateRun(vit, v, 3).objectives.find((o) => o.def.kind === 'stayTier1')!.failed, true);
});

test('modificadores: multiplicador, quebra perde o bônus, elenco de largada', () => {
  assert.equal(multiplierOf(['sub21', 'zeroBudget', 'national']), 2.5); // teto
  assert.equal(multiplierOf(['zeroBudget']), 1.5);
  assert.deepEqual(normalizeMods(['national', 'x', 'sub21', 'sub21']), ['sub21', 'national']);
  const squad = [{ id: 'a', age: 19, country: 'br' }, { id: 'b', age: 24, country: 'br' }, { id: 'c', age: 20, country: 'ar' }, { id: 'd', age: 21, country: 'br' }];
  assert.deepEqual(startingSquad(['sub21', 'national'], squad).map((p) => p.id), ['a', 'd']);
  assert.deepEqual(brokenMods(['sub21', 'national'], squad), ['sub21', 'national']);
  let run = createRun(def, { startSplit: 1, startTier: 2, mods: ['zeroBudget', 'sub21'] });
  run = recordEvent(def, run, { ...ev(1), broken: ['sub21'] });
  const r = evaluateRun(def, run, 1);
  assert.deepEqual(r.modsKept, ['zeroBudget']);
  assert.equal(r.mult, 1.5);
});

test('semana ISO: determinística, igual pra todos, sem repetir em semanas seguidas, seed fixa', () => {
  const now = Date.UTC(2026, 9, 7, 15);
  const a = weeklyChallenge(now), b = weeklyChallenge(Date.UTC(2026, 9, 5, 0, 1));
  assert.equal(a.id, 'wk-2026-41');
  assert.equal(a.id, b.id);
  assert.equal(a.def.id, b.def.id);
  assert.equal(a.seed, 'cen:wk-2026-41');
  const next = weeklyChallenge(now + 7 * 86_400_000);
  assert.notEqual(next.def.id, a.def.id);
  assert.equal(weeklyFromId('wk-2026-99'), null);
  assert.equal(weeklyFromId('lixo'), null);
  assert.equal(weeklyId(Date.UTC(2027, 0, 1)), 'wk-2026-53');
});

test('plausibilidade: logs impossíveis são recusados', () => {
  const base = createRun(def, { startSplit: 1, startTier: 2, mods: [] });
  const mk = (log: CenarioRun['log']) => ({ ...base, log });
  assert.equal(validateLog(def, mk([{ s: 1, p: 'e', pos: 3, c: 1, t: 2, b: 100 }])), 'champion_not_first');
  assert.equal(validateLog(def, mk([1, 2, 3, 4].map(() => ({ s: 1, p: 'e' as const, pos: 1, c: 1 as const, t: 2, b: 100 })))), 'too_many_events');
  assert.equal(validateLog(def, mk([{ s: 1, p: 's', t: 2, b: 1 }, { s: 1, p: 's', t: 1, b: 1 }])), 'too_many_closes');
  assert.equal(validateLog(def, mk([{ s: 1, p: 's', t: 3, b: 1 }, { s: 2, p: 's', t: 1, b: 1 }])), 'tier_jump');
  assert.equal(validateLog(def, mk([{ s: 4, p: 'm', w: 1, t: 2, b: 1 }])), 'major_won_not_qualified');
  assert.equal(validateLog(def, mk([{ s: 1, p: 'm', q: 1, t: 2, b: 1 }])), 'too_many_majors'); // Major fora do split de Major
  assert.equal(CEN_MAJOR_EVERY, MAJOR_EVERY);
  assert.equal(validateLog(def, mk([{ s: 9, p: 'e', pos: 2, t: 2, b: 1 }])), 'split_out_of_range');
  assert.equal(validateLog(def, mk([{ s: 2, p: 's', t: 2, b: 1 }, { s: 1, p: 's', t: 2, b: 1 }])), 'out_of_order');
  // run de verdade passa e o teto cobre
  let run = base;
  run = playSplit(def, run, 1, { champ: 1, tier: 1, q: true, wonMajor: true });
  const v = verifySubmission(def, run, 10_000);
  assert.ok(v.ok);
  if (v.ok) assert.ok(v.result.score <= maxScore(def));
  assert.deepEqual(verifySubmission(def, run, 30), { ok: false, reason: 'too_fast' });
  const half = playSplit(def, base, 1, { tier: 2 });
  assert.deepEqual(verifySubmission(def, half, 10_000), { ok: false, reason: 'not_finished' });
  assert.equal(parseRun({ v: 1, defId: 'x', startSplit: 1, startTier: 2, log: [{ s: 1, p: 'z', t: 1, b: 0 }] }), null);
});

// ── servidor (SQL falso em memória) ─────────────────────────────────────────
function fakeSql() {
  const rows = new Map<string, Record<string, unknown>>();
  const k = (w: unknown, e: unknown) => `${w}|${e}`;
  const queries: string[] = [];
  const sql = ((strings: TemplateStringsArray, ...p: unknown[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    queries.push(q);
    const run = (): Record<string, unknown>[] => {
      if (q.startsWith('CREATE')) return [];
      if (q.startsWith('INSERT INTO rtm_cenario_weekly')) {
        const [w, e, nick, at] = p; const cur = rows.get(k(w, e));
        if (cur) { cur.started_at = at; cur.nick = nick; cur.attempts = Number(cur.attempts) + 1; return [{ attempts: cur.attempts }]; }
        rows.set(k(w, e), { week_id: w, email: e, nick, started_at: at, attempts: 1, score: null, grade: null, mods: null, submitted_at: null });
        return [{ attempts: 1 }];
      }
      if (q.startsWith('SELECT started_at, score')) { const r = rows.get(k(p[0], p[1])); return r ? [r] : []; }
      if (q.startsWith('SELECT score, grade, attempts')) { const r = rows.get(k(p[0], p[1])); return r ? [r] : []; }
      if (q.startsWith('UPDATE rtm_cenario_weekly SET score')) {
        const [score, grade, mods, at, w, e, s2] = p; const r = rows.get(k(w, e));
        if (!r || (r.score != null && Number(r.score) >= Number(s2))) return [];
        Object.assign(r, { score, grade, mods, submitted_at: at }); return [{ score }];
      }
      if (q.startsWith('SELECT count(*)::int AS n FROM rtm_cenario_weekly WHERE week_id=? AND score >')) return [{ n: [...rows.values()].filter((r) => r.week_id === p[0] && r.score != null && Number(r.score) > Number(p[1])).length }];
      if (q.startsWith('SELECT count(*)::int AS n FROM rtm_cenario_weekly WHERE week_id=? AND score IS NOT NULL')) return [{ n: [...rows.values()].filter((r) => r.week_id === p[0] && r.score != null).length }];
      if (q.startsWith('SELECT nick, score, grade, mods')) return [...rows.values()].filter((r) => r.week_id === p[0] && r.score != null).sort((a, b) => Number(b.score) - Number(a.score));
      if (q.startsWith('DELETE FROM rtm_cenario_weekly')) { for (const [key, r] of rows) if (String(r.week_id) < String(p[0])) rows.delete(key); return []; }
      throw new Error(`query inesperada: ${q}`);
    };
    return { then: (ok: never, err: never) => Promise.resolve().then(run).then(ok, err) };
  }) as unknown as SqlTag;
  return { sql, rows, queries };
}

test('servidor: start → submit recalcula, exige tempo mínimo, guarda a melhor, placar e retenção', async () => {
  const { sql, rows, queries } = fakeSql();
  const t0 = Date.UTC(2026, 9, 7, 12);
  const wk = weeklyChallenge(t0);
  const d = wk.def;
  assert.equal(acceptWeek(wk.id, t0, 'start'), true);
  assert.equal(acceptWeek('wk-2026-40', t0, 'start'), false);
  assert.deepEqual(await cenarioStart(sql, t0, 'a@x', 'alpha', 'wk-2026-30'), { ok: false, error: 'bad_week' });
  assert.equal((await cenarioSubmit(sql, t0, 'a@x', wk.id, { v: 1 })).ok, false);

  let run = createRun(d, { startSplit: 1, startTier: 2, mods: ['zeroBudget'], weekly: wk.id, seed: wk.seed });
  for (let s = 1; s <= d.deadline; s++) run = playSplit(d, run, s, { champ: 1, tier: 1, q: true, wonMajor: s === 1 });
  // sem start
  assert.deepEqual(await cenarioSubmit(sql, t0, 'a@x', wk.id, run), { ok: false, error: 'not_started' });
  await cenarioStart(sql, t0, 'a@x', 'alpha', wk.id);
  // rápido demais
  assert.deepEqual(await cenarioSubmit(sql, t0 + 5_000, 'a@x', wk.id, run), { ok: false, error: 'too_fast' });
  // desafio errado (seed trocada)
  assert.deepEqual(await cenarioSubmit(sql, t0 + 3_600_000, 'a@x', wk.id, { ...run, seed: 'outra' }), { ok: false, error: 'wrong_challenge' });
  const ok = await cenarioSubmit(sql, t0 + 3_600_000, 'a@x', wk.id, { ...run, submitted: 999_999 });
  assert.ok(ok.ok);
  const expected = evaluateRun(d, run, d.deadline + 1).score;
  if (ok.ok) { assert.equal(ok.score, expected); assert.equal(ok.rank, 1); assert.equal(ok.improved, true); }
  // segunda tentativa pior não substitui a melhor
  await cenarioStart(sql, t0 + 4_000_000, 'a@x', 'alpha', wk.id);
  let worse = createRun(d, { startSplit: 1, startTier: 2, mods: [], weekly: wk.id, seed: wk.seed });
  for (let s = 1; s <= d.deadline; s++) worse = playSplit(d, worse, s, { tier: 2 });
  const w2 = await cenarioSubmit(sql, t0 + 9_000_000, 'a@x', wk.id, worse);
  assert.ok(w2.ok && !w2.improved && w2.best === expected);
  // outro jogador
  await cenarioStart(sql, t0, 'b@x', 'bravo', wk.id);
  await cenarioSubmit(sql, t0 + 9_000_000, 'b@x', wk.id, worse);
  const board = await cenarioBoard(sql, wk.id);
  assert.equal(board.total, 2);
  assert.deepEqual(board.board.map((r) => r.nick), ['alpha', 'bravo']);
  assert.deepEqual(board.board[0].mods, ['zeroBudget']);
  const me = await cenarioMe(sql, 'b@x', wk.id);
  assert.equal(me.rank, 2);
  assert.equal(me.attempts, 1);
  // retenção: só pela limpeza throttled, nunca no submit
  assert.ok(!queries.some((q) => q.startsWith('DELETE')));
  rows.set('wk-2025-01|old', { week_id: 'wk-2025-01', email: 'old', score: 1 });
  resetCleanupClock();
  assert.equal(await maybeCleanup(sql, t0), true);
  assert.equal(await maybeCleanup(sql, t0 + 1000), false);
  assert.equal(rows.has('wk-2025-01|old'), false);
  assert.equal(rows.has(`${wk.id}|a@x`), true);
  assert.ok(retentionCutoffId(t0) < wk.id);
});
