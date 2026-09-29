// Base da cena 2026 (frente A do realismo FM): formato, estabilidade de ids,
// reprodutibilidade do mapeamento estatística → atributos e sanidade contra
// jogadores conhecidos. Não usa rede nem git: só os JSONs versionados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attrsOf, withAttrs, legacyFromAttrs, ovrFromLegacy, HIDDEN_KEYS, ALL_ATTRS, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { gameScale } from '../src/data/playerAttrs.ts';
import { buildAllAttrs, loadLegacy, type StatsFile } from './stats-to-attrs.mts';
import type { TeamSeason, Player } from '../src/types.ts';

const dataset = JSON.parse(readFileSync('src/data/bo3-2026.json', 'utf8')) as TeamSeason[];
const attrs = JSON.parse(readFileSync('src/data/player-attrs-2026.json', 'utf8')) as Record<string, PlayerAttrs & { src: string }>;
const stats = JSON.parse(readFileSync('src/data/player-stats-2026.json', 'utf8')) as StatsFile & {
  meta: { playerResolve: Record<string, unknown>; teamResolve: Record<string, unknown> };
  players: Record<string, { s: { fkpr: number; rounds: number } | null; role: string }>;
};
const calib = JSON.parse(readFileSync('docs/calibration-targets.json', 'utf8')) as { targets: Record<string, { source?: string; estimate?: boolean }> };
const all: { p: Player; t: TeamSeason }[] = dataset.flatMap((t) => t.players.map((p) => ({ p, t })));
const byId = new Map(all.map((x) => [x.p.id, x]));
const nick = (n: string) => all.find((x) => x.p.nick.toLowerCase() === n.toLowerCase())!;

test('todo jogador da base tem PlayerAttrs válido (28 atributos 1–20, 8 ocultos, CA ≤ PA ≤ 200)', () => {
  for (const { p } of all) {
    const x = attrs[p.id];
    assert.ok(x, `sem atributos: ${p.id} ${p.nick}`);
    assert.equal(x.v, 1);
    assert.equal(Object.keys(x.a).length, ALL_ATTRS.length);
    for (const k of ALL_ATTRS) assert.ok(Number.isInteger(x.a[k]) && x.a[k] >= 1 && x.a[k] <= 20, `${p.nick}.${k}=${x.a[k]}`);
    for (const k of HIDDEN_KEYS) assert.ok(Number.isInteger(x.h[k]) && x.h[k] >= 1 && x.h[k] <= 20, `${p.nick}.h.${k}=${x.h[k]}`);
    assert.ok(Number.isInteger(x.ca) && x.ca >= 1 && x.ca <= x.pa && x.pa <= 200, `${p.nick} ca=${x.ca} pa=${x.pa}`);
    assert.equal(typeof x.src, 'string');
    // attrsOf devolve os atributos gravados quando o jogador os carrega (pelo
    // contrato: withAttrs grava os atributos E os 5 números que saem deles)
    assert.deepEqual(attrsOf(withAttrs(p, x)), x);
  }
});

test('base expandida: 1.000+ jogadores ativos com time, função, país', () => {
  const active = all.filter(({ t }) => !t.defunct);
  assert.ok(active.length >= 1000, `só ${active.length}`);
  const inTeams = active.filter(({ t }) => t.id !== '__free__');
  for (const { p } of active) assert.ok(p.role && typeof p.country === 'string', p.id);
  assert.ok(inTeams.length >= 950, `jogadores em times: ${inTeams.length}`);
});

test('ids estáveis: todo id da base anterior continua, uma vez só; ids novos seguem o padrão bo3', () => {
  const ids = all.map((x) => x.p.id);
  assert.equal(new Set(ids).size, ids.length, 'id duplicado no bo3-2026.json');
  const prev = Object.keys(stats.meta.playerResolve);
  assert.ok(prev.length >= 700);
  for (const id of prev) assert.ok(byId.has(id), `id da base sumiu: ${id}`);
  const prevSet = new Set(prev);
  for (const id of ids) if (!prevSet.has(id)) assert.match(id, /^bo3_\d+$/, `id novo fora do padrão: ${id}`);
  const prevTeams = Object.keys(stats.meta.teamResolve);
  const teamIds = dataset.map((t) => t.id);
  for (const id of prevTeams) assert.ok(teamIds.includes(id), `time sumiu: ${id}`);
  for (const id of teamIds) if (!prevTeams.includes(id) && !id.startsWith('__')) assert.match(id, /^bo3_team_\d+$/);
  assert.equal(dataset[0].team, 'Vitality', 'dataset[0] alimenta as cartas Major do Ultimate');
  // times virtuais
  assert.ok(dataset.some((t) => t.id === '__free__'));
  const ret = dataset.find((t) => t.id === '__retired__');
  assert.ok(ret && ret.defunct, '__retired__ precisa ser defunct');
  for (const t of dataset) if (!t.defunct && t.id !== '__free__') assert.ok(t.players.length >= 1, `${t.team} vazio e não extinto`);
});

