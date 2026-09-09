// [W2] LEGADO — a ponte entre os modos (engine/bridge/legacyBridge.ts).
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coachFromLegacy, heirBonusAttrs, heirFromLegacy, iconFromLegacy, isLegacyCard, legacyCardKey,
  legacyFromHall, legacyFromSave, legacyPoolEntry, RTP_EPOCH_YEAR, type LegacyProfile,
} from '../src/engine/bridge/legacyBridge.ts';
import { createRtpSave, ROLE_FOCUS, type CreateRtpInput } from '../src/engine/rtp/createSave.ts';
import { ALL_ATTRS } from '../src/engine/attributes.ts';
import type { Manager } from '../src/state/manager.ts';
import type { HallCareer } from '../src/state/rtpHall.ts';
import type { RoadToProSave } from '../src/engine/rtp/types.ts';

const BASE: CreateRtpInput = {
  nick: 'zr1', country: 'br', role: 'AWP', personality: 'prodigy', archetype: 'aimstar', age: 17,
  categoryPoints: { mechanical: 5, mental: 4, physical: 3 }, seed: 424242, startTier: 'academy', tryoutStrong: false,
};

// Um save "aposentado" com carreira de verdade: títulos, Major, MVP, rival, traits.
function retiredSave(seed = 777): RoadToProSave {
  const s = createRtpSave({ ...BASE, seed, startTier: 'challenger', tryoutStrong: true });
  s.createdAt = 1_700_000_000_000;
  s.retired = true;
  s.player.age = 31;
  s.world.season = 14;
  s.world.peakRank = 1;
  s.player.ovr = 88;
  s.history.peakOvr = 91;
  s.history.trophies = ['CCT SA', 'Major Rio', 'IEM Cologne'];
  s.history.timeline = [
    { season: 8, event: 0, eventName: 'Major Rio', tier: 'elite', teamTag: 'FUR', place: 1, rating: 1.31, major: true, award: 'mvp' },
    { season: 9, event: 2, eventName: 'IEM Cologne', tier: 'elite', teamTag: 'FUR', place: 1, rating: 1.18 },
  ];
  s.history.accolades = [{ id: 'a1', kind: 'mvp', eventName: 'Major Rio', season: 8, rating: 1.31, tier: 'elite' }];
  s.player.progression.traits = ['t_clutch', 't_champ'];
  s.media = {
    followers: 90_000, headlines: [],
    rival: { orgId: 'org-x', orgName: 'Vitality', tag: 'VIT', colors: ['#000', '#fff'], playerNick: 'ZywOo', playerRole: 'AWP', playerOvr: 93, intensity: 70, h2h: { w: 3, l: 5 }, originSeason: 6, lastSeason: 13, taunt: '…' },
  };
  return s;
}

test('legacyFromSave: determinístico e fiel à carreira', () => {
  const s = retiredSave();
  const a = legacyFromSave(s);
  const b = legacyFromSave(structuredClone(s));
  assert.deepEqual(a, b);
  assert.equal(a.id, 'hof-1700000000000');
  assert.equal(a.nick, 'zr1');
  assert.equal(a.role, 'AWP');
  assert.equal(a.peakOvr, 91);
  assert.equal(a.ageRetired, 31);
  assert.equal(a.titles, 3);
  assert.equal(a.majors, 1);
  assert.equal(a.mvps, 1);
  assert.equal(a.peakRank, 1);
  assert.equal(a.retiredYear, RTP_EPOCH_YEAR + 13);
  assert.deepEqual(a.traits, ['t_clutch', 't_champ']);
  assert.equal(a.rival?.playerNick, 'ZywOo');
  assert.ok(a.legacy > 0);
  assert.ok(['Lenda', 'Estrela', 'Profissional', 'Promessa', 'Prospecto'].includes(a.tierLabel));
  for (const v of Object.values(a.core)) assert.ok(v >= 0 && v <= 100);
  // sem createdAt cai no seed (mesma regra do hall)
  const s2 = { ...s, createdAt: 0 };
  assert.equal(legacyFromSave(s2).id, `hof-${s.rng.seed}`);
});

test('iconFromLegacy: UltCard válido, estável e identificável como LEGADO', () => {
  const p = legacyFromSave(retiredSave());
  const c = iconFromLegacy(p);
  assert.equal(c.key, legacyCardKey(p.id));
  assert.equal(c.key, `${c.playerId}:${c.rarity}`);           // contrato do catálogo
  assert.ok(c.playerId.startsWith('rtp_legacy_'));
  assert.equal(c.rarity, 'histIcon');
  assert.equal(c.role, 'AWP');
  assert.equal(c.ovr, 91);
  assert.ok(c.ovr >= 1 && c.ovr <= 99);
  for (const [k, v] of Object.entries(c.stats)) assert.ok(v >= 1 && v <= 99, `${k}=${v}`);
  assert.ok(c.stats.tiro >= c.ovr - 12, 'AWP com pico 91 não sai com tiro de bronze');
  assert.deepEqual(iconFromLegacy(p), c);
  assert.equal(isLegacyCard(c), true);
  assert.equal(isLegacyCard({ playerId: 'hist_forest' }), false);
  assert.equal(isLegacyCard(null), false);
  // pico baixo → piso da moldura
  const low = iconFromLegacy({ ...p, peakOvr: 55 });
  assert.equal(low.ovr, 78);
  // materialização pro pool de partidas bate com o card
  const e = legacyPoolEntry(p);
  assert.equal(e.player.id, c.playerId);
  assert.equal(e.ovr, c.ovr);
  assert.equal(e.from.id, c.teamOrigin);
});

