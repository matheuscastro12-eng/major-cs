// MOTOR DE PARTIDA v2 (duelos) — comportamento e honestidade. `npm run test:sim`.
//
// Cobertura:
//   - a DP exata da cadeia (winProbT) é a frequência real da amostragem (playRound)
//   - Carreira: % mostrado (peekWinProb) = % rolado (lastRollP) quando não há
//     informação oculta; e a % rolada É a probabilidade (calibração agregada)
//   - identidade tática: o desvio de pp continua exato no v2
//   - mesma API do v1; flag MATCH_ENGINE e opts.engine escolhem o motor
//   - estatísticas emergem dos duelos (killfeed = stats, abertura/troca coerentes)
//   - atributos pesam: mira, stamina (série longa), bigMatch (oculto), IGL
//   - Road to Pro: a jogada da Sala move o duelo do herói; a Sala segue honesta
//   - Ultimate: a sessão casual replaya no motor em que nasceu

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMapSim, createMapSimV1, simulateSeries, setMatchEngine, getMatchEngine, computeDisplay, mergeLines,
} from '../src/engine/match.ts';
import { createMapSimV2 } from '../src/engine/match2/engine.ts';
import { playRound, winProbT, type RoundSpec, type SideSpec } from '../src/engine/match2/round.ts';
import { makeRng } from '../src/engine/rng.ts';
import { attrsOf, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import { realTeams } from './calibrate-engine.mts';
import { identityLabel, type IdentityMod } from '../src/engine/career/teamIdentity.ts';
import { createSession, normalizeSession, advanceSession, viewSession } from '../src/engine/ultimate/matchSession.ts';
import { heroDuelMod, heroSeriesOpts } from '../src/engine/rtp/matchSim.ts';
import { createRoom, currentMoment, lockIn, advance, roomOdds, finishSeries } from '../src/engine/rtp/room.ts';
import { dailyChallengeOf } from '../src/engine/rtp/dailySeries.ts';
import type { MapId, PlayerLine, TPlayer, TTeam } from '../src/types.ts';

const TEAMS = realTeams();
const MAPS3: { map: MapId; pickedBy: 0 | 1 | -1 }[] = [{ map: 'mirage', pickedBy: 0 }, { map: 'nuke', pickedBy: 1 }, { map: 'inferno', pickedBy: -1 }];

function withEngine<T>(e: 'v1' | 'v2', f: () => T): T {
  setMatchEngine(e);
  try { return f(); } finally { setMatchEngine(null); }
}

// ── DP × amostragem ─────────────────────────────────────────────────────────

function randomSide(rnd: () => number): SideSpec {
  const f = (lo: number, hi: number) => Float64Array.from({ length: 5 }, () => lo + rnd() * (hi - lo));
  return {
    base: f(9, 18), mod: f(-1.5, 1.5), phase1: f(8, 18), sense: f(8, 18), phase2: f(8, 18), clutch: f(8, 18),
    trade: f(8, 18), eq: f(-2.3, 0), awp: Uint8Array.from([1, 0, 0, 0, 0]),
    wOpen: f(0.5, 2.5), wMid: f(0.8, 1.3), wPost: f(0.8, 1.3), tradeTeam: 0.8 + rnd() * 0.4, saveMult: 1 + rnd() * 1.5,
  };
}

test('v2: a probabilidade exata (DP) é a frequência real da cadeia de duelos', () => {
  const rnd = makeRng(4242);
  for (let k = 0; k < 5; k++) {
    const spec: RoundSpec = { sides: [randomSide(rnd), randomSide(rnd)], bias: (rnd() - 0.5) * 0.8, plantMult: 0.7 + rnd() * 0.6 };
    const p = winProbT(spec);
    const rng = makeRng(9000 + k);
    const n = 120_000;
    let w = 0;
    for (let i = 0; i < n; i++) if (playRound(spec, rng).winner === 0) w++;
    const se = Math.sqrt((p * (1 - p)) / n);
    assert.ok(Math.abs(w / n - p) < 4.5 * se, `spec ${k}: DP ${p.toFixed(4)} × frequência ${(w / n).toFixed(4)}`);
  }
});

// ── Carreira: % mostrado = % rolado ─────────────────────────────────────────

test('v2: % mostrado = % rolado sem leitura de site; a % rolada é a probabilidade real', () => {
  let rounds = 0, sumP = 0, sumVar = 0, wins = 0, hidden = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const a = TEAMS[seed % TEAMS.length], b = TEAMS[(seed * 7 + 5) % TEAMS.length];
    const sim = createMapSim(makeRng(seed), a, b, 'ancient', -1, { engine: 'v2' });
    let g = 0;
    while (!sim.done() && g++ < 60) {
      const boost = g % 5 === 0 ? 0 : null;
      const stance = g % 3 === 0 ? { team: 0 as const, mode: 'aggressive' as const } : undefined;
      const call = g % 7 === 0 ? { team: 0 as const, kind: 'rush' as const } : undefined;
      const shown = sim.peekWinProb(0, stance, call, boost);
      sim.step(boost, stance, call);
      const rolled = sim.lastRollP(0)!;
      const ls = sim.lastSite()!;
      if (ls.ctStack == null) assert.ok(Math.abs(rolled - shown) < 1e-12, `seed ${seed}: mostrado ${shown} × rolado ${rolled}`);
      else hidden++;
      assert.ok(Math.abs(sim.lastRollP(1)! - (1 - rolled)) < 1e-12);
      const log = sim.roundLog();
      rounds++; sumP += rolled; sumVar += rolled * (1 - rolled);
      if (log[log.length - 1] === 0) wins++;
    }
  }
  assert.ok(hidden > 50, `leitura de site nunca aconteceu (${hidden})`);
  // calibração: vitórias observadas × soma das % roladas, dentro de 4 desvios
  const z = (wins - sumP) / Math.sqrt(sumVar);
  assert.ok(Math.abs(z) < 4, `a % rolada não é a probabilidade real: z=${z.toFixed(2)} (${wins} vitórias × ${sumP.toFixed(1)} esperadas em ${rounds})`);
});

