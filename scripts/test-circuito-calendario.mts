// CALENDÁRIO DO CIRCUITO (fase 4 · frente J): a temporada real da Carreira.
//
//   - 4 splits × 3 etapas × 8 eventos (tiers 1/2/3, mundiais e regionais), com
//     qualificatório FECHADO nos tier 1 e ABERTO nos tier 2, nomes reais;
//   - o split de Major tem os 3 RMRs e o Major (32 times, LAN);
//   - LAN × online pela sede real; qualificatório sempre online;
//   - field da etapa: faixas de força de sempre (dificuldade intacta) com os
//     convites saindo do VRS; campos disjuntos;
//   - rota do usuário (convite / qualificatório fechado / aberto), visto,
//     bootcamp e pausas.
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSeasonCalendar, seasonCalendarFrom, calendarFresh, defaultCalendar, etapaCalendar, majorCalendar, isMajorSplit,
  seasonOfSplit, seasonSplits, etapaTime, majorTime, SLOTS, slotName, entryRoute, qualifierPlan, qualifierOpponents,
  buildEtapaEvents, visaRisk, visaDenials, bootcampPlan, seasonBreaks, calendarVenue, parseEventId, eventIdOf,
  RMR_SLOTS, MAJOR_S1, INVITE_RANK, CLOSED_QUALI_RANK,
} from '../src/engine/mundo/circuito.ts';
import { T1_EVENTS, T2_EVENTS, MAJOR_NAMES, eventMeta, venueHost } from '../src/data/tournaments.ts';
import { migrateMundo } from '../src/engine/mundo/mundoMigration.ts';
import { aiPool, strengthMap } from './measure-circuito.mts';
import type { VrsEntry } from '../src/engine/mundo/model.ts';

test('calendário: temporada = 4 splits × 3 etapas × 8 eventos + qualificatórios + ciclo do Major', () => {
  for (const season of [1, 2, 7]) {
    const cal = buildSeasonCalendar(season);
    const splits = seasonSplits(season);
    const main = cal.filter((e) => e.kind === 'gsl');
    assert.equal(main.length, 4 * 3 * 8, 'eventos principais');
    assert.equal(cal.filter((e) => e.kind === 'qualifier' && e.qualifier === 'closed').length, 4 * 3 * 2, 'qualificatórios fechados (tier 1)');
    assert.equal(cal.filter((e) => e.kind === 'qualifier' && e.qualifier === 'open').length, 4 * 3 * 2, 'qualificatórios abertos (tier 2)');
    // ciclo do Major: só no split de Major, 3 RMRs + o Major
    const majSplit = splits.find(isMajorSplit)!;
    assert.equal(cal.filter((e) => e.kind === 'rmr').length, 3);
    const major = cal.find((e) => e.kind === 'major')!;
    assert.equal(major.split, majSplit);
    assert.equal(major.slots, 32);
    assert.ok(MAJOR_NAMES.includes(major.name), `nome real do Major (${major.name})`);
    assert.ok(cal.filter((e) => e.kind === 'rmr').every((r) => r.qualifiesTo === major.id && r.lan));
    // tiers e regiões
    for (const s of SLOTS) assert.equal(main.filter((e) => e.slot === s.id).length, 12, `slot ${s.id} em todas as etapas`);
    assert.ok(main.filter((e) => e.tier === 1).every((e) => T1_EVENTS.includes(e.name)), 'tier 1 com nomes reais');
    assert.ok(main.filter((e) => e.tier === 2).every((e) => T2_EVENTS.includes(e.name)), 'tier 2 com nomes reais');
    assert.ok(main.some((e) => e.region === 'americas') && main.some((e) => e.region === 'europe') && main.some((e) => e.region === 'asia'), 'regionais');
    // todo qualificatório aponta pro evento da mesma etapa e é online
    for (const q of cal.filter((e) => e.kind === 'qualifier')) {
      const target = cal.find((e) => e.id === q.qualifiesTo)!;
      assert.ok(target && target.split === q.split && target.etapa === q.etapa && target.week === q.week + 1);
      assert.equal(q.lan, false);
    }
    // semanas crescentes dentro do split; Major depois da etapa 3
    for (const sp of splits) {
      const ev = cal.filter((e) => e.split === sp);
      const w3 = Math.max(...ev.filter((e) => e.etapa === 3).map((e) => e.week));
      if (isMajorSplit(sp)) assert.ok(ev.filter((e) => e.kind === 'rmr' || e.kind === 'major').every((e) => e.week > w3));
    }
    // determinístico
    assert.deepEqual(buildSeasonCalendar(season), cal);
  }
});

test('calendário: nomes rotacionam por etapa (os 3 campeonatos do split são diferentes) e batem com o circuito de sempre', () => {
  for (const split of [1, 5, 9]) {
    const t1 = [1, 2, 3].map((e) => slotName('t1', split, e));
    assert.equal(new Set(t1).size, 3);
    assert.equal(etapaCalendar(split, 2).find((e) => e.slot === 't1')!.name, slotName('t1', split, 2));
  }
  assert.equal(majorCalendar(3).length, 0);
  assert.equal(majorCalendar(4).length, 4);
});