test('legacyFromHall: reconstrói um perfil utilizável só do resumo', () => {
  const h: HallCareer = {
    id: 'hof-1', nick: 'old', country: 'se', role: 'IGL', seasons: 10, ageRetired: 29, titles: 2, majors: 0, mvpAwards: 1,
    peakRank: 12, legacy: 300, tierLabel: 'Profissional', retiredAt: 1, peakOvr: 84,
  };
  const p = legacyFromHall(h);
  assert.equal(p.id, 'hof-1');
  assert.equal(p.role, 'IGL');
  assert.equal(p.peakOvr, 84);
  const c = iconFromLegacy(p);
  assert.equal(c.ovr, 84);
  for (const v of Object.values(c.stats)) assert.ok(v >= 1 && v <= 99);
  // sem peakOvr (hall anterior ao W2) não explode
  const c2 = iconFromLegacy(legacyFromHall({ ...h, peakOvr: undefined }));
  assert.ok(c2.ovr >= 78);
});

test('createRtpSave com heir: peneira/tier intactos, +1 em 2 atributos do mentor, linhagem no save', () => {
  const mentor = legacyFromSave(retiredSave());
  const heirIn = heirFromLegacy(mentor, 2);
  assert.equal(heirIn.country, 'br');
  assert.equal(heirIn.heir.mentorNick, 'zr1');
  assert.equal(heirIn.heir.generation, 2);

  const input: CreateRtpInput = { ...BASE, role: 'Rifler', startTier: 'access', tryoutStrong: true };
  const plain = createRtpSave(input);
  const heir = createRtpSave({ ...input, heir: heirIn.heir });
  // MESMO seed → MESMO time/tier/liga (o bônus nunca consome RNG)
  assert.equal(heir.team.realTeamId, plain.team.realTeamId);
  assert.equal(heir.team.tier, plain.team.tier);
  assert.equal(heir.world.league?.name, plain.world.league?.name);
  assert.deepEqual(heir.team.teammates.map((t) => t.sourcePlayerId), plain.team.teammates.map((t) => t.sourcePlayerId));
  // bônus: exatamente os 2 primeiros atributos-chave da função do MENTOR (AWP)
  const bonus = heirBonusAttrs('AWP');
  assert.deepEqual(bonus, ROLE_FOCUS.AWP.slice(0, 2));
  for (const k of ALL_ATTRS) {
    const expected = bonus.includes(k) ? Math.min(16, plain.player.attrs[k] + 1) : plain.player.attrs[k];
    assert.equal(heir.player.attrs[k], expected, `attr ${k}`);
    assert.ok(heir.player.potential[k] >= heir.player.attrs[k]);
  }
  assert.ok(heir.player.ovr >= plain.player.ovr);
  // linhagem + rivalidade herdada como texto de intro
  assert.deepEqual(heir.lineage, { mentorId: mentor.id, mentorNick: 'zr1', generation: 2, inheritedRival: 'ZywOo' });
  assert.equal(plain.lineage, undefined);
  assert.ok(heir.media?.headlines[0]?.text.includes('ZywOo'));
  assert.ok(heir.media?.headlines[0]?.text.includes('discípulo de zr1'));
  // determinístico
  assert.deepEqual(createRtpSave({ ...input, heir: heirIn.heir }), heir);
  // sem rival: intro genérica, sem quebrar
  const noRival: LegacyProfile = { ...mentor, rival: null };
  const h2 = createRtpSave({ ...input, heir: heirFromLegacy(noRival).heir });
  assert.equal(h2.lineage?.inheritedRival, undefined);
  assert.ok(h2.media?.headlines[0]?.text.includes('discípulo'));
});

test('coachFromLegacy: Manager com origin serializa/deserializa sem perder nada', () => {
  const p = legacyFromSave(retiredSave());
  const coach = coachFromLegacy(p, 'Selva Gaming');
  const m: Manager = coach;              // Manager-like de verdade (tipo compatível)
  assert.equal(m.nick, 'zr1');
  assert.equal(m.age, 31);
  assert.equal(m.country, 'br');
  assert.equal(m.org, 'Selva Gaming');
  assert.match(m.accent, /^#[0-9a-f]{6}$/);
  assert.equal(m.origin?.kind, 'rtp-legacy');
  assert.equal(m.origin?.legacyId, p.id);
  assert.equal(m.origin?.majors, 1);
  assert.equal(m.origin?.repBonus, 2);
  const back = JSON.parse(JSON.stringify(m)) as Manager;
  assert.deepEqual(back, m);
  // manager antigo (sem origin) continua válido
  const legacyless: Manager = { nick: 'x', name: '', age: 24, country: 'br', accent: '#4382b6', org: 'Y' };
  assert.equal(JSON.parse(JSON.stringify(legacyless)).origin, undefined);
  // determinístico
  assert.deepEqual(coachFromLegacy(p, 'Selva Gaming'), coach);
});