test('v2: identidade tática desloca a % mostrada no valor exato (pp) e o round joga essa %', () => {
  const [a, b] = [TEAMS[3], TEAMS[9]];
  const label = identityLabel({ hist: { 't|rush|aggressive|full': 12 }, total: 12, matches: 6 });
  assert.equal(label.kind, 'rush');
  const mod: IdentityMod = { team: 0, label, readBy: 0, auto: false };
  const sim = createMapSimV2(makeRng(77), a, b, 'mirage', -1, { identity: [mod] });
  const base = createMapSimV2(makeRng(77), a, b, 'mirage', -1);
  // (o valor exato do pp por contexto é coberto em test-team-identity.mts, que roda no v2)
  let shifted = 0, played = 0;
  while (!sim.done()) {
    const st = { team: 0 as const, mode: 'aggressive' as const };
    const call = { team: 0 as const, kind: 'rush' as const };
    const p = sim.peekWinProb(0, st, call);
    const q = base.peekWinProb(0, st, call);
    if (Math.abs(p - q) > 1e-6) shifted++;
    sim.step(null, st, call);
    base.step(null, st, call);
    if (sim.lastSite()!.ctStack == null) {
      assert.ok(Math.abs(sim.lastRollP(0)! - p) < 1e-9, `o round não jogou a % deslocada: ${sim.lastRollP(0)} × ${p}`);
      played++;
    }
  }
  assert.ok(shifted > 3 && played > 5, `identidade não atuou (${shifted}/${played})`);
});

// ── API e flag ──────────────────────────────────────────────────────────────

