// [U09] passe: preview honesto da compra tardia, escolha de função, versão da trilha, moldura.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPassState, passAddXp, premiumPreview, pickRewardCard, PASS_TRACK_VERSION, totalXpForLevel, levelForXp } from '../src/engine/ultimate/seasonPass.ts';
import { frameById } from '../src/engine/ultimate/cosmetics.ts';
import { buildServerCatalog } from '../server/ultimate-pack.ts';

test('preview: sem XP nada na hora; no nível 25 vem 25 níveis premium com Promo e Elite; no 35 o título', () => {
  const p0 = premiumPreview(defaultPassState(1));
  assert.equal(p0.levelsNow.length, 0); assert.equal(p0.creditsNow, 0); assert.equal(p0.levelsLeft, 35);
  const p25 = premiumPreview({ ...defaultPassState(1), xp: totalXpForLevel(25) });
  assert.equal(p25.level, 25); assert.equal(p25.levelsNow.length, 25);
  assert.ok(p25.packsNow.includes('promo') && p25.cardsNow.includes('elite') && !p25.titleNow);
  const p35 = premiumPreview({ ...defaultPassState(1), xp: totalXpForLevel(35), claimedPremium: [1, 2, 3] });
  assert.equal(p35.levelsNow.length, 32); assert.ok(p35.titleNow); assert.equal(p35.xpLeft, 0);
});

test('escolha no marco: preferência de função restringe o sorteio; sem pool cai na raridade', () => {
  const cat = buildServerCatalog(new Date('2026-09-12T12:00:00Z'));
  const c = pickRewardCard(cat, 'elite', 'AWP', () => 0)!;
  assert.equal(c.rarity, 'elite'); assert.equal(c.role, 'AWP');
  const any = pickRewardCard(cat, 'elite', null, () => 0)!;
  assert.equal(any.rarity, 'elite');
  const fallback = pickRewardCard(cat, 'elite', 'Goleiro', () => 0)!;
  assert.equal(fallback.rarity, 'elite');
});

test('trilha versionada e moldura Premium existem; XP continua o mesmo', () => {
  assert.equal(defaultPassState(3).trackVersion, PASS_TRACK_VERSION);
  assert.ok(frameById('pass-premium'));
  const p = passAddXp(defaultPassState(1), 'rankedWin', '2026-09-12');
  assert.equal(levelForXp(p.xp), levelForXp(40));
});