test('LAN × online: sede real decide; qualificatório online; RMR/Major LAN', () => {
  assert.deepEqual(venueHost('Katowice 🇵🇱'), { cc: 'pl', lan: true });
  assert.deepEqual(venueHost('online 🌐'), { cc: null, lan: false });
  assert.deepEqual(venueHost('online 🇧🇷'), { cc: null, lan: false });
  assert.equal(venueHost('circuito de acesso 🌐').lan, false);
  const cal = buildSeasonCalendar(1);
  const main = cal.filter((e) => e.kind === 'gsl');
  for (const e of main) assert.equal(e.lan, venueHost(eventMeta(e.name, e.tier).venue).lan, e.name);
  const lanShare = (tier: number) => main.filter((e) => e.tier === tier && e.lan).length / main.filter((e) => e.tier === tier).length;
  assert.ok(lanShare(1) > 0.7, `tier 1 é quase todo LAN (${lanShare(1)})`);
  assert.ok(lanShare(3) < lanShare(1), 'tier 3 é mais online que o tier 1');
  const major = cal.find((e) => e.kind === 'major')!;
  assert.ok(calendarVenue(major).lan && calendarVenue(major).cc);
  assert.equal(calendarVenue(cal.find((e) => e.kind === 'qualifier')!).lan, false);
});

test('calendário gravado: agenda do split + ciclo do Major da temporada; renova a cada split; migração v30 grava', () => {
  const c5 = seasonCalendarFrom(5);
  assert.ok(c5.filter((e) => e.kind !== 'major' && e.kind !== 'rmr').every((e) => e.split === 5));
  assert.equal(c5.filter((e) => e.kind === 'gsl').length, 24);
  assert.equal(c5.find((e) => e.kind === 'major')!.split, 8, 'a rota até o Major da temporada fica visível');
  assert.ok(calendarFresh(c5, 5));
  assert.ok(!calendarFresh(c5, 6), 'split novo renova');
  assert.ok(!calendarFresh(c5, 9), 'temporada nova renova');
  assert.ok(calendarFresh(seasonCalendarFrom(8), 8));
  assert.ok(JSON.stringify(c5).length < 10_000, `calendário gravado enxuto (${JSON.stringify(c5).length} B)`);
  // a temporada inteira continua sendo função pura (as telas regeneram)
  const full = buildSeasonCalendar(2);
  for (const e of c5) assert.deepEqual(full.find((x) => x.id === e.id), e);
  const m = migrateMundo({ split: 6, squad: [] });
  assert.deepEqual(m.mundo!.calendar, defaultCalendar({ split: 6 }));
  assert.ok(m.mundo!.calendar.length > 0);
  assert.equal(seasonOfSplit(4), 1);
  assert.equal(seasonOfSplit(5), 2);
  assert.ok(majorTime(4) > etapaTime(4, 3) && majorTime(4) < etapaTime(5, 1));
  assert.deepEqual(parseEventId(eventIdOf(6, 2, 't2-alt')), { kind: 'ev', split: 6, etapa: 2, slot: 't2-alt' });
});

test('field da etapa: o mesmo field de sempre (dificuldade intacta), convites pelo VRS, campos disjuntos', () => {
  const pool = aiPool(3);
  const str = strengthMap(pool);
  const legacy = buildEtapaEvents(pool, 3, 2, null);
  // VRS correlacionado com a força, mas embaralhado: o convite muda quem é núcleo, a faixa não
  const vrs: Record<string, VrsEntry> = {};
  pool.forEach((t, i) => { vrs[t.id] = { teamId: t.id, points: Math.round(t.teamwork * 12 + ((i * 7919) % 97) * 3), history: [] }; });
  const withVrs = buildEtapaEvents(pool, 3, 2, vrs);
  assert.deepEqual(withVrs.map((e) => [e.slot, e.teams.map((t) => t.id)]), legacy.map((e) => [e.slot, e.teams.map((t) => t.id)]), 'o VRS muda só quem é convidado, não o field');
  const seen = new Set<string>();
  for (const ev of withVrs) {
    assert.ok(ev.teams.length >= 5 && ev.teams.length <= 15);
    for (const t of ev.teams) { assert.ok(!seen.has(t.id), `time em dois eventos: ${t.id}`); seen.add(t.id); }
    assert.ok(ev.invited.every((id) => ev.teams.some((t) => t.id === id)), 'convidado está no field');
    const old = legacy.find((e) => e.slot === ev.slot);
    if (!old) continue;
    const avg = (ts: typeof ev.teams) => ts.reduce((a, t) => a + (str.get(t.id) ?? 0), 0) / ts.length;
    assert.ok(Math.abs(avg(ev.teams) - avg(old.teams)) < 0.01, `${ev.slot}: força média do field mudou (${avg(ev.teams).toFixed(1)} × ${avg(old.teams).toFixed(1)})`);
  }
  // o convite sai do VRS: no t1 os convidados são os de mais pontos da faixa
  const t1 = withVrs.find((e) => e.slot === 't1')!;
  const minInv = Math.min(...t1.invited.map((id) => vrs[id].points));
  const maxRest = Math.max(...t1.teams.filter((t) => !t1.invited.includes(t.id)).map((t) => vrs[t.id].points));
  assert.ok(minInv >= maxRest, 'convidados = topo do VRS dentro da faixa');
  // sem VRS, o de sempre: tier 1 mais forte que tier 3
  const s = (slot: string) => { const e = legacy.find((x) => x.slot === slot)!; return e.teams.reduce((a, t) => a + (str.get(t.id) ?? 0), 0) / e.teams.length; };
  assert.ok(s('t1') > s('t2') && s('t2') > s('t3'));
});

