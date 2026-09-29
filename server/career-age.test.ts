import assert from 'node:assert/strict';
import test from 'node:test';
import { retirementTick } from '../src/engine/attrs/progression.js';
import {
  academyAgeAfterSplit,
  ageFromCareerStart,
  ageFromDebut,
  careerYearsAtSplit,
  effectiveAge,
  legacyYouthBaseAgeAtPromotion,
  youthDebutAtPromotion,
} from '../src/engine/career/playerAge.js';
import { aiAgeOf } from '../src/engine/career/aiWorld.js';
import { newgenId } from '../src/engine/mundo/juventude.js';

test('career years advance once every three splits', () => {
  assert.equal(careerYearsAtSplit(1), 0);
  assert.equal(careerYearsAtSplit(2), 0);
  assert.equal(careerYearsAtSplit(3), 0);
  assert.equal(careerYearsAtSplit(4), 1);
  assert.equal(careerYearsAtSplit(6), 1);
  assert.equal(careerYearsAtSplit(7), 2);
});

test('academy prospects age only when closing a full career year', () => {
  assert.equal(academyAgeAfterSplit(18, 1), 18);
  assert.equal(academyAgeAfterSplit(18, 2), 18);
  assert.equal(academyAgeAfterSplit(18, 3), 19);
  assert.equal(academyAgeAfterSplit(19, 6), 20);
});

test('promoted academy player keeps debut age instead of being rebased to split one', () => {
  const debut = youthDebutAtPromotion(18, 34);

  assert.equal(ageFromDebut(debut, 34), 18);
  assert.equal(ageFromDebut(debut, 36), 18);
  assert.equal(ageFromDebut(debut, 37), 19);

  // Legacy youthAge still stores the split-1 equivalent for old code paths,
  // but the new youthDebut clock is the source of truth after promotion.
  assert.equal(legacyYouthBaseAgeAtPromotion(18, 34), 7);
  assert.equal(ageFromCareerStart(legacyYouthBaseAgeAtPromotion(18, 34), 34), 18);
});

test('retirement tick (progression.ts, successor of aging.ts) keeps the retirement rules', () => {
  const newRetirees = retirementTick([
    { id: 'vet', nick: 'Vet', age: 34, ovr: 68 },
    { id: 'star', nick: 'Star', age: 34, ovr: 90 },
    { id: 'old', nick: 'Old', age: 35, ovr: 75 },
    { id: 'young', nick: 'Young', age: 29, ovr: 60 },
  ], ['old']);

  assert.deepEqual(newRetirees, [{ id: 'vet', nick: 'Vet', age: 34 }]);
});

// Relato de jogador: "base sobe com 23, 1–2 temporadas depois está com 30+".
// O perfil/peek recebem o jogador do elenco com o id de runtime (user__<id>);
// a idade tem de ser a MESMA do Elenco (id do save) em todos os tipos.
const PROMO_SPLIT = 22;
const prospect = { id: 'prospect__abc123', nick: 'Novinho', age: 23 };
const promoDebut = { [prospect.id]: youthDebutAtPromotion(23, PROMO_SPLIT) };
const promoYouthAge = { [prospect.id]: legacyYouthBaseAgeAtPromotion(23, PROMO_SPLIT) };

test('promoted academy player ages from the promotion (23 at split 22)', () => {
  const ages = [22, 23, 24, 25, 26, 27, 28].map((s) => effectiveAge(prospect, s, promoYouthAge, promoDebut));
  assert.deepEqual(ages, [23, 23, 23, 24, 24, 24, 25]);
});

test('runtime id (user__x) resolves the same age as the save id (x)', () => {
  const rt = (p: { id: string; nick: string; age?: number }) => ({ ...p, id: `user__${p.id}` });
  // 1) prospecto promovido (youthDebut)
  for (let s = PROMO_SPLIT; s <= PROMO_SPLIT + 6; s++) {
    assert.equal(effectiveAge(rt(prospect), s, promoYouthAge, promoDebut), effectiveAge(prospect, s, promoYouthAge, promoDebut));
  }
  // 2) jovem gerado (newgen: relógio no id, sem Player.age)
  const ng = { id: newgenId(13, 17, 'europe', 3), nick: 'Gerado' };
  assert.deepEqual([13, 16, 19].map((s) => effectiveAge(rt(ng), s)), [17, 18, 19]);
  assert.deepEqual([13, 16, 19].map((s) => effectiveAge(ng, s)), [17, 18, 19]);
  // 3) jogador criado com idade editada (youthDebut gravado pelo onEditAge)
  const custom = { id: 'cdb_p_custom1', nick: 'Criado', age: 20 };
  const editDebut = { [custom.id]: { age: 20, split: 19 } };
  for (const s of [19, 22, 25]) assert.equal(effectiveAge(rt(custom), s, {}, editDebut), effectiveAge(custom, s, {}, editDebut));
  assert.equal(effectiveAge(rt(custom), 22, {}, editDebut), 21);
  // 4) pro sem idade no bo3 (fallback por hash do id)
  const noAge = { id: 'bo3_76366', nick: '__sem_idade_no_bo3__' };
  for (const s of [1, 4, 7, 10]) assert.equal(effectiveAge(rt(noAge), s), effectiveAge(noAge, s));
});

test('sold/loaned academy copy keeps the promotion clock in the AI world', () => {
  // a cópia no comprador (extraOnTeam) leva Player.age = idade NA promoção
  for (let s = PROMO_SPLIT; s <= PROMO_SPLIT + 6; s++) {
    assert.equal(aiAgeOf(prospect, s, promoDebut), ageFromDebut(promoDebut[prospect.id], s));
  }
  assert.equal(aiAgeOf(prospect, 28, promoDebut), 25);
});
