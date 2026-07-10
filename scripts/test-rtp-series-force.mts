// Regressão do "rodando de um jeito, resultado sai diferente" (RtP):
// simulateSeriesForPlay PRECISA reproduzir o placar da Sala mesmo quando o alvo
// é uma ZEBRA que o sim cru quase nunca produz (a régua de dificuldade da Sala
// pesa o adversário diferente do sim). Antes do fix, o fallback devolvia série
// com vencedor/placar errados → scoreboard e histórico da liga contradiziam o
// banner. Roda: tsx --test scripts/test-rtp-series-force.mts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateSeriesForPlay } from '../src/engine/rtp/matchSim.ts';
import type { Coach, MapId, Role, TPlayer, TTeam } from '../src/types.ts';

const ROLES: Role[] = ['IGL', 'AWP', 'Entry', 'Rifler', 'Support'];

function mkPlayer(id: string, skill: number, role: Role): TPlayer {
  return {
    id, sourcePlayerId: id, nick: id, name: id, country: 'br', role,
    playstyle: 'balanced', aim: skill, clutch: skill, consistency: skill,
    awp: role === 'AWP' ? skill : 40, igl: role === 'IGL' ? skill : 40,
    skill, ovr: skill,
  };
}

function mkTeam(id: string, strength: number, isUser: boolean): TTeam {
  const coach: Coach = { nick: `${id}-co`, name: `${id}-co`, country: 'br', rating: 70, style: 'balanced' as Coach['style'] };
  return {
    id, name: id.toUpperCase(), tag: id.slice(0, 3).toUpperCase(), country: 'br', isUser,
    game: 'CS2', colors: ['#111111', '#eeeeee'], strength, teamwork: strength,
    mapPrefs: {}, coach, players: ROLES.map((r, i) => mkPlayer(`${id}-${i}`, strength, r)),
    wins: 0, losses: 0, roundDiff: 0, status: 'alive',
    // RtP sempre marca o adversário com noEdge (sem AI_EDGE) — espelha aqui.
    ...(isUser ? {} : { noEdge: true as const }),
  } as TTeam;
}

const MAPS: { map: MapId; pickedBy: 0 | 1 | -1 }[] = [
  { map: 'mirage' as MapId, pickedBy: 0 }, { map: 'nuke' as MapId, pickedBy: 1 }, { map: 'inferno' as MapId, pickedBy: -1 },
];

// ZEBRA extrema: herói MUITO mais fraco (55) vence time elite (88) — a Sala
// decide isso (jogada do jogador); o sim tem que ACEITAR e reproduzir o alvo.
test('zebra: alvo 2-1 do azarão sai EXATO (vencedor nunca contradiz a Sala)', () => {
  const weak = mkTeam('her', 55, true);
  const strong = mkTeam('vil', 88, false);
  for (let seed = 1; seed <= 40; seed++) {
    const s = simulateSeriesForPlay(seed * 7919, weak, strong, MAPS, 3, { mapWins: [2, 1], seriesWon: true });
    assert.equal(s.winner, 0, `seed ${seed}: vencedor contradiz a Sala`);
    assert.deepEqual(s.mapScore, [2, 1], `seed ${seed}: placar ${s.mapScore[0]}-${s.mapScore[1]} != 2-1 da Sala`);
  }
});

test('zebra invertida: favorito PERDE 0-2 (alvo do adversário) sai exato', () => {
  const strongUser = mkTeam('fav', 88, true);
  const weakOpp = mkTeam('zeb', 55, false);
  for (let seed = 1; seed <= 40; seed++) {
    const s = simulateSeriesForPlay(seed * 104729, strongUser, weakOpp, MAPS, 3, { mapWins: [0, 2], seriesWon: false });
    assert.equal(s.winner, 1, `seed ${seed}: vencedor contradiz a Sala`);
    assert.deepEqual(s.mapScore, [0, 2], `seed ${seed}: placar != 0-2 da Sala`);
  }
});

test('caso comum (forças parelhas): 2-0 e 2-1 saem exatos sem distorção', () => {
  const a = mkTeam('aaa', 74, true);
  const b = mkTeam('bbb', 72, false);
  for (let seed = 1; seed <= 40; seed++) {
    const s20 = simulateSeriesForPlay(seed * 31, a, b, MAPS, 3, { mapWins: [2, 0], seriesWon: true });
    assert.deepEqual(s20.mapScore, [2, 0]);
    const s21 = simulateSeriesForPlay(seed * 131, a, b, MAPS, 3, { mapWins: [1, 2], seriesWon: false });
    assert.deepEqual(s21.mapScore, [1, 2]);
  }
});
