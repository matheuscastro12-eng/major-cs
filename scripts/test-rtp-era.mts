// [W6] ERA ANUAL (era.ts + virada do ano em circuit.ts + Major do ano em major.ts).
// eraOf por temporada, carimbo determinístico com fixture fixo, e a virada do
// ano continua gerando EXATAMENTE uma virada (e um carimbo). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eraOf, eraOfSeason, majorOfYear, buildEraStamp, eraCloseOf, stampEra, stampMajorOnEra,
  dismissEraClose, pendingEraStamp, ERA_BASE_YEAR,
} from '../src/engine/rtp/era.ts';
import { eraCloseDesk } from '../src/engine/rtp/broadcast.ts';
import { autoSimCircuitRound, EVENTS_PER_SEASON } from '../src/engine/rtp/circuit.ts';
import { buildMajor } from '../src/engine/rtp/major.ts';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import type { RoadToProSave, CareerLog } from '../src/engine/rtp/types.ts';

function fixture(seed = 21): RoadToProSave {
  return createRtpSave({
    nick: 'era', country: 'br', role: 'Rifler',
    personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed,
  });
}

test('eraOf: seasons 1..5 → Era 2026..2030, Major real do ano, determinístico', () => {
  for (let season = 1; season <= 5; season++) {
    const s = { ...fixture(), world: { ...fixture().world, season } };
    const e = eraOf(s);
    assert.equal(e.year, ERA_BASE_YEAR + season - 1);
    assert.equal(e.name, `Era ${ERA_BASE_YEAR + season - 1}`);
    assert.equal(e.season, season);
    assert.ok(e.majorName.includes(`${e.year}`), `Major da era carrega o ano: ${e.majorName}`);
    assert.ok(e.majorCity.length > 0);
    assert.deepEqual(eraOf(s), eraOfSeason(season));   // mesma entrada, mesma saída
  }
  // 2026 é o Major real conhecido do calendário do CS2.
  assert.equal(majorOfYear(2026).name, 'IEM Cologne Major 2026');
  assert.equal(majorOfYear(2026).city, 'Colônia');
  // anos seguintes: nome com o ano, sede estável pro mesmo ano.
  assert.equal(majorOfYear(2028).name, majorOfYear(2028).name);
  assert.ok(majorOfYear(2031).name.endsWith('2031'));
  // qualquer season (inclusive lixo) funciona — save antigo sem season válida não quebra.
  assert.equal(eraOfSeason(0).year, ERA_BASE_YEAR);
});

test('buildEraStamp: determinístico e derivado (eventos da temporada, séries do ano, Major da era)', () => {
  const base = fixture(7);
  const timeline: CareerLog['timeline'] = [
    { season: 1, event: 1, eventName: 'CCT SA', tier: 'academy', teamTag: base.team.tag, place: 5, rating: 0.98 },
    { season: 1, event: 2, eventName: 'GC Masters', tier: 'academy', teamTag: base.team.tag, place: 1, rating: 1.21, award: 'mvp' },
    { season: 1, event: 3, eventName: 'CBCS', tier: 'academy', teamTag: base.team.tag, place: 2, rating: 1.21 },
    { season: 2, event: 1, eventName: 'Outro ano', tier: 'access', teamTag: base.team.tag, place: 1, rating: 1.5 },   // não entra
  ];
  const history: CareerLog = { ...base.history, timeline };
  const save: RoadToProSave = { ...base, history: { ...base.history, records: { ...base.history.records!, seasonSeries: 9, seasonLosses: 3 } } };
  const ctx = { strongestTeam: { tag: 'FUR', name: 'FURIA', isUser: false }, worldRank: 120, majorQualified: false };
  const a = buildEraStamp(save, history, ctx);
  const b = buildEraStamp(save, history, ctx);
  assert.deepEqual(a, b);
  assert.equal(a.year, 2026);
  assert.equal(a.events.length, 3);                 // só a temporada 1, sem Major
  assert.equal(a.series, 9);
  assert.equal(a.wins, 6);
  assert.equal(a.majorPlacement, null);             // sem vaga → null (não pendente)
  assert.equal(a.majorName, 'IEM Cologne Major 2026');
  assert.ok(a.headline.length > 10);

  const c = eraCloseOf(a);
  assert.equal(c.titles, 1);
  assert.equal(c.finals, 2);
  assert.equal(c.rating, 1.13);                     // (0.98+1.21+1.21)/3 arredondado
  // melhor momento: maior rating; empate → melhor colocação (o título, não o vice).
  assert.equal(c.bestMoment?.eventName, 'GC Masters');
  assert.equal(c.form, '🟥🟩🟩');
  assert.ok(c.share.includes('Era 2026') && c.share.includes('sem vaga'));
  // falas da bancada: determinísticas e não vazias.
  const d1 = eraCloseDesk(a, 'era');
  assert.deepEqual(d1, eraCloseDesk(a, 'era'));
  assert.ok(d1.opener && d1.verdict && d1.next);

  // Major classificado: placement fica PENDENTE até o Major resolver; depois carimba.
  const q = buildEraStamp(save, history, { ...ctx, majorQualified: true });
  assert.equal(q.majorPlacement, undefined);
  assert.equal(eraCloseOf(q).form, '🟥🟩🟩…');
  const stamped = { ...save, ...stampEra(save, q) };
  assert.equal(stamped.pendingEraYear, 2026);
  assert.equal(pendingEraStamp(stamped)?.year, 2026);
  const afterMajor = stampMajorOnEra(stamped, 2026, 'champion', 'mvp');
  assert.equal(afterMajor.eras?.[0].majorPlacement, 'champion');
  assert.equal(afterMajor.eras?.[0].majorAward, 'mvp');
  assert.equal(eraCloseOf(afterMajor.eras![0]).form, '🟥🟩🟩🏆');
  // ano sem carimbo: no-op (save antigo).
  assert.equal(stampMajorOnEra(save, 2026, 'semi'), save);
  // visto uma vez: limpa a pendência, o carimbo fica.
  const seen = dismissEraClose(afterMajor);
  assert.equal(seen.pendingEraYear, undefined);
  assert.equal(seen.eras?.length, 1);
  assert.equal(pendingEraStamp(seen), null);
  assert.equal(dismissEraClose(seen), seen);
});

