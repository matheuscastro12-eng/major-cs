// DIÁRIO — QUEM É O PRO? + O IMPOSTOR (engine/daily/whois.ts + impostor.ts).
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { DAILY_GAMES, dateKeyOf, normalizeGuess } from '../src/engine/daily/lines.ts';
import {
  whoisPool, whoisOfDay, findInPool, applyWhoisGuess, clueOf, freshWhois, giveUpWhois,
  shareTextOfWhois, WHOIS_MAX, WHOIS_MIN_OVR,
} from '../src/engine/daily/whois.ts';
import {
  impostorOfDay, applyPick, freshImpostor, shareTextOfImpostor, IMPOSTOR_TRIES,
} from '../src/engine/daily/impostor.ts';

const key = (d: number) => dateKeyOf(new Date(2026, 7, 1 + d)); // dias a partir da época local

test('registry: os 4 jogos diários registrados com ids únicos', () => {
  assert.deepEqual(DAILY_GAMES.map((g) => g.id), ['lines', 'whois', 'impostor', 'classic']);
  assert.equal(new Set(DAILY_GAMES.map((g) => g.id)).size, 4);
});

test('whois: pool respeitável, dia determinístico, ciclo sem repetição', () => {
  const pool = whoisPool(CS2_REAL_2026);
  assert.ok(pool.length >= 50, `pool pequeno demais (${pool.length})`);
  assert.ok(pool.every((p) => p.ovr >= WHOIS_MIN_OVR));
  assert.equal(new Set(pool.map((p) => p.id)).size, pool.length);
  // mesmo dia = mesmo pro; dias diferentes variam dentro do ciclo
  assert.equal(whoisOfDay(key(3), pool).id, whoisOfDay(key(3), pool).id);
  const window = Array.from({ length: 30 }, (_, d) => whoisOfDay(key(d), pool).id);
  assert.equal(new Set(window).size, 30, 'repetiu pro dentro do ciclo');
});

test('whois: dicas comparam certo e o jogo fecha nas regras', () => {
  const pool = whoisPool(CS2_REAL_2026);
  const target = whoisOfDay(key(0), pool);
  // acerto: clue toda verde + won
  const self = clueOf(target, target);
  assert.deepEqual([self.team, self.country, self.role, self.ovr], ['hit', 'hit', 'hit', 'hit']);
  let p = applyWhoisGuess(target, freshWhois(), target);
  assert.equal(p.won, true);
  assert.equal(p.done, true);
  // erro até o cap encerra sem vitória
  const wrongs = pool.filter((x) => x.id !== target.id).slice(0, WHOIS_MAX);
  let q = freshWhois();
  for (const w of wrongs) q = applyWhoisGuess(target, q, w);
  assert.equal(q.done, true);
  assert.equal(q.won, false);
  assert.equal(q.guesses.length, WHOIS_MAX);
  // chute repetido é no-op; findInPool resolve com normalização
  assert.equal(applyWhoisGuess(target, q, wrongs[0]), q);
  assert.equal(findInPool(pool, ` ${target.nick.toUpperCase()} `)?.id, target.id);
  assert.equal(findInPool(pool, 'zzz-nao-existe'), null);
  // share carrega o nº do dia e uma linha por chute
  const share = shareTextOfWhois(key(0), q, 3);
  assert.ok(share.includes('QUEM É O PRO?'));
  assert.equal(share.split('\n').length, 3 + WHOIS_MAX); // head + streakline? não: título+head+rows+url
  assert.ok(giveUpWhois(freshWhois()).done);
});

