import data from '../../src/data/major-singapore-2026.json';
import { simSeries, seriesWinP, mapWinP, phaseOdds } from '../../src/engine/majorSingapore';
import { makeRng } from '../../src/engine/rng';
const T = new Map((data as any).teams.map((t: any) => [t.tag, t]));
function run(a: string, b: string, bo: 1 | 3 | 5, n = 1000) {
  const rng = makeRng(20261128);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const m: any = simSeries(T.get(a) as any, T.get(b) as any, bo, 'x', rng, 4);
    if (m.winner === (T.get(a) as any).id) w++;
  }
  const p = mapWinP((T.get(a) as any).rating, (T.get(b) as any).rating);
  console.log(`${a} x ${b} bo${bo}: ${(w / n * 100).toFixed(1)}% (analítico ${(seriesWinP(p, bo) * 100).toFixed(1)}%)`);
}
run('100T','MIBR',1); run('MIBR','100T',1); run('FURIA','MIBR',1); run('G2','TL',1);
const names = new Map((data as any).teams.map((t: any) => [t.id, t.tag]));
const o = phaseOdds(data as any, 2000, 20261128);
for (const x of o.filter((x: any) => ['FURIA','MIBR','VIT','FLC','MOUZ'].includes(names.get(x.id) as string)))
  console.log(names.get(x.id), 'title', (x.title*100).toFixed(1));
