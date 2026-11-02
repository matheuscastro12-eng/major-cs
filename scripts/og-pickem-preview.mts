// Gera o PNG do preview do pick'em localmente (o mesmo de api/og-pickem.ts),
// pra conferir o desenho sem deploy.
//   npx tsx scripts/og-pickem-preview.mts [campeão-id] [saída.png]
// Ex.: npx tsx scripts/og-pickem-preview.mts furia /tmp/og-pickem-exemplo.png
import { writeFileSync } from 'node:fs';
import {
  bracketSides, emptyPicks, encodePicks, normalizePicks, pickPool, picksComplete, type MajorData, type MajorPicks,
} from '../src/engine/majorSingapore.ts';
import { loadMajorData, pickemSummary } from '../server/og-pickem.ts';
import { renderPickemPng } from '../server/og-pickem-image.ts';

/** palpite dos favoritos (rating), forçando `champ` até o título quando ele está no pool */
export function favoritesPicks(d: MajorData, champ?: string): MajorPicks {
  let p = emptyPicks();
  const top = (st: 1 | 2 | 3) => {
    const pool = pickPool(d, p, st).sort((a, b) => b.rating - a.rating).map((t) => t.id);
    const ids = pool.slice(0, 8);
    if (champ && pool.includes(champ) && !ids.includes(champ)) ids[7] = champ;
    return ids;
  };
  p.s1 = top(1);
  p.s2 = top(2);
  p.s3 = top(3);
  const rating = new Map(d.teams.map((t) => [t.id, t.rating]));
  for (let i = 0; i < 7; i++) {
    const [a, b] = bracketSides(d, p)[i];
    p.bracket[i] = a === champ || b === champ ? champ! : (rating.get(a)! >= rating.get(b)! ? a : b);
  }
  p = normalizePicks(d, p);
  if (!picksComplete(p)) throw new Error('palpite incompleto');
  return p;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = loadMajorData();
  const champ = process.argv[2] || undefined;
  const out = process.argv[3] || '/tmp/og-pickem-exemplo.png';
  const code = encodePicks(d, favoritesPicks(d, champ));
  const s = pickemSummary(d, code);
  if (!s) throw new Error(`código inválido: ${code}`);
  const t0 = performance.now();
  const png = await renderPickemPng(s);
  writeFileSync(out, png);
  console.log(`p=${code}`);
  console.log(`${out} (${png.length} bytes, ${Math.round(performance.now() - t0)} ms, rss ${Math.round(process.memoryUsage().rss / 1e6)} MB)`);
}
