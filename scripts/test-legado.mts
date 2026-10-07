// Legado e Dinastia (super atualização 2). Roda via `npm run test:sim`.
//
// Cobertura:
//   - prêmios da cena: rating com amostra vence fama; título grande pesa; revelação ≤ 21;
//     MVP de evento sai do campeão; melhor técnico = time com mais pontos; time ideal com AWP+IGL
//   - determinismo (mesma entrada → mesmo resultado, ordem do pool não importa)
//   - bloco `legado`: leitura tolerante, poda (anos/camisas), ano pendente e cerimônia não vista
//   - tamanho no save: 30 anos de prêmios + 30 camisas cabem em < 40 KB (podado)
//   - linha do tempo, recordes, lendas (camisa só pra lenda que saiu) e Hall do manager

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSceneAwards, sceneScore, teamResultsOfYear, type ScenePlayer } from '../src/engine/legado/premios.ts';
import {
  emptyLegado, legadoOf, pendingAwardYear, unseenCeremony, withShirt, withYear, lastClosedYear,
  MAX_SHIRTS, MAX_YEARS, type LegadoState,
} from '../src/engine/legado/model.ts';
import { buildLegado, legendRank, type LegadoInput } from '../src/engine/legado/historia.ts';
import type { SeasonEventLine, SeasonStats } from '../src/engine/career/seasonStats.ts';
import type { WorldEventResult } from '../src/engine/mundo/model.ts';
import type { Role } from '../src/types.ts';

const line = (split: number, maps: number, k: number, d: number, extra: Partial<SeasonEventLine> = {}): SeasonEventLine => ({
  split, event: 1, eventName: `Evento ${split}`, tier: 1,
  k, d, a: Math.round(k * 0.3), dmg: k * 95, kast: Math.round(maps * 24 * 0.72), rounds: maps * 24, maps,
  placement: null, champion: false, ...extra,
});

function pool(): { players: ScenePlayer[]; stats: SeasonStats; results: WorldEventResult[] } {
  const roles: Role[] = ['AWP', 'IGL', 'Entry', 'Rifler', 'Support'];
  const players: ScenePlayer[] = [];
  const stats: SeasonStats = {};
  for (let t = 0; t < 6; t++) {
    for (let i = 0; i < 5; i++) {
      const id = `p${t}${i}`;
      players.push({ id, statsId: t === 0 ? `user__${id}` : id, nick: `N${t}${i}`, country: 'br', role: roles[i], age: 20 + i + t, ovr: 80 + t, teamId: t === 0 ? 'user' : `t${t}`, team: t === 0 ? 'YOU' : `T${t}` });
    }
  }
  // um craque do time 1 (OVR baixo) com rating absurdo em 30 mapas
  stats.p10 = [line(1, 15, 400, 230), line(2, 15, 400, 230)];
  // um famoso do time 5 (OVR 85) com amostra ruim
  stats.p51 = [line(1, 20, 250, 330)];
  const results: WorldEventResult[] = [
    { eventId: 'major:4', split: 4, name: 'Major', kind: 'major', tier: 1, lan: true, placements: [{ teamId: 't2', place: 1 }, { teamId: 'user', place: 2 }] },
    { eventId: 'e1', split: 2, name: 'Liga A', kind: 'league', tier: 1, placements: [{ teamId: 'user', place: 1 }, { teamId: 't3', place: 2 }] },
    { eventId: 'e-out', split: 7, name: 'Outro ano', kind: 'league', tier: 1, placements: [{ teamId: 't4', place: 1 }] },
  ];
  return { players, stats, results };
}

const teams = [{ id: 'user', tag: 'YOU', coachNick: 'Você' }, ...[1, 2, 3, 4, 5].map((t) => ({ id: `t${t}`, tag: `T${t}`, coachNick: `C${t}` }))];

test('sceneScore: rating com amostra pesa, amostra curta tem credibilidade parcial', () => {
  assert.ok(sceneScore(80, 1.4, 30, 0) > sceneScore(85, 0, 0, 0));
  assert.ok(sceneScore(80, 1.4, 3, 0) < sceneScore(80, 1.4, 30, 0));
  assert.ok(sceneScore(80, 0, 0, 40) > sceneScore(80, 0, 0, 10));
});