test('v2: mesma API do v1 e a flag escolhe o motor', () => {
  const [a, b] = [TEAMS[0], TEAMS[1]];
  const v1 = createMapSimV1(makeRng(1), a, b, 'dust2', -1);
  const v2 = createMapSimV2(makeRng(1), a, b, 'dust2', -1);
  for (const k of Object.keys(v1)) assert.equal(typeof (v2 as unknown as Record<string, unknown>)[k], 'function', `v2 sem ${k}`);
  assert.equal(getMatchEngine(), process.env.MATCH_ENGINE === 'v1' ? 'v1' : 'v2');
  const run = (make: () => ReturnType<typeof createMapSim>) => { const s = make(); while (!s.step()) { /* */ } return s.result(); };
  const ref1 = run(() => createMapSimV1(makeRng(5), a, b, 'dust2', -1));
  const ref2 = run(() => createMapSimV2(makeRng(5), a, b, 'dust2', -1));
  assert.deepEqual(withEngine('v1', () => run(() => createMapSim(makeRng(5), a, b, 'dust2', -1))).roundLog, ref1.roundLog);
  assert.deepEqual(withEngine('v2', () => run(() => createMapSim(makeRng(5), a, b, 'dust2', -1))).roundLog, ref2.roundLog);
  // opts.engine vence a flag global
  assert.deepEqual(withEngine('v2', () => run(() => createMapSim(makeRng(5), a, b, 'dust2', -1, { engine: 'v1' }))).roundLog, ref1.roundLog);
  // determinismo
  assert.deepEqual(run(() => createMapSimV2(makeRng(5), a, b, 'dust2', -1)), ref2);
});

// ── estatísticas emergem dos duelos ─────────────────────────────────────────

test('v2: killfeed e stats contam a mesma história (nada distribuído depois)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const a = TEAMS[seed], b = TEAMS[seed + 40];
    const r = withEngine('v2', () => simulateSeries(makeRng(seed), a, b, MAPS3, 3));
    for (const m of r.maps) {
      const byRound = new Map<number, typeof m.killFeed>();
      for (const e of m.killFeed) byRound.set(e.round, [...(byRound.get(e.round) ?? []), e]);
      for (const [rd, evs] of byRound) {
        assert.equal(evs.filter((e) => e.opening).length, 1, `round ${rd}: uma abertura`);
        assert.ok(evs[0].opening, 'a abertura é o 1º abate');
        for (const t of [0, 1] as const) assert.ok(evs.filter((e) => e.victimTeam === t).length <= 5);
        const dead = new Set<string>();
        for (const e of evs) {
          assert.ok(!dead.has(e.killerId), `round ${rd}: morto matou (${e.killerId})`);
          assert.ok(!dead.has(e.victimId), `round ${rd}: morreu duas vezes`);
          dead.add(e.victimId);
        }
        // troca: a vítima é quem acabou de matar
        evs.forEach((e, i) => { if (e.trade) assert.equal(e.victimId, evs[i - 1].killerId, 'troca sem ser do matador'); });
      }
      for (const [team, t] of [[0, a], [1, b]] as const) {
        const kills = t.players.reduce((s, p) => s + m.stats[p.id].both.kills, 0);
        const deaths = t.players.reduce((s, p) => s + m.stats[p.id].both.deaths, 0);
        assert.equal(kills, m.killFeed.filter((e) => e.killerTeam === team).length);
        assert.equal(deaths, m.killFeed.filter((e) => e.victimTeam === team).length);
        const opens = t.players.reduce((s, p) => s + m.stats[p.id].both.openKills, 0);
        assert.equal(opens, m.killFeed.filter((e) => e.opening && e.killerTeam === team).length);
        for (const p of t.players) {
          const l = m.stats[p.id].both;
          assert.equal(l.rounds, m.roundLog.length);
          assert.ok(l.kastRounds <= l.rounds && l.hsKills <= l.kills && l.dmg <= l.rounds * 500);
        }
      }
    }
  }
});

// ── atributos pesam ─────────────────────────────────────────────────────────

function cloneTeam(t: TTeam, tag: string, edit?: (p: TPlayer, i: number) => TPlayer): TTeam {
  return { ...t, id: `${t.id}-${tag}`, players: t.players.map((p, i) => { const q = { ...p, id: `${p.id}-${tag}` }; return edit ? edit(q, i) : q; }) };
}
function withAttrs(p: TPlayer, f: (x: PlayerAttrs) => void): TPlayer {
  const x = structuredClone(attrsOf(p));
  f(x);
  return { ...p, attrs: x };
}
function kprOf(lines: PlayerLine[]): number { const m = mergeLines(lines); return m.kills / Math.max(1, m.rounds); }

