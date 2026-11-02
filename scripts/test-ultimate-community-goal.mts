// [URG-5] meta comunitária da semana: id/janela ISO, escala do alvo, progresso e prêmio por contribuição.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  communityGoalFor, communityWeekId, communityRewardFor, communityRemaining, communityShareText,
  describeCommunityGoal, describeTimeLeft, isoWeekOf, progressPct, resolveWeekTarget,
} from '../src/engine/ultimate/communityGoal.ts';

const MON = Date.UTC(2026, 8, 14); // 2026-09-14 é segunda (semana ISO 38)

test('id determinístico por semana ISO (UTC): segunda 00:00 → domingo 23:59:59.999', () => {
  const g = communityGoalFor(MON + 3 * 86_400_000 + 5 * 3_600_000); // quinta 05:00
  assert.equal(g.id, 'cg-2026-38');
  assert.equal(g.startsAt, MON);
  assert.equal(g.endsAt, MON + 7 * 86_400_000 - 1);
  // domingo 23:59:59 ainda é a mesma semana; a segunda seguinte já é outra
  assert.equal(communityWeekId(MON + 7 * 86_400_000 - 1), 'cg-2026-38');
  assert.equal(communityWeekId(MON + 7 * 86_400_000), 'cg-2026-39');
  // um domingo pertence à semana que começou na segunda anterior (não à seguinte)
  assert.equal(communityWeekId(Date.UTC(2026, 8, 13, 12)), 'cg-2026-37');
});

test('virada de ano ISO: 1º de janeiro pode cair na última semana do ano anterior', () => {
  assert.deepEqual(isoWeekOf(Date.UTC(2027, 0, 1)), { year: 2026, week: 53 }); // sexta 01/01/2027
  assert.deepEqual(isoWeekOf(Date.UTC(2026, 0, 1)), { year: 2026, week: 1 });  // quinta 01/01/2026
  assert.equal(communityWeekId(Date.UTC(2027, 0, 3)), 'cg-2026-53');
  assert.equal(communityWeekId(Date.UTC(2027, 0, 4)), 'cg-2027-01');
});

test('alvo: começa em 300 sem histórico; depois 15% acima da semana anterior, em degraus de 50, preso a [200, 5000]', () => {
  assert.equal(resolveWeekTarget(), 300);
  assert.equal(resolveWeekTarget(null), 300);
  assert.equal(communityGoalFor(MON).target, 300);
  assert.equal(resolveWeekTarget(0), 200);      // piso
  assert.equal(resolveWeekTarget(100), 200);    // 115 → 100 → piso
  assert.equal(resolveWeekTarget(300), 350);    // 345 → 350
  assert.equal(resolveWeekTarget(320), 350);    // 368 → 350
  assert.equal(resolveWeekTarget(330), 400);    // 379.5 → 400
  assert.equal(resolveWeekTarget(1000), 1150);
  assert.equal(resolveWeekTarget(9000), 5000);  // teto
  assert.equal(communityGoalFor(MON, 1000).target, 1150);
});

test('progresso 0..100 inteiro, nunca passa de 100 nem cai abaixo de 0', () => {
  assert.equal(progressPct(0, 300), 0);
  assert.equal(progressPct(150, 300), 50);
  assert.equal(progressPct(299, 300), 100); // arredonda — a UI mostra "faltam 1" ao lado
  assert.equal(progressPct(301, 300), 100);
  assert.equal(progressPct(-5, 300), 0);
  assert.equal(progressPct(10, 0), 0);
  assert.equal(communityRemaining(120, 300), 180);
  assert.equal(communityRemaining(400, 300), 0);
});

test('prêmio por contribuição: 5.000 coins a partir de 3 partidas; Pacote Ouro a partir de 10', () => {
  assert.deepEqual(communityRewardFor(0), { credits: 0, packTier: null });
  assert.deepEqual(communityRewardFor(2), { credits: 0, packTier: null });
  assert.deepEqual(communityRewardFor(3), { credits: 5000, packTier: null });
  assert.deepEqual(communityRewardFor(9), { credits: 5000, packTier: null });
  assert.deepEqual(communityRewardFor(10), { credits: 5000, packTier: 'gold' });
  assert.deepEqual(communityRewardFor(40), { credits: 5000, packTier: 'gold' });
});

test('textos em PT-BR: descrição, tempo restante e compartilhamento', () => {
  const g = communityGoalFor(MON, 1000);
  assert.match(describeCommunityGoal(g), /1\.150 partidas online até domingo/);
  assert.match(describeCommunityGoal(g), /5\.000 coins/);
  assert.equal(describeTimeLeft(MON, g.endsAt), '6d 23h');
  assert.equal(describeTimeLeft(g.endsAt - 2 * 3_600_000, g.endsAt), '2h');
  assert.equal(describeTimeLeft(g.endsAt - 30_000, g.endsAt), '1min');
  assert.equal(communityShareText(1000, g), 'Faltam 150 partidas pra comunidade do Road to Major bater a meta da semana e liberar 5.000 coins pra todo mundo. Bora: roadtomajor.com.br');
  assert.match(communityShareText(1150, g), /bateu a meta da semana/);
});
