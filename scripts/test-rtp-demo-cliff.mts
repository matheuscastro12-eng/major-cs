// [W1] CLIFFHANGER DA DEMO (engine/rtp/demoCliff.ts). Roda via `npm run test:sim`.
//
// Cobertura:
//   - mesma seed → MESMA proposta (clube, salário, função, id), em qualquer tick
//   - a proposta é de um clube de tier ACIMA e nunca do time atual
//   - ensureDemoCliff só age na semana DEMO_WEEKS+ e é idempotente
//   - deliver: não entrega na semana da demo; entrega na virada (pendingOffers);
//     não duplica; save SEM cliffhanger (jogo pago, demo=false) passa intacto
//   - prazo de relógio de parede: abre 1x, expira, expirado some da mesa e não
//     é entregue; quem comprou antes do prazo vê a proposta na mesa
//   - generateOffers (economia do jogo pago) segue determinístico e sem toque
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import { makeRng } from '../src/engine/rng.ts';
import { tierUp } from '../src/engine/rtp/league.ts';
import { generateOffers } from '../src/engine/rtp/transfers.ts';
import { turnWeek } from '../src/engine/rtp/weekly.ts';
import {
  DEMO_WEEKS, CLIFF_TTL_MS, buildDemoCliffOffer, ensureDemoCliff, deliverDemoCliff,
  openDemoCliff, expireDemoCliff, isDemoCliffExpired, activeDemoCliff, cliffCountdown,
} from '../src/engine/rtp/demoCliff.ts';
import type { RoadToProSave } from '../src/engine/rtp/types.ts';

function fixture(seed = 4242, week = DEMO_WEEKS): RoadToProSave {
  const s = createRtpSave({
    nick: 'cliff', country: 'br', role: 'Rifler',
    personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed,
  });
  return { ...s, world: { ...s.world, week } };
}

test('cliffhanger: determinístico pelo seed — mesmo save, mesma proposta em qualquer tick', () => {
  const a = buildDemoCliffOffer(fixture(7));
  const b = buildDemoCliffOffer({ ...fixture(7), rng: { seed: 7, tick: 99 } });
  assert.ok(a && b, 'sem proposta');
  assert.equal(a.id, b.id);
  assert.equal(a.realTeamId, b.realTeamId);
  assert.equal(a.wage, b.wage);
  assert.equal(a.squadRole, b.squadRole);
  assert.equal(a.signingBonus, b.signingBonus);
  assert.ok(a.id.startsWith('offer-cliff-'));
  // seeds diferentes tendem a variar o clube/salário (não é uma constante)
  const ids = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => buildDemoCliffOffer(fixture(seed))?.id + ':' + buildDemoCliffOffer(fixture(seed))?.wage));
  assert.ok(ids.size >= 2, 'proposta idêntica pra todas as seeds');
});

test('cliffhanger: clube de tier ACIMA, nunca o time atual, com as regras de proposta', () => {
  for (const seed of [11, 22, 33, 44]) {
    const s = fixture(seed);
    const o = buildDemoCliffOffer(s);
    assert.ok(o, `seed ${seed}: sem proposta`);
    assert.equal(o.tier, tierUp(s.team.tier));
    assert.notEqual(o.realTeamId, s.team.realTeamId);
    assert.ok(o.wage > 0 && o.signingBonus > 0 && o.weeks === 52 && o.kind === 'transfer');
    assert.ok(['star', 'starter', 'rotation', 'bench'].includes(o.squadRole));
  }
});

test('cliffhanger: ensureDemoCliff só na última semana grátis, idempotente', () => {
  const early = ensureDemoCliff(fixture(5, DEMO_WEEKS - 1));
  assert.equal(early.demoCliff, undefined);
  const s = ensureDemoCliff(fixture(5));
  assert.ok(s.demoCliff);
  assert.equal(s.demoCliff.status, 'teaser');
  assert.equal(s.demoCliff.week, DEMO_WEEKS);
  assert.equal(ensureDemoCliff(s), s);   // mesma referência: não recria
});