test('buildMajor: Major com identidade da era (nome do ano + eraYear)', () => {
  const s = fixture(5);
  const era = eraOf(s);                            // Era 2026 (temporada 1)
  const seed = 0x4d41;
  const elite = buildMajor({ ...s, world: { ...s.world, season: 2 } }, 'elite', 2, seed, era);
  assert.equal(elite.name, 'IEM Cologne Major 2026');
  assert.equal(elite.eraYear, 2026);
  const lower = buildMajor({ ...s, world: { ...s.world, season: 2 } }, 'access', 2, seed, era);
  assert.ok(lower.name.endsWith('2026'), lower.name);
  // sem era (save antigo): deriva da temporada ANTERIOR à do save (o Major roda no ano novo).
  const legacy = buildMajor({ ...s, world: { ...s.world, season: 2 } }, 'elite', 2, seed);
  assert.equal(legacy.eraYear, 2026);
  assert.equal(legacy.name, elite.name);
});

test('virada do ano: exatamente UMA virada, UM carimbo, fechamento pendente; save antigo sem eras acumula', () => {
  let s = fixture(33);
  assert.equal(s.eras, undefined, 'save novo/antigo não tem eras');
  let seasonEnds = 0;
  let rounds = 0;
  while (seasonEnds < 1 && rounds < 80) {
    const r = autoSimCircuitRound(s);
    assert.ok(r, `rodada ${rounds}: sem partida pendente`);
    const next = r!.conclusion.save;
    if (r!.conclusion.seasonEnd) seasonEnds++;
    else assert.equal(next.eras, undefined, 'nada carimba antes do ano fechar');
    s = next;
    rounds++;
  }
  assert.equal(seasonEnds, 1);
  assert.equal(s.world.season, 2);
  assert.equal(s.eras?.length, 1, 'um ano fechado = um carimbo');
  const st = s.eras![0];
  assert.equal(st.year, 2026);
  assert.equal(st.season, 1);
  assert.equal(st.events.length, EVENTS_PER_SEASON, 'as etapas do ano estão no carimbo');
  assert.equal(s.pendingEraYear, 2026, 'fechamento pendente pra UI mostrar uma vez');
  assert.ok(st.series > 0 && st.wins <= st.series);
  assert.equal(typeof st.headline, 'string');
  // Major: se classificou, o Major do ano carrega a era e o placement fica pendente; senão null.
  if (s.world.major) {
    assert.equal(s.world.major.eraYear, 2026);
    assert.equal(s.world.major.name, st.majorName);
    assert.equal(st.majorPlacement, undefined);
  } else {
    assert.equal(st.majorPlacement, null);
  }
  // a era corrente já é a seguinte.
  assert.equal(eraOf(s).year, 2027);
  // determinismo: o mesmo fixture reproduz o mesmo carimbo.
  let s2 = fixture(33);
  for (let i = 0; i < rounds; i++) s2 = autoSimCircuitRound(s2)!.conclusion.save;
  assert.deepEqual(s2.eras, s.eras);
});
