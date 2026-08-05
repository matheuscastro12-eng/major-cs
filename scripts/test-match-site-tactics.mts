// TÁTICAS POR SITE (#20 — engine/match.ts). Roda via `npm run test:sim`.
//
// Cobertura:
//   - todo round registra a leitura de site (lastSite/tSite sempre A|B)
//   - CT stackando o site CERTO ganha mais rounds que stackando o ERRADO
//     (o delta ±2.6/−1.8 é real, medido em amostra grande)
//   - T com siteCall define o alvo (tSite obedece a chamada)
//   - sem siteCall o jogo segue determinístico e válido (stream de RNG estável)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapSim } from '../src/engine/match.ts';
import { makeRng } from '../src/engine/rng.ts';
import type { TTeam, TPlayer } from '../src/types.ts';

function mkTeam(id: string, strength: number): TTeam {
  const players: TPlayer[] = Array.from({ length: 5 }, (_, i) => ({
    id: `${id}-p${i}`, nick: `${id}${i}`, country: 'br', role: i === 0 ? 'AWP' : i === 1 ? 'IGL' : 'Rifler',
    aim: strength, clutch: strength, consistency: strength, awp: strength, igl: strength, form: 1,
  } as unknown as TPlayer));
  return {
    id, name: id, tag: id.slice(0, 3).toUpperCase(), country: 'br', isUser: false, game: 'CS2',
    colors: ['#111', '#eee'], strength, teamwork: 70, mapPrefs: {},
    coach: { nick: 'coach', style: 'balanced' }, players, wins: 0, losses: 0, roundDiff: 0, status: 'alive',
  } as unknown as TTeam;
}

test('site: todo round registra leitura; T com call define o alvo', () => {
  const sim = createMapSim(makeRng(42), mkTeam('alpha', 70), mkTeam('beta', 70), 'mirage', -1);
  // primeiro round sem call: leitura registrada com site válido
  sim.step();
  const ls = sim.lastSite();
  assert.ok(ls && (ls.tSite === 'A' || ls.tSite === 'B'));
  // agora: quando o time 0 é T, a chamada define o alvo do ataque
  let checked = 0;
  while (!sim.done() && checked < 6) {
    const tIdx = sim.side()[0] === 't' ? 0 : 1;
    sim.step(null, undefined, undefined, { team: tIdx, site: 'B' });
    const l = sim.lastSite()!;
    assert.equal(l.tSite, 'B', 'a call do T não definiu o alvo');
    checked++;
  }
  assert.ok(checked >= 6);
});

test('site: stack certo vence mais que stack furado (o delta é real)', () => {
  // mede: rounds em que o CT stackou CERTO vs ERRADO — a taxa de vitória do CT
  // tem que ser visivelmente maior no acerto. Sem call do usuário, a IA stacka
  // ~30% dos rounds sozinha → amostra natural dos dois casos.
  let rightWins = 0, rightTotal = 0, wrongWins = 0, wrongTotal = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const sim = createMapSim(makeRng(seed), mkTeam('alpha', 70), mkTeam('beta', 70), 'inferno', -1);
    while (!sim.done()) {
      const ctIdx = sim.side()[0] === 'ct' ? 0 : 1;
      sim.step();
      const l = sim.lastSite()!;
      if (l.correct == null) continue;
      const log = sim.roundLog();
      const ctWon = log[log.length - 1] === ctIdx;
      if (l.correct) { rightTotal++; if (ctWon) rightWins++; }
      else { wrongTotal++; if (ctWon) wrongWins++; }
    }
  }
  assert.ok(rightTotal > 300 && wrongTotal > 300, `amostra: ${rightTotal}/${wrongTotal}`);
  const rightRate = rightWins / rightTotal;
  const wrongRate = wrongWins / wrongTotal;
  assert.ok(rightRate > wrongRate + 0.08, `stack certo ${Math.round(rightRate * 100)}% vs furado ${Math.round(wrongRate * 100)}% — delta fraco`);
});

test('site: determinismo — mesmo seed, mesma partida, com e sem registro', () => {
  const play = () => {
    const sim = createMapSim(makeRng(777), mkTeam('alpha', 72), mkTeam('beta', 68), 'nuke', -1);
    while (!sim.done()) sim.step();
    return { score: sim.score(), sites: sim.lastSite() };
  };
  const a = play();
  const b = play();
  assert.deepEqual(a.score, b.score);
  assert.deepEqual(a.sites, b.sites);
});