test('rota: convite pelo VRS, qualificatório fechado (tier 1) e aberto (tier 2), um tier abaixo', () => {
  assert.equal(entryRoute(3, 3, 80), 'direct');
  assert.equal(entryRoute(3, 2, 50), 'below');
  assert.equal(entryRoute(1, 3, 5), 'locked', 'dois tiers acima nunca');
  assert.equal(entryRoute(2, 3, 30), 'invite', `top ${INVITE_RANK[2]} é convidado ao tier 2`);
  assert.equal(entryRoute(2, 3, 70), 'open');
  assert.equal(entryRoute(1, 2, 15), 'invite');
  assert.equal(entryRoute(1, 2, 40), 'closed');
  assert.equal(entryRoute(1, 2, CLOSED_QUALI_RANK + 5), 'locked');
  assert.equal(qualifierPlan('closed').length, 1);
  assert.deepEqual(qualifierPlan('open').map((x) => x.bo), [1, 3]);
  const pool = aiPool(2);
  const ev = buildEtapaEvents(pool, 2, 1, null).find((e) => e.slot === 't1')!;
  const opp = qualifierOpponents(ev, pool, 'open', 'x');
  assert.equal(opp.length, 2);
  assert.ok(opp.every((t) => !ev.teams.some((f) => f.id === t.id)), 'adversário do qualificatório não está no field');
  assert.deepEqual(qualifierOpponents(ev, pool, 'open', 'x').map((t) => t.id), opp.map((t) => t.id), 'determinístico');
  assert.ok(opp[0].teamwork <= opp[1].teamwork, 'a final do qualificatório é a mais dura');
});

test('visto: mesma região nunca; risco pequeno e por região; determinístico, no máximo um por evento', () => {
  assert.equal(visaRisk('br', 'br'), 0);
  assert.equal(visaRisk('de', 'pl'), 0);
  assert.equal(visaRisk('ru', null), 0);
  assert.ok(visaRisk('ru', 'us') > visaRisk('de', 'us'), 'CIS → Américas é o mais difícil');
  assert.ok(visaRisk('ru', 'us') <= 0.08);
  const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, country: 'ru' }));
  let denied = 0;
  for (let e = 0; e < 400; e++) {
    const d = visaDenials(`ev:${e}`, 'us', players);
    assert.ok(d.length <= 1);
    assert.deepEqual(visaDenials(`ev:${e}`, 'us', players), d);
    denied += d.length;
  }
  assert.ok(denied / 400 > 0.15 && denied / 400 < 0.45, `taxa de evento com negação (${denied / 400})`);
  assert.equal(visaDenials('ev:1', null, players).length, 0, 'online não pede visto');
});

test('bootcamp e pausas: só antes de LAN; viagem encarece; pausa maior depois do Major', () => {
  assert.equal(bootcampPlan({ lan: false, tier: 1 }, 'europe').available, false);
  const home = bootcampPlan({ lan: true, tier: 1, host: 'pl' }, 'europe');
  const away = bootcampPlan({ lan: true, tier: 1, host: 'us' }, 'europe');
  assert.ok(home.available && away.available && away.travel && !home.travel);
  assert.ok(away.cost > home.cost);
  assert.ok(bootcampPlan({ lan: true, kind: 'major', tier: 1, host: 'dk' }, 'europe').chem >= home.chem);
  assert.ok(bootcampPlan({ lan: true, tier: 2, host: 'pl' }, 'europe').cost < home.cost);
  const br = seasonBreaks(2);
  assert.equal(br.length, 4);
  assert.ok(br.find((b) => b.major)!.weeks > br.find((b) => !b.major)!.weeks);
  assert.equal(RMR_SLOTS.europe + RMR_SLOTS.americas + RMR_SLOTS.asia, 8, 'RMRs completam o Stage 1');
  assert.equal(MAJOR_S1, 24);
});
