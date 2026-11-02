// Gera o mapeamento da arte do CS Manager (cedida ao projeto) para o NOSSO
// catálogo do Ultimate e copia só os WebP usados para public/cards/csm/.
//
// Rode com: npx tsx scripts/gen-csm-art.mts --src <checkout do CSManagerSite>
//
// O checkout deles é lido como DADO: só o manifesto web/card-assets.js (JSON
// dentro de um módulo; extraído por texto, nunca importado/executado) e os
// arquivos de assets/cards/. Saída:
//   public/cards/csm/frames/<moldura>.webp
//   public/cards/csm/players/<nick-normalizado>.webp
//   public/cards/csm/teams/<time-normalizado>.webp
//   src/data/csm-art.json  { players: {playerId: foto}, teams: {teamId: logo} }
// Nomes estáveis (sem hash): regenerar não muda URL de quem já está mapeado.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { legendPlayers } from '../src/engine/ultimate/icons.ts';
import { CSM_FRAMES_USED } from '../src/data/csmArt.ts';

const argi = process.argv.indexOf('--src');
const SRC = argi > 0 ? process.argv[argi + 1] : process.env.CSM_SRC;
if (!SRC || !existsSync(join(SRC, 'web', 'card-assets.js'))) {
  console.error('uso: npx tsx scripts/gen-csm-art.mts --src <CSManagerSite>');
  process.exit(1);
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'public', 'cards', 'csm');

// manifesto: `export const cardAssets = {...};` — pega só o objeto JSON.
const raw = readFileSync(join(SRC, 'web', 'card-assets.js'), 'utf8');
const manifest = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as {
  backgrounds: Record<string, string>; photos: Record<string, string>; teams: Record<string, string>;
};
const fileOf = (url: string) => join(SRC, url.replace(/^\//, ''));

export const normNick = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TEAM_NOISE = /^(team|clan|esports|esport|gaming|club)|(team|clan|esports|esport|gaming|club)$/g;
const normTeam = (s: string) => {
  let k = normNick(s);
  for (let i = 0; i < 2; i++) k = k.replace(TEAM_NOISE, '');
  return k;
};

// fotos base (sem prefixo de edição `versao/nick`)
const photos = new Map<string, string>();
for (const [k, url] of Object.entries(manifest.photos)) {
  if (k.includes('/')) continue;
  const n = normNick(k);
  if (n && !photos.has(n)) photos.set(n, url);
}
const teams = new Map<string, string>();
for (const [k, url] of Object.entries(manifest.teams)) teams.set(normTeam(k), url);

// nossos jogadores (base 2026 + ícones históricos)
type P = { id: string; nick: string; teamId: string; teamName: string; country: string };
const ours: P[] = [];
for (const t of CS2_REAL_2026) for (const p of t.players) ours.push({ id: p.id, nick: p.nick, teamId: t.id, teamName: t.team, country: p.country });
for (const l of legendPlayers()) ours.push({ id: l.player.id, nick: l.player.nick, teamId: l.from?.id ?? '', teamName: l.from?.team ?? '', country: l.player.country });

const teamKeyOf = (name: string) => { const k = normTeam(name); return teams.has(k) ? k : null; };

// desempate: mesmo nick normalizado em mais de um jogador nosso → fica com a foto
// quem joga num time que o CS Manager também tem (o pacote deles é do cenário
// atual); empate persistente → ninguém leva (melhor sem foto que foto errada).
const byNick = new Map<string, P[]>();
for (const p of ours) {
  const n = normNick(p.nick);
  if (!photos.has(n)) continue;
  const list = byNick.get(n) ?? [];
  if (!list.some((x) => x.id === p.id)) list.push(p);
  byNick.set(n, list);
}
const playerOut: Record<string, string> = {};
const ambiguous: string[] = [];
for (const [n, list] of byNick) {
  // mesmo nick + mesmo país = mesma pessoa (ex.: carta 2026 e ícone histórico)
  if (new Set(list.map((p) => p.country.toLowerCase())).size === 1) { for (const p of list) playerOut[p.id] = n; continue; }
  const pick = list.filter((p) => teamKeyOf(p.teamName));
  if (pick.length !== 1) { ambiguous.push(`${n}: ${list.map((p) => `${p.id}@${p.teamName}/${p.country}`).join(', ')}`); continue; }
  playerOut[pick[0]!.id] = n;
}
const teamOut: Record<string, string> = {};
for (const t of CS2_REAL_2026) { const k = teamKeyOf(t.team) ?? teamKeyOf(t.tag); if (k) teamOut[t.id] = k; }

// copia só o necessário (limpa antes: nada órfão fica em public/)
rmSync(OUT, { recursive: true, force: true });
for (const d of ['frames', 'players', 'teams']) mkdirSync(join(OUT, d), { recursive: true });
for (const f of CSM_FRAMES_USED) {
  const url = f === 'tactical' ? '/assets/cards/backgrounds/tactical-v2.webp' : manifest.backgrounds[f];
  if (!url) throw new Error(`moldura ${f} não está no manifesto`);
  copyFileSync(fileOf(url), join(OUT, 'frames', `${f}.webp`));
}
for (const n of new Set(Object.values(playerOut))) copyFileSync(fileOf(photos.get(n)!), join(OUT, 'players', `${n}.webp`));
for (const k of new Set(Object.values(teamOut))) copyFileSync(fileOf(teams.get(k)!), join(OUT, 'teams', `${k}.webp`));

const sortObj = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(ROOT, 'src', 'data', 'csm-art.json'), JSON.stringify({ players: sortObj(playerOut), teams: sortObj(teamOut) }, null, 1) + '\n');

const base = CS2_REAL_2026.flatMap((t) => t.players);
const baseWith = base.filter((p) => playerOut[p.id]).length;
console.log(`fotos: ${Object.keys(playerOut).length}/${new Set(ours.map((p) => p.id)).size} jogadores (base 2026: ${baseWith}/${base.length}; ícones: ${legendPlayers().filter((l) => playerOut[l.player.id]).length}/${legendPlayers().length})`);
console.log(`logos: ${Object.keys(teamOut).length}/${CS2_REAL_2026.length} times; molduras: ${CSM_FRAMES_USED.length}`);
if (ambiguous.length) console.log(`sem foto por empate (${ambiguous.length}):\n  ${ambiguous.join('\n  ')}`);