test('v2: mira melhor mata mais — o duelo lê os atributos', () => {
  const base = TEAMS[20], opp = TEAMS[21];
  const aimKeys = ['aim', 'crosshair', 'reflexes', 'reaction', 'headshot', 'spray', 'tap', 'aimMovement', 'preAim'] as const;
  const buff = cloneTeam(base, 'buff', (p, i) => (i === 2 ? withAttrs(p, (x) => { for (const k of aimKeys) x.a[k] = Math.min(20, x.a[k] + 4); }) : p));
  const plain = cloneTeam(base, 'plain', (p, i) => (i === 2 ? withAttrs(p, () => {}) : p));
  const lb: PlayerLine[] = [], lp: PlayerLine[] = [];
  let winsB = 0, winsP = 0;
  for (let s = 1; s <= 120; s++) {
    const rb = createMapSimV2(makeRng(s), buff, opp, 'mirage', -1); while (!rb.step()) { /* */ }
    const rp = createMapSimV2(makeRng(s), plain, opp, 'mirage', -1); while (!rp.step()) { /* */ }
    lb.push(rb.stats()[buff.players[2].id].both); lp.push(rp.stats()[plain.players[2].id].both);
    if (rb.result().winner === 0) winsB++;
    if (rp.result().winner === 0) winsP++;
  }
  assert.ok(kprOf(lb) > kprOf(lp) + 0.05, `KPR ${kprOf(lb).toFixed(3)} × ${kprOf(lp).toFixed(3)}`);
  assert.ok(computeDisplay(mergeLines(lb)).rating > computeDisplay(mergeLines(lp)).rating + 0.08);
  assert.ok(winsB >= winsP, `o time com o craque não venceu mais (${winsB} × ${winsP})`);
});

test('v2: ocultos e físico — stamina cansa na série longa, bigMatch pesa em jogo grande', () => {
  const base = TEAMS[30], opp = TEAMS[31];
  const set = (tag: string, f: (x: PlayerAttrs) => void) => cloneTeam(base, tag, (p) => withAttrs(p, f));
  const kpr = (t: TTeam, opts: { mapIndex?: number; bigMatch?: boolean }) => {
    const lines: PlayerLine[] = [];
    for (let s = 1; s <= 150; s++) {
      const sim = createMapSimV2(makeRng(s), t, opp, 'inferno', -1, opts);
      while (!sim.step()) { /* */ }
      for (const p of t.players) lines.push(sim.stats()[p.id].both);
    }
    return kprOf(lines);
  };
  const tired = set('tired', (x) => { x.a.stamina = 2; });
  assert.ok(kpr(tired, { mapIndex: 2 }) < kpr(tired, { mapIndex: 0 }) - 0.01, 'stamina baixa não cansou no 3º mapa');
  const clutchy = set('big', (x) => { x.h.bigMatch = 20; });
  const choker = set('choke', (x) => { x.h.bigMatch = 1; });
  assert.ok(kpr(clutchy, { bigMatch: true }) > kpr(choker, { bigMatch: true }) + 0.02, 'bigMatch não pesou no jogo grande');
  assert.ok(Math.abs(kpr(clutchy, {}) - kpr(choker, {})) < 0.012, 'bigMatch pesou fora de jogo grande');
});

// ── Road to Pro ─────────────────────────────────────────────────────────────