test('prêmios da cena: Top 20, MVP de evento, revelação, técnico e time ideal', () => {
  const { players, stats, results } = pool();
  const y = computeSceneAwards({ year: 1, players, teams, seasonStats: stats, results });
  assert.equal(y.top20.length, 20);
  assert.equal(y.startSplit, 1); assert.equal(y.endSplit, 4);
  assert.equal(y.top20[0].id, 'p10', 'o craque com rating alto e amostra lidera');
  assert.ok(y.top20[0].rating > 1.3);
  // Major: MVP do campeão (t2), Major primeiro na lista
  assert.equal(y.mvps[0].major, true);
  assert.equal(y.mvps[0].teamId, 't2');
  assert.ok(!y.mvps.some((m) => m.eventId === 'e-out'), 'evento de outro ano não entra');
  // técnico: t2 (Major 10×4=40) > user (vice Major 20 + liga 20 = 40) → desempate por id… user < t2? ambos 40
  assert.ok(y.coach && (y.coach.teamId === 't2' || y.coach.teamId === 'user'));
  // revelação ≤ 21
  const rev = y.top20.find((e) => e.id === y.revelation) ?? y.revelationEntry;
  assert.ok(rev && rev.age! <= 21);
  // time ideal: 5 distintos, com AWP e IGL
  assert.equal(new Set(y.ideal).size, 5);
  const roles = y.ideal.map((id) => y.top20.find((e) => e.id === id)!.role);
  assert.ok(roles.includes('AWP') && roles.includes('IGL'));
  const tr = teamResultsOfYear(results, 1);
  assert.equal(tr.get('user')!.titles, 1);
  assert.equal(tr.get('t2')!.majors, 1);
});

test('prêmios da cena: determinístico e independente da ordem do pool', () => {
  const { players, stats, results } = pool();
  const a = computeSceneAwards({ year: 1, players, teams, seasonStats: stats, results });
  const b = computeSceneAwards({ year: 1, players: [...players].reverse(), teams, seasonStats: stats, results });
  assert.deepEqual(a, b);
});

test('bloco legado: leitura tolerante, poda e pendências', () => {
  assert.deepEqual(legadoOf(undefined), emptyLegado());
  assert.deepEqual(legadoOf({ v: 9 }), emptyLegado());
  assert.deepEqual(legadoOf('lixo'), emptyLegado());
  assert.equal(lastClosedYear(4), 0);
  assert.equal(lastClosedYear(5), 1);
  let s: LegadoState = emptyLegado();
  assert.equal(pendingAwardYear(s, 4), null);
  assert.equal(pendingAwardYear(s, 5), 1);
  const { players, stats, results } = pool();
  for (let year = 1; year <= 30; year++) s = withYear(s, computeSceneAwards({ year, players, teams, seasonStats: stats, results }));
  assert.equal(s.years.length, MAX_YEARS);
  assert.equal(s.years[0].year, 21);
  assert.equal(unseenCeremony(s)?.year, 30);
  s = { ...s, seenYear: 30 };
  assert.equal(unseenCeremony(s), null);
  for (let i = 0; i < 30; i++) s = withShirt(s, { playerId: `x${i}`, nick: `X${i}`, split: i, maps: 100, titles: 3 });
  assert.equal(s.shirts.length, MAX_SHIRTS);
  assert.equal(withShirt(s, s.shirts[0]), s, 'camisa repetida não duplica');
  const bytes = JSON.stringify(s).length;
  assert.ok(bytes < 40_000, `bloco legado podado cabe no save (${bytes} bytes)`);
  // round-trip
  assert.deepEqual(legadoOf(JSON.parse(JSON.stringify(s))), s);
});

function legadoInput(legado: LegadoState): LegadoInput {
  const info: Record<string, { nick: string; role: string }> = { a: { nick: 'Alfa', role: 'AWP' }, b: { nick: 'Beta', role: 'IGL' }, c: { nick: 'Gama', role: 'Entry' } };
  return {
    split: 13, orgName: 'Minha Org', tier: 1,
    history: [
      { split: 1, circuit: 'Liga 3', position: 1, wins: 7, losses: 0, prize: 10_000, champion: true },
      { split: 2, circuit: 'Liga 3', position: 1, wins: 6, losses: 1, prize: 12_000, champion: true },
      { split: 3, circuit: 'Liga 2', position: 1, wins: 5, losses: 2, prize: 30_000, champion: true },
      { split: 4, circuit: 'Liga 2', position: 3, wins: 4, losses: 3, prize: 20_000, champion: false, major: { placement: 'champion', champion: true } },
      { split: 5, circuit: 'Liga 1', position: 9, wins: 1, losses: 6, prize: 5_000, champion: false },
    ],
    careerStats: {
      user__a: { k: 3000, d: 2200, a: 600, dmg: 260_000, kast: 2000, rounds: 2700, maps: 120 },
      user__b: { k: 1500, d: 1600, a: 700, dmg: 160_000, kast: 1800, rounds: 2600, maps: 110 },
      user__c: { k: 100, d: 120, a: 20, dmg: 9_000, kast: 60, rounds: 96, maps: 4 },
    },
    seasonStats: {
      user__a: [line(1, 10, 260, 150, { champion: true, placement: 1 }), line(2, 10, 250, 160, { champion: true, placement: 1 }), line(3, 10, 240, 170, { placement: 1 })],
      user__b: [line(1, 10, 150, 160, { champion: true, placement: 1 })],
    },
    stints: { a: [{ team: 'Minha Org', from: 1, to: 9, startOvr: 85 }], b: [{ team: 'Minha Org', from: 1, to: null, startOvr: 80 }], c: [{ team: 'Minha Org', from: 10, to: null, startOvr: 70 }] },
    peakOvr: { a: 92, b: 86, c: 72 },
    squadIds: ['b', 'c'],
    legado,
    infoOf: (id) => info[id] ?? null,
  };
}