test('mapeamento estatística → atributos é determinístico e reproduz o arquivo versionado', () => {
  const again = buildAllAttrs(stats, loadLegacy(dataset as never, stats));
  assert.deepEqual(again, attrs);
});

test('jogadores conhecidos: ZywOo AWP de elite, IGL veterano com liderança alta e mira mediana, entry com abertura alta', () => {
  const zy = attrs[nick('ZywOo').p.id];
  assert.ok(zy.a.awp >= 18, `ZywOo awp ${zy.a.awp}`);
  assert.ok(zy.ca >= 165, `ZywOo CA ${zy.ca}`);
  const apex = attrs[nick('apEX').p.id];
  assert.ok(apex.a.leadership >= 17, `apEX liderança ${apex.a.leadership}`);
  assert.ok(apex.a.aim >= 8 && apex.a.aim <= 13, `apEX mira ${apex.a.aim}`);
  // entry: entre os Entry da base com amostra, quem mais abre round tem reflexos/mira em movimento altos
  const entries = all.filter(({ p }) => p.role === 'Entry' && stats.players[p.id]?.s && stats.players[p.id].s!.rounds >= 500);
  const top = entries.sort((a, b) => stats.players[b.p.id].s!.fkpr - stats.players[a.p.id].s!.fkpr)[0];
  const e = attrs[top.p.id];
  assert.ok(e.a.aimMovement >= 15 && e.a.reflexes >= 15, `${top.p.nick} aimMovement=${e.a.aimMovement} reflexes=${e.a.reflexes}`);
  // IGL não vira mira de elite nem AWP de elite por acaso
  const igls = all.filter(({ p }) => p.role === 'IGL' && attrs[p.id]);
  const avgLead = igls.reduce((s, { p }) => s + attrs[p.id].a.leadership, 0) / igls.length;
  const nonIgl = all.filter(({ p }) => p.role !== 'IGL' && p.role2 !== 'IGL' && attrs[p.id]);
  const avgLeadNon = nonIgl.reduce((s, { p }) => s + attrs[p.id].a.leadership, 0) / nonIgl.length;
  assert.ok(avgLead - avgLeadNon >= 5, `liderança IGL ${avgLead.toFixed(1)} vs resto ${avgLeadNon.toFixed(1)}`);
});

test('alvos de calibração trazem a fonte (ou estão marcados como estimativa)', () => {
  const ts = Object.entries(calib.targets);
  assert.ok(ts.length >= 8);
  for (const [k, t] of ts) assert.ok(t.source || t.estimate, `alvo sem fonte: ${k}`);
});

// [junção A × B] os atributos da frente A são da escala da CENA (tier 1–3); o
// carregador leva à escala do jogo pela regressão curado × atributos crus.
test('escala do jogo: a base real mantém o OVR médio da cena e os craques no topo', () => {
  assert.ok(gameScale() && gameScale()!.n >= 1000, 'régua ajustada na base real');
  const mat = CS2_REAL_2026.flatMap((t) => t.players);
  const ovrJson = all.reduce((s, { p }) => s + ovrFromLegacy(p), 0) / all.length;
  const ovrReal = mat.reduce((s, p) => s + ovrFromLegacy(legacyFromAttrs(attrsOf(p))), 0) / mat.length;
  assert.ok(Math.abs(ovrReal - ovrJson) < 1, `OVR médio ${ovrReal.toFixed(1)} × curado ${ovrJson.toFixed(1)}`);
  const ovrOf = (n: string) => ovrFromLegacy(legacyFromAttrs(attrsOf(mat.find((p) => p.nick === n)!)));
  const sorted = mat.map((p) => ovrFromLegacy(legacyFromAttrs(attrsOf(p)))).sort((a, b) => b - a);
  for (const star of ['ZywOo', 'donk', 'm0NESY']) assert.ok(ovrOf(star) >= sorted[15], `${star} fora do top 16 (${ovrOf(star)})`);
});