test('impostor: rodada íntegra e determinística — intruso NUNCA é da line', () => {
  for (let d = 0; d < 40; d++) {
    const r = impostorOfDay(key(d));
    assert.equal(r.players.length, 5);
    assert.ok(r.impostorIdx >= 0 && r.impostorIdx < 5);
    // o intruso não pertence (por nick) à line anunciada
    const intruder = r.players[r.impostorIdx];
    assert.notEqual(`${r.from.team} ${r.from.year}`, `${r.team} ${r.year}`);
    const legit = r.players.filter((_, i) => i !== r.impostorIdx).map((p) => normalizeGuess(p.nick));
    assert.ok(!legit.includes(normalizeGuess(intruder.nick)));
    assert.equal(new Set(r.players.map((p) => normalizeGuess(p.nick))).size, 5, `dia ${d}: nick duplicado`);
    // determinístico
    assert.deepEqual(impostorOfDay(key(d)), r);
  }
});

test('impostor: 2 tentativas, acerto fecha, share reflete', () => {
  const r = impostorOfDay(key(1));
  // acerto de primeira
  const won = applyPick(r, freshImpostor(), r.impostorIdx);
  assert.deepEqual([won.done, won.won, won.picks.length], [true, true, 1]);
  assert.ok(shareTextOfImpostor(key(1), r, won, 0).includes('DE PRIMEIRA'));
  // dois erros = eliminado
  const wrongIdxs = [0, 1, 2, 3, 4].filter((i) => i !== r.impostorIdx);
  let p = applyPick(r, freshImpostor(), wrongIdxs[0]);
  assert.equal(p.done, false);
  p = applyPick(r, p, wrongIdxs[1]);
  assert.deepEqual([p.done, p.won], [true, false]);
  assert.equal(p.picks.length, IMPOSTOR_TRIES);
  // pick após done / fora da faixa = no-op
  assert.equal(applyPick(r, p, r.impostorIdx), p);
  assert.deepEqual(applyPick(r, freshImpostor(), 9).picks, []);
});

test('classic: dataset íntegro (ids únicos, campeão em teamA, placar 2-0/2-1)', async () => {
  const { CLASSIC_FINALS } = await import('../src/engine/daily/classics.ts');
  assert.ok(CLASSIC_FINALS.length >= 15);
  assert.equal(new Set(CLASSIC_FINALS.map((f) => f.id)).size, CLASSIC_FINALS.length);
  for (const f of CLASSIC_FINALS) {
    assert.equal(f.score[0], 2, `${f.id}: campeão (teamA) tem de ter 2 mapas`);
    assert.ok(f.score[1] === 0 || f.score[1] === 1, `${f.id}: placar ${f.score.join('-')}`);
    assert.notEqual(f.teamA, f.teamB);
  }
});

test('classic: rodada determinística, resposta consistente, regras de 2 picks', async () => {
  const { classicOfDay, applyClassicPick, freshClassic, classicHint, shareTextOfClassic, CLASSIC_FINALS } =
    await import('../src/engine/daily/classics.ts');
  for (let d = 0; d < 25; d++) {
    const r = classicOfDay(key(d));
    assert.deepEqual(classicOfDay(key(d)), r);                     // determinístico
    assert.equal(r.options.length, 4);
    assert.ok(r.options.some((o) => o.key === r.answerKey), `dia ${d}: resposta fora das opções`);
    // a resposta aponta pro CAMPEÃO real do dataset
    const f = CLASSIC_FINALS.find((x) => x.id === r.id)!;
    const [ti, a, b] = r.answerKey.split('-').map(Number);
    assert.equal(r.teams[ti], f.teamA);
    assert.deepEqual([a, b], f.score);
  }
  const r = classicOfDay(key(2));
  // acerto de primeira fecha
  const won = applyClassicPick(r, freshClassic(), r.answerKey);
  assert.deepEqual([won.done, won.won], [true, true]);
  // dica: mesmo time = wrong-score; outro time = wrong-team
  const [ansTi] = r.answerKey.split('-');
  const sameTeamWrong = r.options.find((o) => o.key !== r.answerKey && o.key.startsWith(ansTi))!;
  const otherTeam = r.options.find((o) => !o.key.startsWith(ansTi))!;
  assert.equal(classicHint(r, sameTeamWrong.key), 'wrong-score');
  assert.equal(classicHint(r, otherTeam.key), 'wrong-team');
  // 2 erros = eliminado; pick inválido é no-op
  let p = applyClassicPick(r, freshClassic(), sameTeamWrong.key);
  assert.equal(p.done, false);
  p = applyClassicPick(r, p, otherTeam.key);
  assert.deepEqual([p.done, p.won], [true, false]);
  assert.equal(applyClassicPick(r, p, r.answerKey), p);
  assert.deepEqual(applyClassicPick(r, freshClassic(), 'x-9-9').picks, []);
  assert.ok(shareTextOfClassic(key(2), r, won, 0).includes('DE PRIMEIRA'));
});