test('legado do clube: linhas all-time, lendas, recordes, timeline e Hall', () => {
  const v = buildLegado(legadoInput(emptyLegado()));
  const a = v.lines.find((l) => l.id === 'a')!;
  assert.equal(a.nick, 'Alfa');
  assert.equal(a.maps, 120);
  assert.equal(a.titles, 3);
  assert.equal(a.majors, 1, 'estava no elenco no split do Major');
  assert.equal(a.lastSplit, 9);
  assert.ok(a.rating > 1);
  // lendas
  const la = v.legends.find((l) => l.id === 'a');
  assert.ok(la, 'Alfa é lenda');
  assert.ok(la!.canRetireShirt, 'saiu do clube: camisa pode subir');
  const lb = v.legends.find((l) => l.id === 'b');
  if (lb) assert.equal(lb.canRetireShirt, false, 'quem ainda está no elenco não tem a camisa aposentada');
  assert.ok(!v.legends.some((l) => l.id === 'c'));
  assert.equal(legendRank(10), null);
  // recordes
  const rec = Object.fromEntries(v.records.club.map((r) => [r.id, r]));
  assert.equal(rec.titles.value, 3);
  assert.equal(rec.majors.value, 1);
  assert.equal(rec.titleStreak.value, 3);
  assert.equal(rec.unbeaten.value, 7);
  const ind = Object.fromEntries(v.records.individual.map((r) => [r.id, r]));
  assert.equal(ind.mostMaps.holder, 'Alfa');
  assert.equal(ind.peakOvr.value, 92);
  // timeline: mais recente primeiro, ano 1 com 3 títulos e 1 Major
  const y1 = v.timeline.find((s) => s.year === 1)!;
  assert.equal(y1.titles, 3);
  assert.equal(y1.majors, 1);
  assert.equal(v.timeline[0].year >= v.timeline[v.timeline.length - 1].year, true);
  assert.ok(v.timeline.flatMap((s) => s.entries).some((e) => e.kind === 'legendLeft' && e.a === 'Alfa'));
  // Hall do manager
  const badge = Object.fromEntries(v.hall.badges.map((b) => [b.id, b]));
  assert.equal(badge.majorChampion.unlocked, true);
  assert.equal(badge.dynasty.unlocked, true);
  assert.equal(badge.unbeaten.unlocked, true);
  assert.equal(badge.multiMajor.unlocked, false);
  assert.equal(badge.decade.progress, 12);
  assert.ok(v.hall.reputation >= 20 && v.hall.reputation <= 99);
});

test('legado do clube: honras da cena entram na timeline e nas lendas; camisa aposentada', () => {
  const { players, stats, results } = pool();
  // o Alfa do clube vira #1 do mundo no ano 1
  const ps = players.map((p) => (p.id === 'p10' ? { ...p, id: 'a', statsId: 'user__a', teamId: 'user', team: 'YOU', nick: 'Alfa' } : p));
  const st = { ...stats, user__a: stats.p10 };
  let lg = withYear(emptyLegado(), computeSceneAwards({ year: 1, players: ps, teams, seasonStats: st, results }));
  lg = withShirt(lg, { playerId: 'a', nick: 'Alfa', split: 11, maps: 120, titles: 3 });
  const v = buildLegado(legadoInput(lg));
  const a = v.legends.find((l) => l.id === 'a')!;
  assert.equal(a.bestRank, 1);
  assert.equal(a.shirtRetired, true);
  assert.equal(a.canRetireShirt, false);
  const kinds = v.timeline.flatMap((s) => s.entries.map((e) => e.kind));
  assert.ok(kinds.includes('scene') && kinds.includes('shirt'));
  assert.equal(v.hall.badges.find((b) => b.id === 'playerOfYear')!.unlocked, true);
});
