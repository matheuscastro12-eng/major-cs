// Baixa as fotos do bo3.gg pra public/players/bo3/ (gitignored) — SÓ com a flag
// VITE_FF_BO3_PHOTOS=1. Roda no prebuild; sem flag é no-op. Ver src/data/bo3Photos.ts.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import photos from '../src/data/bo3-photos.json' with { type: 'json' };

if (process.env.VITE_FF_BO3_PHOTOS !== '1') { console.log('bo3 photos: flag OFF, nada baixado'); process.exit(0); }
const dir = 'public/players/bo3'; mkdirSync(dir, { recursive: true });
const only = process.argv.slice(2).map((s) => s.toLowerCase());
let ok = 0, fail = 0;
for (const [nick, url] of Object.entries(photos as Record<string, string>)) {
  if (only.length && !only.includes(nick)) continue;
  const k = nick.toLowerCase().replace(/[^a-z0-9_-]/g, ''); const out = `${dir}/${k}.webp`;
  if (existsSync(out)) { ok++; continue; }
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'RoadToMajor-build/1.0' } });
    if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(String(r.status));
    writeFileSync(out, Buffer.from(await r.arrayBuffer())); ok++;
  } catch { fail++; }
}
console.log(`bo3 photos: ${ok} ok, ${fail} falharam (placeholder)`);
