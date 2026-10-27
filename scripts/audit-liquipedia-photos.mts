// Auditoria de licença das fotos da Liquipedia pros jogadores do Major sem foto do bo3.gg.
// Só a API MediaWiki (api.php), 1 req / 2,2 s, User-Agent identificável, gzip (fetch faz por padrão).
// Não acessa HTML nem baixa imagem: só LÊ o wikitext da página do jogador (campo image) e da
// página do arquivo (FileInfo → license/author/copyright/source). Uma foto só é ACEITA se a
// licença for livre (CC BY, CC BY-SA, CC0 ou domínio público). "permission" = a Liquipedia
// recebeu permissão do detentor (ESL, BLAST, StarLadder...), NÃO é licença livre → rejeitada.
// Uso: npx tsx scripts/audit-liquipedia-photos.mts   → docs/liquipedia-photo-audit.json
import { readFileSync, writeFileSync } from 'node:fs';

const UA = 'RoadToMajorBot/1.0 (https://roadtomajor.com.br; matheuscastro12-eng@users.noreply.github.com)';
const rd = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const major = rd('src/data/major-singapore-2026.json') as { teams: { team: string; bo3Id: string }[] };
const bo3 = new Map((rd('src/data/bo3-2026.json') as { id: string; players: { nick: string }[] }[]).map((t) => [t.id, t]));
const have = rd('src/data/bo3-photos.json') as Record<string, string>;
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9_-]/g, '');
const PAGE_OVERRIDE: Record<string, string> = { MATYS: 'Matys', Tatu: 'TATu', MartinezSa: 'Martinez' }; // título da página ≠ nick
const FREE = /^(cc[- ]?by(-sa)?([- ]\d(\.\d)?)?|cc0|pd|public[- ]?domain)$/i;
const LICENSE_URL: Record<string, string> = { 'cc-by': 'https://creativecommons.org/licenses/by/4.0/', 'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0/', cc0: 'https://creativecommons.org/publicdomain/zero/1.0/' };

let last = 0;
async function api(wiki: 'commons' | 'counterstrike', params: Record<string, string>) {
  await new Promise((r) => setTimeout(r, Math.max(0, 2200 - (Date.now() - last))));
  last = Date.now();
  const u = new URL(`https://liquipedia.net/${wiki}/api.php`);
  for (const [k, v] of Object.entries({ action: 'query', format: 'json', rvslots: 'main', ...params })) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${wiki} ${r.status}`);
  return (await r.json()) as { query?: { pages: Record<string, { title: string; revisions?: { user: string; timestamp: string; slots: { main: { '*': string } } }[] }> } };
}
const field = (t: string, k: string) => t.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n]*)`))?.[1]?.trim() ?? '';
const clean = (s: string) => s.replace(/\[[^\s\]]+\s+([^\]]*)\]/g, '$1').replace(/[\[\]]/g, '').trim();

const teamOf: Record<string, string> = {};
for (const t of major.teams) for (const p of (bo3.get(t.bo3Id)?.players ?? []).slice(0, 5)) if (!have[p.nick.toLowerCase()] && !have[slug(p.nick)]) teamOf[p.nick] = t.team;
const nicks = Object.keys(teamOf);

// 1) página do jogador → arquivo da foto (campo image)
const fileOf: Record<string, string> = {}; const pageOf: Record<string, string> = {};
for (let i = 0; i < nicks.length; i += 20) {
  const b = nicks.slice(i, i + 20); const titles = b.map((n) => PAGE_OVERRIDE[n] ?? n);
  const r = await api('counterstrike', { titles: titles.join('|'), prop: 'revisions', rvprop: 'content', redirects: '1' });
  const pages = Object.values(r.query?.pages ?? {});
  for (const n of b) {
    const want = (PAGE_OVERRIDE[n] ?? n).toLowerCase();
    const p = pages.find((x) => x.title.toLowerCase() === want || x.title.toLowerCase() === want.replace(/^./, (c) => c.toUpperCase()).toLowerCase());
    const img = p?.revisions ? field(p.revisions[0].slots.main['*'], 'image').replace(/\|.*$/, '').trim() : '';
    if (p) pageOf[n] = p.title;
    if (img) fileOf[n] = `File:${img}`;
  }
}
// 2) página do arquivo → licença
const files = [...new Set(Object.values(fileOf))]; const info: Record<string, any> = {};
for (let i = 0; i < files.length; i += 20) {
  const b = files.slice(i, i + 20);
  const r = await api('commons', { titles: b.join('|'), prop: 'revisions', rvprop: 'content|user|timestamp', redirects: '1' });
  for (const p of Object.values(r.query?.pages ?? {})) info[p.title.toLowerCase()] = p;
}
const today = new Date().toISOString().slice(0, 10);
const rows = nicks.map((nick) => {
  const base = { player: nick, team: teamOf[nick], playerPage: pageOf[nick] ? `https://liquipedia.net/counterstrike/${encodeURIComponent(pageOf[nick])}` : null, verifiedAt: today };
  const f = fileOf[nick];
  if (!f) return { ...base, status: 'sem-foto', reason: pageOf[nick] ? 'página do jogador sem imagem' : 'página do jogador não encontrada' };
  const p = info[f.replace(/_/g, ' ').toLowerCase()]; const t = p?.revisions?.[0].slots.main['*'] ?? '';
  const license = field(t, 'license') || 'desconhecida'; const free = FREE.test(license);
  return {
    ...base, file: f.replace(/^File:/, ''), fileUrl: `https://liquipedia.net/commons/${encodeURIComponent(f.replace(/ /g, '_')).replace('%3A', ':')}`,
    author: clean(field(t, 'author')) || null, copyright: clean(field(t, 'copyright')) || null, license,
    licenseUrl: LICENSE_URL[license.toLowerCase()] ?? null, source: field(t, 'source').match(/https?:\/\/[^\s\]]+/)?.[0] ?? null,
    status: free ? 'aceita' : 'rejeitada',
    reason: free ? 'licença livre' : license === 'permission' ? 'licença "permission": Liquipedia tem permissão do detentor dos direitos (uso restrito a ela), não é licença livre' : `licença não livre/desconhecida (${license})`,
  };
});
const count = (s: string) => rows.filter((r) => r.status === s).length;
writeFileSync('docs/liquipedia-photo-audit.json', JSON.stringify({ generatedAt: today, api: 'MediaWiki API (liquipedia.net/{commons,counterstrike}/api.php), 1 req/2,2s, UA identificável', accepted: count('aceita'), rejected: count('rejeitada'), noPhoto: count('sem-foto'), rows }, null, 1));
console.log(`aceitas ${count('aceita')} · rejeitadas ${count('rejeitada')} · sem foto/página ${count('sem-foto')} de ${rows.length}`);