test('cliffhanger: entrega na virada pra depois da demo (pendingOffers), sem duplicar', () => {
  const now = 1_700_000_000_000;
  const s = ensureDemoCliff(fixture(9));
  // ainda na semana da demo: nada na mesa
  assert.equal(deliverDemoCliff(s, now), s);
  // virou: proposta na mesa + status delivered
  const turned = { ...s, world: { ...s.world, week: DEMO_WEEKS + 1 } };
  const d = deliverDemoCliff(turned, now);
  assert.equal(d.demoCliff?.status, 'delivered');
  assert.equal(d.world.pendingOffers?.length, 1);
  assert.equal(d.world.pendingOffers?.[0].id, s.demoCliff!.offer.id);
  // entregar de novo é no-op (já delivered)
  assert.equal(deliverDemoCliff(d, now), d);
  // ofertas já na mesa (ex.: midOffers) são preservadas, cliff entra na frente
  const withOthers = { ...turned, world: { ...turned.world, pendingOffers: [{ ...s.demoCliff!.offer, id: 'outra' }] } };
  const d2 = deliverDemoCliff(withOthers, now);
  assert.deepEqual(d2.world.pendingOffers?.map((o) => o.id), [s.demoCliff!.offer.id, 'outra']);
});

test('cliffhanger: jogo PAGO (sem demoCliff) passa intacto — economia inalterada', () => {
  const paid = fixture(13, DEMO_WEEKS + 1);
  assert.equal(deliverDemoCliff(paid, Date.UTC(2026, 8, 1)), paid);
  assert.equal(expireDemoCliff(paid), paid);
  assert.equal(activeDemoCliff(paid, 0), null);
  // turnWeek não inventa proposta nenhuma
  const after = turnWeek(paid);
  assert.equal(after.demoCliff, undefined);
  assert.equal((after.world.pendingOffers ?? []).length, 0);
  // generateOffers segue determinístico pelo rng (mesma entrada → mesma saída)
  const a = generateOffers(paid, 1, makeRng(77));
  const b = generateOffers(paid, 1, makeRng(77));
  assert.deepEqual(a, b);
});

test('cliffhanger: prazo de 48h em relógio de parede — abre 1x, expira, some da mesa', () => {
  const t0 = 1_700_000_000_000;
  let s = ensureDemoCliff(fixture(21));
  s = openDemoCliff(s, t0);
  assert.equal(s.demoCliff?.openedAt, t0);
  assert.equal(s.demoCliff?.expiresAt, t0 + CLIFF_TTL_MS);
  assert.equal(openDemoCliff(s, t0 + 1000), s);   // não reinicia o relógio
  assert.equal(isDemoCliffExpired(s.demoCliff, t0 + CLIFF_TTL_MS - 1), false);
  assert.equal(isDemoCliffExpired(s.demoCliff, t0 + CLIFF_TTL_MS), true);
  assert.equal(cliffCountdown(s.demoCliff!, t0), '48h 00min');
  assert.equal(cliffCountdown(s.demoCliff!, t0 + CLIFF_TTL_MS - 90 * 60_000), '1h 30min');
  assert.equal(cliffCountdown(s.demoCliff!, t0 + CLIFF_TTL_MS + 1), 'expirou');

  // comprou ANTES do prazo: a virada entrega a proposta na mesa
  const bought = deliverDemoCliff({ ...s, world: { ...s.world, week: DEMO_WEEKS + 1 } }, t0 + 60_000);
  assert.equal(bought.demoCliff?.status, 'delivered');
  assert.equal(bought.world.pendingOffers?.length, 1);
  // ...e se o prazo vence com ela na mesa, expirar tira da mesa
  const gone = expireDemoCliff(bought);
  assert.equal(gone.demoCliff?.status, 'expired');
  assert.equal(gone.world.pendingOffers?.length, 0);
  assert.equal(activeDemoCliff(gone, t0), null);

  // voltou DEPOIS do prazo sem comprar: a virada não entrega, marca expirada
  const late = deliverDemoCliff({ ...s, world: { ...s.world, week: DEMO_WEEKS + 1 } }, t0 + CLIFF_TTL_MS + 1);
  assert.equal(late.demoCliff?.status, 'expired');
  assert.equal((late.world.pendingOffers ?? []).length, 0);
});
