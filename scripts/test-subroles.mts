// T6.1 — Test sub-roles. Roda `tsx scripts/test-subroles.mts`.
//
// Cobertura:
//   - subRoleStars devolve valores 0-5 em todas as keys
//   - dominantSubRole sempre devolve um SubRole válido
//   - compositionPenalty: 0 com comp balanceada, > 0 com 3+ mesmo subrole
//   - Player com role 'AWP' alto tem awper como dominante

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  subRoleStars,
  dominantSubRole,
  compositionPenalty,
  SUBROLE_ORDER,
} from '../src/engine/subRoles.ts';
import type { Player, Role } from '../src/types.ts';

function mkPlayer(opts: Partial<Player> & { id: string; role: Role }): Player {
  return {
    id: opts.id,
    nick: opts.nick ?? opts.id,
    name: opts.name ?? opts.id,
    country: opts.country ?? 'br',
    role: opts.role,
    role2: opts.role2,
    aim: opts.aim ?? 80,
    clutch: opts.clutch ?? 75,
    consistency: opts.consistency ?? 75,
    awp: opts.awp ?? 60,
    igl: opts.igl ?? 60,
  };
}

test('subRoleStars devolve valores entre 0 e 5 em todas as keys', () => {
  const p = mkPlayer({ id: 'p1', role: 'AWP', awp: 90 });
  const stars = subRoleStars(p);
  for (const key of SUBROLE_ORDER) {
    const v = stars[key];
    assert.ok(v >= 0 && v <= 5, `${key} = ${v} fora de [0, 5]`);
  }
});

test('AWPer com awp alto tem "awper" como dominante', () => {
  const p = mkPlayer({ id: 'awp1', role: 'AWP', awp: 95, aim: 80 });
  assert.equal(dominantSubRole(p), 'awper');
});

test('IGL com igl alto tem "igl" como dominante', () => {
  const p = mkPlayer({ id: 'igl1', role: 'IGL', igl: 95, aim: 75 });
  assert.equal(dominantSubRole(p), 'igl');
});

test('Entry com aim alto tem "entryFragger" como dominante', () => {
  const p = mkPlayer({ id: 'e1', role: 'Entry', aim: 92, consistency: 70 });
  assert.equal(dominantSubRole(p), 'entryFragger');
});

test('compositionPenalty = 0 com comp balanceada (5 roles diferentes)', () => {
  const team: Player[] = [
    mkPlayer({ id: '1', role: 'AWP', awp: 90 }),
    mkPlayer({ id: '2', role: 'IGL', igl: 90 }),
    mkPlayer({ id: '3', role: 'Entry', aim: 90 }),
    mkPlayer({ id: '4', role: 'Support', consistency: 90 }),
    mkPlayer({ id: '5', role: 'Lurker', clutch: 90 }),
  ];
  assert.equal(compositionPenalty(team), 0);
});

test('compositionPenalty > 0 com 3+ AWPers', () => {
  const team: Player[] = [
    mkPlayer({ id: '1', role: 'AWP', awp: 95 }),
    mkPlayer({ id: '2', role: 'AWP', awp: 90 }),
    mkPlayer({ id: '3', role: 'AWP', awp: 88 }),
    mkPlayer({ id: '4', role: 'Support', consistency: 90 }),
    mkPlayer({ id: '5', role: 'Lurker', clutch: 90 }),
  ];
  const penalty = compositionPenalty(team);
  assert.ok(penalty > 0, `penalty = ${penalty}, esperava > 0`);
});

test('compositionPenalty = 0 com 3 riflers (rifler é "qualquer um")', () => {
  // 3 riflers genéricos NÃO viram penalty (rifler é nicho neutro)
  const team: Player[] = [
    mkPlayer({ id: '1', role: 'Rifler', aim: 80, consistency: 80 }),
    mkPlayer({ id: '2', role: 'Rifler', aim: 75, consistency: 80 }),
    mkPlayer({ id: '3', role: 'Rifler', aim: 80, consistency: 75 }),
    mkPlayer({ id: '4', role: 'AWP', awp: 90 }),
    mkPlayer({ id: '5', role: 'IGL', igl: 90 }),
  ];
  assert.equal(compositionPenalty(team), 0);
});

test('compositionPenalty cresce com 4+ mesmo subrole', () => {
  const teamThree: Player[] = [
    mkPlayer({ id: '1', role: 'Entry', aim: 92 }),
    mkPlayer({ id: '2', role: 'Entry', aim: 90 }),
    mkPlayer({ id: '3', role: 'Entry', aim: 88 }),
    mkPlayer({ id: '4', role: 'AWP', awp: 90 }),
    mkPlayer({ id: '5', role: 'IGL', igl: 90 }),
  ];
  const teamFour: Player[] = [
    mkPlayer({ id: '1', role: 'Entry', aim: 92 }),
    mkPlayer({ id: '2', role: 'Entry', aim: 90 }),
    mkPlayer({ id: '3', role: 'Entry', aim: 88 }),
    mkPlayer({ id: '4', role: 'Entry', aim: 85 }),
    mkPlayer({ id: '5', role: 'AWP', awp: 90 }),
  ];
  const p3 = compositionPenalty(teamThree);
  const p4 = compositionPenalty(teamFour);
  assert.ok(p4 > p3, `4 entries (p=${p4}) deveria penalizar mais que 3 (p=${p3})`);
});

test('subRoleStars é determinístico — mesma input → mesmo output', () => {
  const p = mkPlayer({ id: 'det', role: 'Rifler', aim: 81, consistency: 77 });
  const s1 = subRoleStars(p);
  const s2 = subRoleStars(p);
  assert.deepEqual(s1, s2);
});
