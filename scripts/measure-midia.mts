// [MÍDIA VIVA] NEUTRALIDADE da mídia: o técnico que SEMPRE escolhe o tom que
// mais sobe a moral do elenco (pior caso) contra quem nunca dá coletiva.
// Mesma temporada modelo do measure-neutralidade (3 splits × 3 etapas × 4
// séries MD3, adversário de força parecida), mesmos sorteios; a moral entra no
// motor como na Carreira (moraleForm) e volta ao normal no fechamento
// (satisfactionMoraleDrift rumo a 70). Portão: |diferença| ≤ 2 pp.
//
//   npx tsx scripts/measure-midia.mts [temporadas=60]
import { simulateSeries } from '../src/engine/match.ts';
import { makeRng } from '../src/engine/rng.ts';
import { MAP_POOL, type MapId, type TTeam } from '../src/types.ts';
import { realTeams } from './calibrate-engine.mts';
import { moraleForm, satisfactionMoraleDrift } from '../src/engine/career/happiness.ts';
import { recordRivalry } from '../src/engine/career/rivalries.ts';
import { defaultMidia, PRESS_TONES, type MidiaState, type PressTone } from '../src/engine/midia/model.ts';
import { recordSeries, pressEffects, applyMoraleFx, commitPress, preMatchConference, koStageOf, FX } from '../src/engine/midia/midia.ts';
import type { PressConf } from '../src/engine/midia/model.ts';

const SPLITS = 3, EVENTS = 3, SERIES = 4;

export interface MidiaNeutral { series: number; before: number; after: number; diff: number; se: number; confs: number; avgMorale: number }

export function measureMidia(seasons = 60, seed = 777): MidiaNeutral {
  const all = realTeams().sort((a, b) => b.strength - a.strength).slice(0, 60);
  let wB = 0, wA = 0, n = 0, dd = 0, dd2 = 0, confs = 0, mSum = 0, mN = 0;
  for (let s = 0; s < seasons; s++) {
    const base = all[(s * 7) % all.length];
    const user: TTeam = { ...base, id: 'user', isUser: true, players: base.players.map((p) => ({ ...p, id: `user__${p.id}` })) };
    const ids = base.players.map((p) => p.id);
    const opps = all.filter((t) => t.id !== base.id && Math.abs(t.strength - base.strength) <= 6);
    let morale: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 70]));
    let m: MidiaState = defaultMidia();
    let riv: Record<string, number> = {};
    let k = 0;
    for (let sp = 1; sp <= SPLITS; sp++) {
      for (let ev = 0; ev < EVENTS; ev++) {
        for (let se = 0; se < SERIES; se++, k++) {
          const opp = opps[(s * 13 + k * 5) % opps.length];
          const maps = [0, 1, 2].map((i) => ({ map: MAP_POOL[(s * 3 + k * 2 + i * 3) % 7] as MapId, pickedBy: -1 as const }));
          const rs = (Math.imul(seed + s * 1000 + k, 2654435761) >>> 0);
          const label = se === 2 ? 'Liga · Semifinal' : se === 3 ? 'Liga · Final' : `Liga · Rodada ${se + 1}`;
          const answer = (conf: PressConf) => {
            // pior caso: o tom que mais sobe a moral (elenco + citado) em cada pergunta
            const picks = conf.qs.map((q) => PRESS_TONES.reduce((bst: PressTone, t) => (FX[q.t][t][0] + FX[q.t][t][1] > FX[q.t][bst][0] + FX[q.t][bst][1] ? t : bst), 'calm'));
            const fx = pressEffects(conf, picks);
            morale = applyMoraleFx(morale, ids, fx);
            m = commitPress(m, conf, picks, fx);
            confs++;
          };
          const pre = preMatchConference(m, { split: s * 10 + sp, matchKey: `${k}`, oid: opp.id, o: opp.tag, label, k: koStageOf(label), rivalScore: riv[opp.id] ?? 0, squad: ids.map((id) => ({ id, nick: id, avg: 1 })), board: 60, rumor: null });
          if (pre) answer(pre);
          const before = simulateSeries(makeRng(rs), user, opp, maps, 3);
          const withMorale: TTeam = { ...user, players: user.players.map((p) => ({ ...p, form: moraleForm(morale[p.id.replace(/^user__/, '')] ?? 70) })) };
          const after = simulateSeries(makeRng(rs), withMorale, opp, maps, 3);
          for (const id of ids) { mSum += morale[id]; mN++; }
          const b = before.winner === 0 ? 1 : 0, a = after.winner === 0 ? 1 : 0;
          wB += b; wA += a; n++; dd += a - b; dd2 += (a - b) ** 2;
          // mídia: a série registrada com o resultado DEPOIS
          const rr = recordRivalry(riv, opp.id, after);
          riv = rr.rivalries;
          const out = recordSeries(m, {
            split: s * 10 + sp, oid: opp.id, o: opp.tag, label, shortLabel: 'Liga', won: a === 1, sc: `${after.mapScore[0]}-${after.mapScore[1]}`,
            rivalScore: rr.score, squad: ids.map((id) => ({ id, nick: id, avg: 1 })), board: 60,
          });
          m = out.midia;
          if (m.pend) answer(m.pend);
        }
      }
      for (const id of ids) morale[id] = Math.max(0, Math.min(100, morale[id] + satisfactionMoraleDrift(morale[id], 70)));
    }
  }
  const mean = dd / n;
  return { series: n, before: wB / n, after: wA / n, diff: mean, se: Math.sqrt((dd2 / n - mean * mean) / n), confs, avgMorale: mSum / mN };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] ?? 60);
  const r = measureMidia(n);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  console.log(`${r.series} séries MD3 (${n} temporadas) · ${r.confs} coletivas (${(r.confs / r.series * 100).toFixed(0)}% das séries)`);
  console.log(`vitória SEM mídia: ${pct(r.before)}   COM mídia (tom que mais sobe a moral): ${pct(r.after)}   diferença ${(r.diff * 100).toFixed(1)} pp ± ${(r.se * 100).toFixed(1)}`);
  console.log(`moral média do elenco na hora do jogo: ${r.avgMorale.toFixed(1)} (base 70)`);
}
