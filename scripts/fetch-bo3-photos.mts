// Atualiza MANUALMENTE as fotos do bo3.gg em public/players/bo3/ (commitadas).
// Só usa URLs de imagem do CDN files.bo3.gg já listadas — NUNCA a /api/ do bo3.gg
// (bloqueada no robots.txt). Baixa as que faltam, depois reescreve bo3-photos.json
// só com as que existem em disco e bo3-photos-missing.json com as quebradas.
// Uso: npm run photos:bo3   (não roda no build)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = 'public/players/bo3'; mkdirSync(dir, { recursive: true });
const okPath = 'src/data/bo3-photos.json', missPath = 'src/data/bo3-photos-candidates.json';
const all: Record<string, string> = { ...(existsSync(missPath) ? JSON.parse(readFileSync(missPath, 'utf8')) : {}), ...JSON.parse(readFileSync(okPath, 'utf8')) };
const ok: Record<string, string> = {}; const bad: string[] = [];
for (const [nick, url] of Object.entries(all)) {
  const k = nick.toLowerCase().replace(/[^a-z0-9_-]/g, ''); const out = `${dir}/${k}.webp`;
  if (!existsSync(out)) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'RoadToMajor-build/1.0' } });
      if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(String(r.status));
      writeFileSync(out, Buffer.from(await r.arrayBuffer()));
    } catch { bad.push(nick); continue; }
  }
  ok[nick] = url;
}
writeFileSync(okPath, JSON.stringify(ok));
writeFileSync('src/data/bo3-photos-missing.json', JSON.stringify(bad.sort(), null, 0));
console.log(`bo3 photos: ${Object.keys(ok).length} ok, ${bad.length} quebradas (placeholder)`);
