// ESTILOS DE JOGO (RTP v17) — contrato das especializações exclusivas.
// Fixa: registro consistente (2 estilos/função, trilha de 3 encadeada),
// exclusividade no canUnlock (comprometeu → rival tranca), gasto de ponto e
// agregação dos efeitos novos pelos mesmos agregadores de sempre.
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERKS, stylesFor, styleById, chosenStyleId,
  canUnlock, unlockPerk, aggregatePassives,
} from '../src/engine/rtp/perks.ts';
import { ALL_ATTRS } from '../src/engine/attributes.ts';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import type { RoadToProSave } from '../src/engine/rtp/types.ts';
import type { Role } from '../src/types.ts';

const ROLES: Role[] = ['Entry', 'AWP', 'Rifler', 'Support', 'Lurker', 'IGL'];

function fixture(role: Role, level = 30, points = 10): RoadToProSave {
  const s = createRtpSave({
    nick: 'st', country: 'br', role,
    personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed: 7,
  });
  return {
    ...s,
    player: { ...s.player, progression: { ...s.player.progression, level, perkPoints: points } },
  };
}

test('registro: toda função tem 2 estilos, cada um com trilha de 3 encadeada', () => {
  for (const role of ROLES) {
    const styles = stylesFor(role);
    assert.equal(styles.length, 2, `${role} deve ter 2 estilos`);
    for (const st of styles) {
      const perks = PERKS.filter((p) => p.style === st.id);
      assert.equal(perks.length, 3, `${st.id} deve ter 3 perks`);
      for (const p of perks) assert.equal(p.tree, role, `${p.id} deve morar na árvore da função`);
      const [p1, p2, p3] = perks.sort((a, b) => a.reqLevel - b.reqLevel);
      assert.equal(p1.reqPerk, undefined, `${p1.id} abre a trilha sem pré-requisito`);
      assert.equal(p2.reqPerk, p1.id, `${p2.id} exige ${p1.id}`);
      assert.equal(p3.reqPerk, p2.id, `${p3.id} exige ${p2.id}`);
      assert.ok(p1.reqLevel < p2.reqLevel && p2.reqLevel < p3.reqLevel, `${st.id}: níveis crescentes`);
    }
  }
  // todo estilo referenciado por perk existe; ids de perk não colidem
  const seen = new Set<string>();
  for (const p of PERKS) {
    assert.ok(!seen.has(p.id), `id duplicado: ${p.id}`);
    seen.add(p.id);
    if (p.style) assert.ok(styleById(p.style), `${p.id} referencia estilo inexistente ${p.style}`);
    for (const k of Object.keys(p.effect.attr ?? {})) {
      assert.ok((ALL_ATTRS as readonly string[]).includes(k), `${p.id}: atributo inválido ${k}`);
    }
  }
});

test('exclusividade: comprometeu com um estilo, o rival tranca — e a razão explica', () => {
  const save = fixture('AWP');
  const [atk, anc] = stylesFor('AWP').map((s) => PERKS.filter((p) => p.style === s.id).sort((a, b) => a.reqLevel - b.reqLevel));
  assert.equal(canUnlock(save, atk[0].id).ok, true, 'antes da escolha, estilo A abre');
  assert.equal(canUnlock(save, anc[0].id).ok, true, 'antes da escolha, estilo B abre');

  const committed = unlockPerk(save, atk[0].id);
  assert.equal(chosenStyleId(committed.player.progression), 'st_a_ataque');
  const rival = canUnlock(committed, anc[0].id);
  assert.equal(rival.ok, false, 'rival deve trancar');
  assert.match(rival.reason ?? '', /AWP de Ataque/, 'razão cita o estilo escolhido');
  // a própria trilha segue aberta (pré-requisito satisfeito, nível 30 cobre)
  assert.equal(canUnlock(committed, atk[1].id).ok, true, 'a trilha escolhida continua aberta');
});

test('trilha própria: p2 abre depois do p1 e o ponto é gasto', () => {
  let save = fixture('Lurker');
  const solo = PERKS.filter((p) => p.style === 'st_l_solo').sort((a, b) => a.reqLevel - b.reqLevel);
  const pts0 = save.player.progression.perkPoints;
  assert.equal(canUnlock(save, solo[1].id).ok, false, 'p2 fechado sem p1');
  save = unlockPerk(save, solo[0].id);
  assert.equal(save.player.progression.perkPoints, pts0 - 1, 'ponto gasto');
  assert.equal(canUnlock(save, solo[1].id).ok, true, 'p2 abre com p1');
  save = unlockPerk(save, solo[1].id);
  save = unlockPerk(save, solo[2].id);
  assert.deepEqual(
    save.player.progression.perks.filter((id) => id.startsWith('l_sol')),
    ['l_sol_1', 'l_sol_2', 'l_sol_3'],
  );
});

test('agregação: efeitos dos perks de estilo entram nos agregadores existentes', () => {
  let save = fixture('IGL');
  const voz = PERKS.filter((p) => p.style === 'st_i_voz').sort((a, b) => a.reqLevel - b.reqLevel);
  for (const p of voz) save = unlockPerk(save, p.id);
  const agg = aggregatePassives(save);
  assert.equal(agg.attrBonus.leadership, 1, 'attr do p1 agregado');
  assert.ok(agg.tiltResist >= 0.12, 'tiltResist do p2 agregado');
  assert.ok(agg.matchFactors.some((f) => f.label === 'Discurso'), 'matchFactor do p3 agregado');
});

test('fora da função: perk de estilo de outra função não abre', () => {
  const save = fixture('Entry');
  const r = canUnlock(save, 'a_atk_1');
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /função/);
});
