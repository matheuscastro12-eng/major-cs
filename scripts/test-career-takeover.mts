// CARREIRA — takeover herda o entrosamento REAL da org. Roda via `npm run test:sim`.
//
// Bug reportado por jogador (Felipe, 2026-08-10): "se eu pegar a Yawara que é
// posição 190, quando eu assumo o controle ela já sobe pra posição 31, sem eu
// ter feito nada". Causa: buildUserTeam estampava `teamwork = 78 ± sinergia` —
// premissa do DRAFT (dream team sem rotina) — em cima do teamwork real da org.
// Como o teamwork é a semente do VRS (userBaseVrsFor), assumir um time fraco já
// o promovia no ranking mundial antes de jogar qualquer partida.
//
// Cobertura:
//   - default 78 preservado (caminho do draft não muda)
//   - baseTeamwork explícito manda no teamwork resultante
//   - org fraca (Yawara, teamwork 60) não é promovida ao assumir
//   - resyncUserRoles respeita a herança (senão regride no meio do split)
//   - a janela de sinergia (±14) continua valendo em torno da base

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { buildUserTeam, resyncUserRoles, orgRefSynergy } from '../src/engine/ratings.ts';
import type { Coach, Player, Role, TeamSeason } from '../src/types.ts';

const ROOKIE: Coach = { nick: 'Rookie', name: 'Rookie', country: 'br', rating: 70, style: 'tactical' };

function orgByName(name: string): TeamSeason {
  const t = CS2_REAL_2026.find((x) => x.team === name);
  assert.ok(t, `time ${name} precisa existir na base bo3-2026`);
  return t;
}

function picksOf(t: TeamSeason) {
  return t.players.slice(0, 5).map((player) => ({ player: player as Player, from: t }));
}

// A base real do bug: Yawara é um time de teamwork baixo.
const YAWARA = orgByName('Yawara');

test('a base do teste é a do bug: Yawara tem teamwork bem abaixo do 78 do draft', () => {
  assert.ok(YAWARA.teamwork < 78, `esperava teamwork < 78, veio ${YAWARA.teamwork}`);
});

test('default segue 78: o caminho do DRAFT não muda de comportamento', () => {
  const t = buildUserTeam('Dream', picksOf(YAWARA), ROOKIE);
  // teamwork = 78 + clamp(sinergia*1.2, -14, 12)
  assert.ok(t.teamwork >= 78 - 14 && t.teamwork <= 78 + 12, `fora da janela do 78: ${t.teamwork}`);
});

// O CORAÇÃO DO BUG: "sem eu ter feito nada, só por selecionar o time ele já
// está numa posição melhor". Com o elenco INTACTO, o teamwork tem que ser
// EXATAMENTE o da org — nem um ponto de bônus.
test('elenco intacto: takeover devolve o teamwork REAL da org, sem bônus', () => {
  const t = buildUserTeam('Yawara', picksOf(YAWARA), ROOKIE, YAWARA.teamwork, orgRefSynergy(YAWARA));
  assert.equal(t.teamwork, YAWARA.teamwork);
});

test('sem a sinergia de referência o bug reaparece (dupla contagem)', () => {
  const semRef = buildUserTeam('Yawara', picksOf(YAWARA), ROOKIE, YAWARA.teamwork);
  assert.ok(
    semRef.teamwork > YAWARA.teamwork,
    'o teste precisa demonstrar a dupla contagem que a referência elimina',
  );
});

test('takeover NÃO é promovido de graça: fica bem abaixo do baseline do draft', () => {
  const draft = buildUserTeam('Yawara', picksOf(YAWARA), ROOKIE);
  const takeover = buildUserTeam('Yawara', picksOf(YAWARA), ROOKIE, YAWARA.teamwork, orgRefSynergy(YAWARA));
  assert.ok(
    takeover.teamwork < draft.teamwork,
    `assumir a org devia dar teamwork MENOR que o draft (${takeover.teamwork} vs ${draft.teamwork})`,
  );
});

test('elenco intacto de org ELITE também é preservado (não rebaixa nem promove)', () => {
  const vit = orgByName('Vitality');
  assert.ok(vit.teamwork > 78, `pré-condição: Vitality devia ter teamwork > 78, veio ${vit.teamwork}`);
  const t = buildUserTeam('Vitality', picksOf(vit), ROOKIE, vit.teamwork, orgRefSynergy(vit));
  assert.equal(t.teamwork, vit.teamwork);
});

// O fix não CONGELA o entrosamento: ele o ancora na referência. Composição
// melhor que a herdada sobe, pior desce. Testado pelo DELTA, porque draftSynergy
// mede COMPOSIÇÃO de funções e não qualidade de jogador (o top-5 da Vitality tem
// composição pior que o da Yawara — qualidade entra via avgSkill no strength).
test('o teamwork responde ao DELTA de sinergia, não à sinergia absoluta', () => {
  const picks = picksOf(YAWARA);
  const ref = orgRefSynergy(YAWARA);
  const intacto = buildUserTeam('Yawara', picks, ROOKIE, YAWARA.teamwork, ref);
  const melhorou = buildUserTeam('Yawara', picks, ROOKIE, YAWARA.teamwork, ref - 3);
  const piorou = buildUserTeam('Yawara', picks, ROOKIE, YAWARA.teamwork, ref + 3);
  assert.ok(melhorou.teamwork > intacto.teamwork, 'composição acima da referência tem que subir');
  assert.ok(piorou.teamwork < intacto.teamwork, 'composição abaixo da referência tem que descer');
});

test('resyncUserRoles respeita a herança — o fix não regride no meio do split', () => {
  const takeover = buildUserTeam('Yawara', picksOf(YAWARA), ROOKIE, YAWARA.teamwork, orgRefSynergy(YAWARA));
  // força uma troca de função pra que o resync recalcule de fato
  const first = takeover.players[0];
  const novaRole: Role = first.role === 'AWP' ? 'RIFLER' : 'AWP';
  const originalId = first.id.replace(/^user__/, '');
  const roleOf = (oid: string): Role | undefined => (oid === originalId ? novaRole : undefined);

  const semHeranca = resyncUserRoles(takeover, roleOf);                                            // como era antes: reestampa 78
  const comHeranca = resyncUserRoles(takeover, roleOf, YAWARA.teamwork, orgRefSynergy(YAWARA));    // corrigido

  assert.notEqual(semHeranca.teamwork, comHeranca.teamwork, 'o resync precisa ter recalculado algo');
  assert.ok(
    comHeranca.teamwork < semHeranca.teamwork,
    `com herança devia ser menor (${comHeranca.teamwork} vs ${semHeranca.teamwork})`,
  );
  assert.ok(
    comHeranca.teamwork >= YAWARA.teamwork - 14 && comHeranca.teamwork <= YAWARA.teamwork + 12,
    `resync saiu da janela da base ${YAWARA.teamwork}: ${comHeranca.teamwork}`,
  );
});

test('sem troca de função, resyncUserRoles é no-op e não mexe no teamwork', () => {
  const takeover = buildUserTeam('Yawara', picksOf(YAWARA), ROOKIE, YAWARA.teamwork, orgRefSynergy(YAWARA));
  const same = resyncUserRoles(takeover, () => undefined, YAWARA.teamwork, orgRefSynergy(YAWARA));
  assert.equal(same.teamwork, takeover.teamwork);
});