test('v2 RtP: a jogada da Sala é modificador do duelo do herói (monótono)', () => {
  assert.ok(heroDuelMod(10) > 0 && heroDuelMod(-10) < 0 && heroDuelMod(-10) > -heroDuelMod(10), 'penalidade amortecida');
  const t = cloneTeam(TEAMS[40], 'rtp', (p, i) => (i === 0 ? { ...p, id: 'rtp-hero' } : p));
  const heroRating = (boost: number) => {
    const lines: PlayerLine[] = [];
    for (let s = 1; s <= 60; s++) {
      const r = withEngine('v2', () => simulateSeries(makeRng(s), t, TEAMS[41], MAPS3, 3, heroSeriesOpts(boost)));
      for (const m of r.maps) lines.push(m.stats['rtp-hero'].both);
    }
    return computeDisplay(mergeLines(lines)).rating;
  };
  const bad = heroRating(-15), mid = heroRating(0), good = heroRating(15);
  assert.ok(bad < mid && mid < good, `rating não sobe com a jogada: ${bad.toFixed(3)} / ${mid.toFixed(3)} / ${good.toFixed(3)}`);
});

test('v2 RtP: na Sala o % mostrado é o limiar do roll e o card mostra os mapas que a Sala fechou', () => {
  withEngine('v2', () => {
    for (let d = 1; d <= 6; d++) {
      const ch = dailyChallengeOf(`2026-10-${String(d).padStart(2, '0')}`);
      let s = createRoom(ch.save, ch.prep);
      let guard = 0;
      while (s.phase !== 'done' && guard++ < 300) {
        if (s.phase !== 'decide') { s = advance(s); continue; }
        const m = currentMoment(s);
        const opt = m.options[guard % m.options.length];
        const shown = roomOdds(s, opt);
        const r = lockIn(s, opt.id, null);
        assert.equal(r.beat.odds.total, shown.total, '% mostrado ≠ limiar');
        if (r.beat.roll < shown.total) assert.equal(r.beat.outcome.result, 'success');
        else assert.notEqual(r.beat.outcome.result, 'success');
        s = r.state;
      }
      const opp = ch.prep.opp;
      const oppTeam: TTeam = {
        id: 'opp', name: opp.name, tag: opp.tag, country: 'br', isUser: false, game: 'CS2', colors: opp.colors,
        strength: opp.strength, teamwork: 70, mapPrefs: opp.mapPrefs ?? {}, coach: { nick: '-', name: '-', country: 'br', rating: 60, style: 'tactical' },
        players: opp.players, wins: 0, losses: 0, roundDiff: 0, status: 'alive',
      };
      const { result, series } = finishSeries(ch.save, ch.prep, s.final!, oppTeam);
      const live = s.final!.liveMaps ?? [];
      if (live.length) {
        assert.deepEqual(result.maps.map((x) => x.score), live.map((x) => x.score), 'card ≠ Sala');
        assert.deepEqual(series.mapScore, [live.filter((x) => x.won).length, live.filter((x) => !x.won).length], 'sim ≠ Sala');
      }
    }
  });
});

// ── Ultimate ────────────────────────────────────────────────────────────────

test('v2 Ultimate: a sessão casual replaya no motor em que nasceu', () => {
  const [a, b] = [TEAMS[5], TEAMS[6]];
  const fresh = withEngine('v2', () => createSession({ matchId: 'm1', seed: 99, teams: [a, b], map: 'nuke', pickedBy: -1, now: 1 }));
  assert.equal(fresh.engine, 'v2');
  // sessão persistida ANTES do motor v2 (sem o campo) replaya no v1
  const legacy = normalizeSession({ ...fresh, engine: undefined })!;
  assert.equal(legacy.engine, 'v1');
  let s = legacy;
  for (let i = 0; i < 5; i++) s = withEngine('v2', () => advanceSession(s));
  const ref = createMapSimV1(makeRng(99), a, b, 'nuke', -1);
  for (let i = 0; i < 5; i++) ref.step();
  assert.deepEqual(withEngine('v2', () => viewSession(s)).roundLog, ref.roundLog());
  // e a sessão v2 continua v2 mesmo com a flag global em v1
  let s2 = fresh;
  for (let i = 0; i < 5; i++) s2 = withEngine('v1', () => advanceSession(s2));
  const ref2 = createMapSimV2(makeRng(99), a, b, 'nuke', -1);
  for (let i = 0; i < 5; i++) ref2.step();
  assert.deepEqual(withEngine('v1', () => viewSession(s2)).roundLog, ref2.roundLog());
});
