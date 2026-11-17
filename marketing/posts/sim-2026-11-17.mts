import data from '../../src/data/major-singapore-2026.json';
import { simSeries, seriesWinP, mapWinP } from '../../src/engine/majorSingapore';
import { makeRng } from '../../src/engine/rng';
const T = new Map((data as any).teams.map((t: any) => [t.tag, t]));
function run(a: string, b: string, bo: 1 | 3 | 5, n = 1000) {
  const rng = makeRng(20261117);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const m: any = simSeries(T.get(a) as any, T.get(b) as any, bo, 'x', rng, 4);
    if (m.winner === (T.get(a) as any).id) w++;
  }
  const p = mapWinP((T.get(a) as any).rating, (T.get(b) as any).rating);
  console.log(`${a} x ${b} bo${bo}: ${(w / n * 100).toFixed(1)}% (analítico ${(seriesWinP(p, bo) * 100).toFixed(1)}%, mapa ${(p * 100).toFixed(1)}%)`);
}
run('FURIA', 'TS', 5); run('FURIA', 'BB', 3); run('FURIA', 'VIT', 5); run('MIBR', 'FURIA', 3);