test('dia perfeito: status agrega, streak encadeia por dia e é idempotente', async () => {
  // localStorage fake pro módulo de state rodar no Node
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  const { saveDailyProgress, dailyDayStatus, syncPerfectStreak, PERFECT_KEY, loadDailyStreak } =
    await import('../src/state/daily.ts');
  const ids = ['lines', 'whois', 'impostor', 'classic'];
  const d1 = key(0), d2 = key(1);
  // 3 vitórias + 1 aberto = não perfeito
  for (const id of ids.slice(0, 3)) saveDailyProgress(id, d1, { done: true, won: true });
  let st = dailyDayStatus(ids, d1);
  assert.deepEqual([st.done, st.won, st.perfect], [3, 3, false]);
  assert.equal(syncPerfectStreak(ids, d1).streak, 0);
  // fecha o 4º com vitória = perfeito; sync repetido não conta 2x
  saveDailyProgress('classic', d1, { done: true, won: true });
  assert.equal(dailyDayStatus(ids, d1).perfect, true);
  assert.equal(syncPerfectStreak(ids, d1).streak, 1);
  assert.equal(syncPerfectStreak(ids, d1).streak, 1);
  // dia seguinte perfeito encadeia (🔥 2)
  for (const id of ids) saveDailyProgress(id, d2, { done: true, won: true });
  assert.equal(syncPerfectStreak(ids, d2).streak, 2);
  assert.equal(loadDailyStreak(PERFECT_KEY).best, 2);
  // derrota em 1 jogo no d3 = dia não perfeito, streak não avança (fica em 2 até quebrar)
  const d3 = key(2);
  for (const id of ids.slice(0, 3)) saveDailyProgress(id, d3, { done: true, won: true });
  saveDailyProgress('classic', d3, { done: true, won: false });
  assert.equal(dailyDayStatus(ids, d3).perfect, false);
  assert.equal(syncPerfectStreak(ids, d3).streak, 2);
  delete (globalThis as Record<string, unknown>).localStorage;
});

test('badges: avaliação por streak/vitórias/flags cobre todos os defs', async () => {
  const { DAILY_BADGES, evaluateDailyBadges } = await import('../src/engine/daily/badges.ts');
  assert.equal(new Set(DAILY_BADGES.map((b) => b.id)).size, DAILY_BADGES.length);
  const none = evaluateDailyBadges({ bestStreak: {}, totalWins: 0, flags: {} });
  assert.equal(none.length, DAILY_BADGES.length);
  assert.ok(none.every((b) => !b.earned));
  const some = evaluateDailyBadges({
    bestStreak: { lines: 7, whois: 1, impostor: 0, classic: 2, perfect: 1 },
    totalWins: 12,
    flags: { ace: true },
  });
  const earned = new Set(some.filter((b) => b.earned).map((b) => b.def.id));
  assert.deepEqual([...earned].sort(), ['ace', 'perfect-1', 'streak-3', 'streak-7', 'wins-10']);
  // streak do perfect NÃO conta como streak de jogo
  const onlyPerfect = evaluateDailyBadges({ bestStreak: { perfect: 9 }, totalWins: 0, flags: {} });
  assert.ok(!onlyPerfect.find((b) => b.def.id === 'streak-7')!.earned);
  assert.ok(onlyPerfect.find((b) => b.def.id === 'perfect-7')!.earned);
});
