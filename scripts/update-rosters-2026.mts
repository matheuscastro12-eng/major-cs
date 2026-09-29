// Atualização de elencos — cena de fim de setembro de 2026 (fonte: bo3.gg).
//
// Entrada (offline, determinística):
//   - base ANTERIOR: src/data/bo3-2026.json no commit BASE_REF (a mesma que o
//     fetch usou para casar ids), para o script ser idempotente;
//   - src/data/player-stats-2026.json (retrato dos elencos do bo3.gg + estatística);
//   - src/data/player-attrs-2026.json (atributos → 5 números legados dos novatos).
// Saída:
//   - src/data/bo3-2026.json  (mesmos ids; elencos, técnicos, free agents,
//     aposentados em __retired__, times extintos com `defunct: true`, times novos
//     no fim da lista);
//   - docs/elencos-set-2026.md (relatório de mudanças para revisão humana).
//
// Regras de id (as mesmas de scripts/import-rosters-xlsx.py):
//   - time e jogador existentes NUNCA trocam de id; jogador novo = `bo3_<id do bo3>`,
//     time novo = `bo3_team_<id do bo3>`;
//   - ninguém é apagado: quem sai de um time vai para outro time, para `__free__`
//     (sem time) ou para `__retired__` (inativo/aposentado/virou técnico);
//   - cada id aparece UMA vez no arquivo;
//   - a ordem dos times existentes não muda (saves e testes usam índice/`dataset[0]`).

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { legacyFromAttrs, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import { hashStr } from '../src/state/hash.ts';
import { loadBase, BASE_REF } from './fetch-bo3-stats.mts';
import type { Role } from './lib/roles.mts';

const STATS = 'src/data/player-stats-2026.json';
const ATTRS = 'src/data/player-attrs-2026.json';
const OUT = 'src/data/bo3-2026.json';
const REPORT = 'docs/elencos-set-2026.md';
export const FREE = '__free__';
export const RETIRED = '__retired__';

interface Player { id: string; nick: string; name: string; country: string; role: Role; role2?: Role; age?: number; aim: number; clutch: number; consistency: number; awp: number; igl: number }
interface Coach { nick: string; name: string; country: string; rating: number; style: 'tactical' | 'aggressive' | 'discipline' }
interface Team { id: string; team: string; tag: string; era: string; game: string; country: string; teamwork: number; honors: string; colors: [string, string]; mapPrefs: Record<string, number>; coach: Coach; logoUrl?: string; defunct?: boolean; players: Player[]; [k: string]: unknown }
interface SP {
  bo3: number | null; slug?: string; nick: string; name: string; country: string | null; age: number | null; status?: 'active' | 'benched' | 'inactive';
  team?: number | null; joined?: string | null; coach?: boolean; role: Role; roleSrc: string; roleWhy?: string; s?: { games: number } | null;
  tr?: { action_date: string; action_type: number; team_from_name: string | null; team_to_name: string | null; team_to_id: number | null; is_coach: boolean }[];
  unresolved?: string;
}
interface ST { bo3: number; slug: string; name: string; tag: string | null; rank: number | null; country: string | null; logo?: string | null; inBase: boolean; active: string[]; benched: string[]; coaches: { bo3: number; nick: string; name: string; country: string | null; since: string | null }[] }
interface Stats { meta: { collectedAt: string | null; window: { to: string }; teamResolve: Record<string, { bo3: number | null; how: string }>; playerResolve: Record<string, { bo3: number | null; how: string }> }; teams: Record<string, ST>; players: Record<string, SP> }

const COACH_STYLES = ['tactical', 'aggressive', 'discipline'] as const;
const PALETTE: [string, string][] = [
  ['#1f2a44', '#f2b632'], ['#3a1f44', '#e05263'], ['#0f3d3e', '#7ee081'], ['#442a1f', '#f2994a'], ['#1f4436', '#9ae5c9'],
  ['#2c1f44', '#8f7ef2'], ['#44341f', '#e0c47a'], ['#1f3844', '#7ac8e0'], ['#441f2c', '#f27ea9'], ['#26441f', '#b6e07a'],
];
const TRANSFER_TYPE: Record<number, string> = { 1: 'transferência', 2: 'stand-in', 3: 'inativo/saída', 4: 'banco', 5: 'técnico' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ajuste linear y ≈ a + b·x (para levar atributos à escala curada dos 5 legados)
function fit(xs: number[], ys: number[]) {
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 1;
  return { a: my - b * mx, b };
}

export function updateRosters(base: Team[], stats: Stats, attrs: Record<string, PlayerAttrs>) {
  const P = stats.players;
  const byBo3Team = new Map<number, ST>(Object.values(stats.teams).map((t) => [t.bo3, t]));
  const baseIds = new Set(base.flatMap((t) => t.players.map((p) => p.id)));
  const basePlayer = new Map(base.flatMap((t) => t.players.map((p) => [p.id, { p, team: t }] as const)));
  const teamOfBo3 = new Map<number, string>(); // id bo3 do time → id do jogo
  for (const [gid, r] of Object.entries(stats.meta.teamResolve)) if (r.bo3 != null) teamOfBo3.set(r.bo3, gid);
  const newTeamIds = Object.values(stats.teams).filter((t) => !t.inBase && !teamOfBo3.has(t.bo3)).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.bo3 - b.bo3);
  for (const t of newTeamIds) teamOfBo3.set(t.bo3, `bo3_team_${t.bo3}`);

  // 5 legados dos jogadores NOVOS: atributos → escala curada da base
  const pairs = [...basePlayer.values()].filter(({ p }) => attrs[p.id] && P[p.id]?.s);
  const keys = ['aim', 'clutch', 'consistency', 'awp', 'igl'] as const;
  const fits = Object.fromEntries(keys.map((k) => [k, fit(pairs.map(({ p }) => legacyFromAttrs(attrs[p.id])[k]), pairs.map(({ p }) => p[k]))]));
  const legacyOf = (id: string) => {
    const l = legacyFromAttrs(attrs[id]);
    return Object.fromEntries(keys.map((k) => [k, clamp(Math.round(fits[k].a + fits[k].b * l[k]), 30, 97)])) as Record<(typeof keys)[number], number>;
  };

  // ── destino de cada jogador ──
  type Dest = { team: string; bench: boolean; why: string };
  const dest = new Map<string, Dest>();
  const doubts: string[] = [];
  const retiredWhy = new Map<string, string>();
  const universe = new Set<string>([...baseIds, ...Object.keys(P).filter((id) => !P[id].coach)]);
  for (const id of [...universe].sort()) {
    const sp = P[id];
    const bp = basePlayer.get(id);
    if (!sp || sp.bo3 == null) continue; // sem casamento no bo3: decidido depois dos demais
    const tgt = sp.team != null ? teamOfBo3.get(sp.team) : undefined;
    if (sp.coach) { dest.set(id, { team: RETIRED, bench: false, why: 'virou técnico' }); retiredWhy.set(id, 'virou técnico'); continue; }
    if (tgt && sp.status === 'active') { dest.set(id, { team: tgt, bench: false, why: 'ativo' }); continue; }
    if (tgt && sp.status === 'benched') { dest.set(id, { team: tgt, bench: true, why: 'banco' }); continue; }
    if (tgt && sp.status === 'inactive') { dest.set(id, { team: tgt, bench: true, why: 'inativo no time' }); doubts.push(`${sp.nick}: inativo mas ainda vinculado a ${stats.teams[String(sp.team)]?.name}; ficou no banco`); continue; }
    if (sp.team == null && sp.status !== 'inactive') { dest.set(id, { team: FREE, bench: false, why: 'sem time' }); continue; }
    if (sp.team == null && sp.status === 'inactive') { dest.set(id, { team: RETIRED, bench: false, why: 'inativo/aposentado' }); retiredWhy.set(id, 'inativo/aposentado'); continue; }
    // vinculado a um time fora da base e da expansão (menos de 5 ativos no bo3)
    if (bp) {
      dest.set(id, { team: FREE, bench: false, why: 'time fora da base' });
      doubts.push(`${sp.nick}: está no bo3 em um time fora da base (id ${sp.team}); ficou em free agents até decisão`);
    }
  }

  // time da base com menos de 3 jogadores reais vinculados no bo3 = elenco desfeito:
  // vira extinto e quem sobrou vai para free agents (listado como caso duvidoso)
  const MIN_REAL = 3;
  const extinct = new Set<string>();
  for (const t of base) {
    if (t.id === FREE) continue;
    const real = [...dest.entries()].filter(([, d]) => d.team === t.id);
    if (real.length >= MIN_REAL) continue;
    extinct.add(t.id);
    for (const [id] of real) {
      dest.set(id, { team: FREE, bench: false, why: 'time desfeito' });
      doubts.push(`${P[id].nick}: ainda vinculado a ${t.team} no bo3, mas o time só tem ${real.length} jogador(es) real(is) — time tratado como extinto e ele foi para free agents`);
    }
  }

  // sem casamento no bo3 (fictício "regen" ou não achado): fica no time antigo
  // só se ele não tiver 5 titulares reais; senão vai para free agents
  for (const id of [...baseIds].sort()) {
    if (dest.has(id)) continue;
    const { p, team } = basePlayer.get(id)!;
    const why = P[id]?.unresolved ?? 'sem dado no bo3';
    const starters = [...dest.values()].filter((d) => d.team === team.id && !d.bench).length;
    if (team.id === FREE || (!extinct.has(team.id) && starters < 5)) { dest.set(id, { team: team.id, bench: false, why }); continue; }
    if (extinct.has(team.id)) { dest.set(id, { team: FREE, bench: false, why: `${why}; time desfeito` }); continue; }
    dest.set(id, { team: FREE, bench: false, why: `${why}; time já tem 5 titulares` });
    doubts.push(`${p.nick} (${team.team}): ${why} — sem dado no bo3 e o time já tem 5 titulares; foi para free agents`);
  }

  // ── monta os times ──
  const collectedAt = stats.meta.collectedAt?.slice(0, 10) ?? stats.meta.window.to;
  const teamsOut: Team[] = [];
  const lines: string[] = [];
  const changes: { team: string; out: string[]; in: string[]; coach?: string }[] = [];
  const defunct: string[] = [];
  const rows = (tid: string) => [...dest.entries()].filter(([, d]) => d.team === tid);
  const gamesOf = (id: string) => P[id]?.s?.games ?? 0;
  const describe = (id: string) => {
    const sp = P[id]; const bp = basePlayer.get(id)?.p;
    const nick = bp?.nick ?? sp?.nick ?? id;
    const tr = sp?.tr?.[0];
    const fmt = (x: NonNullable<typeof tr>) => `${x.action_date} (${TRANSFER_TYPE[x.action_type] ?? x.action_type}${x.team_from_name ? `, de ${x.team_from_name}` : ''}${x.team_to_name ? ` → ${x.team_to_name}` : ''})`;
    // no time atual: vale a movimentação que levou a ele, ou o joined_team_at do cadastro
    const when = sp?.team != null
      ? (tr && tr.team_to_id === sp.team ? fmt(tr) : sp.joined ? `no time atual desde ${sp.joined} (joined_team_at)` : tr ? fmt(tr) : 'sem data na API')
      : tr ? fmt(tr) : 'sem data na API';
    return { nick, when, tr };
  };
  // nick único no arquivo (o Ultimate deduplica cartas por nick): novato homônimo
  // de alguém que já estava na base ganha o país no nick
  const baseNicks = new Set([...basePlayer.values()].map(({ p }) => p.nick.toLowerCase()));
  const newPlayer = (id: string): Player => {
    const sp = P[id];
    const l = legacyOf(id);
    let nick = sp.nick;
    if (baseNicks.has(nick.toLowerCase())) {
      nick = `${sp.nick} (${(sp.country ?? '??').toUpperCase()})`;
      doubts.push(`${sp.nick} (${id}): homônimo de um jogador que já estava na base; no jogo virou "${nick}"`);
    }
    const out: Player = { id, nick, name: sp.name, country: sp.country ?? '', role: sp.role, aim: l.aim, clutch: l.clutch, consistency: l.consistency, awp: l.awp, igl: l.igl };
    if (sp.age != null) out.age = sp.age;
    return out;
  };
  const playerObj = (id: string, teamCountry: string): Player => {
    const bp = basePlayer.get(id)?.p;
    if (bp) return bp;
    const p = newPlayer(id);
    if (!p.country) p.country = teamCountry;
    return p;
  };
  const orderIn = (old: Player[], ids: string[]) => {
    const oldIdx = new Map(old.map((p, i) => [p.id, i]));
    return [...ids].sort((a, b) => (oldIdx.has(a) ? 0 : 1) - (oldIdx.has(b) ? 0 : 1) || (oldIdx.get(a) ?? 0) - (oldIdx.get(b) ?? 0) || gamesOf(b) - gamesOf(a) || a.localeCompare(b));
  };
  const coachFor = (t: Team | null, st: ST | undefined, teamwork: number, tag: string): { coach: Coach; changed: boolean } => {
    const c = st?.coaches[0];
    if (!c) return { coach: t?.coach ?? { nick: 'coach', name: 'coach', country: st?.country ?? '', rating: 60, style: 'tactical' }, changed: false };
    if (t && t.coach.nick.toLowerCase() === c.nick.toLowerCase()) return { coach: t.coach, changed: false };
    const seed = hashStr(`coach:${c.nick}:${tag}`);
    return { coach: { nick: c.nick, name: c.name, country: c.country ?? st?.country ?? '', rating: clamp(teamwork - 2 + (seed % 7), 55, 90), style: COACH_STYLES[seed % 3] }, changed: true };
  };

  for (const t of base) {
    if (t.id === FREE) continue;
    const bo3 = stats.meta.teamResolve[t.id]?.bo3 ?? null;
    const st = bo3 != null ? byBo3Team.get(bo3) : undefined;
    const mine = rows(t.id);
    const starters = orderIn(t.players, mine.filter(([, d]) => !d.bench).map(([id]) => id));
    const bench = orderIn(t.players, mine.filter(([, d]) => d.bench).map(([id]) => id));
    const players = [...starters, ...bench].map((id) => playerObj(id, t.country));
    const oldIds = new Set(t.players.map((p) => p.id));
    const outIds = t.players.map((p) => p.id).filter((id) => !players.some((p) => p.id === id));
    const inIds = players.map((p) => p.id).filter((id) => !oldIds.has(id));
    const { coach, changed } = coachFor(t, st, t.teamwork, t.tag);
    const isDefunct = players.length === 0;
    const nt: Team = { ...t, coach, players };
    if (isDefunct) { nt.defunct = true; defunct.push(`${t.team} (${t.id})`); }
    if (!isDefunct && players.length < 5) doubts.push(`${t.team}: só ${players.length} jogador(es) no bo3 (${players.map((p) => p.nick).join(', ')}); o jogo completa com jovens da base`);
    if (bench.length) doubts.push(`${t.team}: banco segundo o bo3 → ${bench.map((id) => describe(id).nick).join(', ')} (listado depois dos titulares)`);
    if (starters.length > 5) doubts.push(`${t.team}: ${starters.length} ativos no bo3 (${starters.map((id) => describe(id).nick).join(', ')}); os 5 primeiros jogam`);
    if (!st) doubts.push(`${t.team}: time não encontrado no bo3 (${stats.meta.teamResolve[t.id]?.how ?? '—'}); elenco mantido só com quem não foi achado em outro lugar`);
    teamsOut.push(nt);
    if (outIds.length || inIds.length || changed) changes.push({ team: t.team, out: outIds, in: inIds, coach: changed ? `${t.coach.nick} → ${coach.nick}${st?.coaches[0]?.since ? ` (desde ${st.coaches[0].since})` : ''}` : undefined });
  }
  // times novos (expansão + destino de jogadores da base), por ranking do bo3
  const newTeams: string[] = [];
  const teamworkOf = (rank: number | null) => clamp(Math.round(92 - 11 * Math.log(Math.max(1, rank ?? 250)) / Math.log(4)), 55, 90);
  for (const st of newTeamIds) {
    const id = `bo3_team_${st.bo3}`;
    const mine = rows(id);
    const starters = orderIn([], mine.filter(([, d]) => !d.bench).map(([pid]) => pid));
    const bench = orderIn([], mine.filter(([, d]) => d.bench).map(([pid]) => pid));
    if (starters.length + bench.length === 0) continue;
    const country = st.country ?? '';
    const tag = (st.tag || st.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)).toUpperCase();
    const tw = teamworkOf(st.rank);
    const players = [...starters, ...bench].map((pid) => playerObj(pid, country));
    const t: Team = {
      id, team: st.name, tag, era: '2026', game: 'CS2', country, teamwork: tw,
      honors: st.rank ? `#${st.rank} no ranking do bo3.gg` : '', colors: PALETTE[hashStr(`team:${st.bo3}`) % PALETTE.length],
      mapPrefs: {}, coach: coachFor(null, st, tw, tag).coach, players,
    };
    if (st.logo) t.logoUrl = st.logo;
    teamsOut.push(t);
    newTeams.push(`${st.name} (${id}, #${st.rank ?? '—'}) — ${players.map((p) => p.nick).join(', ')}`);
    if (bench.length) doubts.push(`${st.name} (novo): banco segundo o bo3 → ${bench.map((pid) => describe(pid).nick).join(', ')}`);
  }
  // free agents e aposentados
  const oldFree = base.find((t) => t.id === FREE)!;
  const freeIds = orderIn(oldFree.players, rows(FREE).map(([id]) => id));
  const free: Team = { ...oldFree, players: freeIds.map((id) => playerObj(id, '')) };
  // o __free__ fica NA MESMA POSIÇÃO de antes (ordem estável)
  const freePos = base.findIndex((t) => t.id === FREE);
  teamsOut.splice(freePos, 0, free);
  const retIds = rows(RETIRED).map(([id]) => id).filter((id) => baseIds.has(id)).sort();
  const retired: Team = {
    id: RETIRED, team: 'Aposentados e inativos', tag: 'RET', era: '2026', game: 'CS2', country: '', teamwork: 50, honors: '',
    colors: ['#333333', '#888888'], mapPrefs: {}, coach: { nick: '—', name: '—', country: '', rating: 50, style: 'tactical' },
    defunct: true, players: retIds.map((id) => basePlayer.get(id)!.p),
  };
  teamsOut.push(retired);

  // ── checagens duras ──
  const seen = new Map<string, string>();
  for (const t of teamsOut) for (const p of t.players) {
    if (seen.has(p.id)) throw new Error(`id duplicado ${p.id} em ${seen.get(p.id)} e ${t.id}`);
    seen.set(p.id, t.id);
  }
  for (const id of baseIds) if (!seen.has(id)) throw new Error(`id da base sumiu: ${id}`);
  for (let i = 0; i < base.length; i++) if (teamsOut[i].id !== base[i].id) throw new Error(`ordem dos times mudou em ${i}: ${base[i].id} → ${teamsOut[i].id}`);

  // ── relatório ──
  const moved = [...dest.entries()].filter(([id, d]) => {
    const bp = basePlayer.get(id);
    return bp && bp.team.id !== d.team;
  });
  const freeNow = free.players.filter((p) => !oldFree.players.some((o) => o.id === p.id));
  lines.push(`# Elencos — atualização de setembro de 2026`, '');
  lines.push(`Fonte: API pública do bo3.gg (players, teams, player_transfers). Coleta: **${stats.meta.collectedAt ?? collectedAt}** (UTC). Base anterior: \`src/data/bo3-2026.json\` no commit \`${BASE_REF}\`.`);
  lines.push('Gerado por `scripts/update-rosters-2026.mts` (não edite à mão; rode de novo). Datas entre parênteses são as que a API registra (última movimentação do jogador em `player_transfers`, ou `joined_team_at`).', '');
  const totalPlayers = teamsOut.reduce((s, t) => s + (t.id === RETIRED ? 0 : t.players.length), 0);
  lines.push('## Resumo', '');
  lines.push(`- Times: **${teamsOut.filter((t) => !t.defunct && t.id !== FREE).length}** disputáveis (${base.length - 1 - defunct.length} da base anterior, ${newTeams.length} novos), ${defunct.length} extintos (mantidos com \`defunct: true\`), mais os virtuais \`${FREE}\` e \`${RETIRED}\`.`);
  lines.push(`- Jogadores em times ou free agents: **${totalPlayers}**; free agents: **${free.players.length}**; aposentados/inativos fora dos times: **${retired.players.length}**.`);
  lines.push(`- Transferências detectadas (jogador da base que mudou de time, virou free agent ou saiu de cena): **${moved.length}**.`);
  lines.push(`- Jogadores novos na base: **${[...seen.keys()].filter((id) => !baseIds.has(id)).length}** (id \`bo3_<id do bo3>\`).`, '');
  lines.push('## Mudanças por time', '');
  for (const c of changes) {
    lines.push(`### ${c.team}`);
    if (c.coach) lines.push(`- Técnico: ${c.coach}`);
    for (const id of c.out) { const d = describe(id); const to = dest.get(id)!; const where = to.team === FREE ? 'free agent' : to.team === RETIRED ? retiredWhy.get(id) ?? 'fora de cena' : teamsOut.find((t) => t.id === to.team)?.team ?? to.team; lines.push(`- Saiu: **${d.nick}** → ${where}${to.bench ? ' (banco)' : ''} — ${d.when}`); }
    for (const id of c.in) { const d = describe(id); const from = basePlayer.get(id)?.team; lines.push(`- Entrou: **${d.nick}**${from ? ` (vinha de ${from.id === FREE ? 'free agents' : from.team})` : ' (novo na base)'}${dest.get(id)?.bench ? ' (banco)' : ''} — ${d.when}${!basePlayer.has(id) && P[id]?.roleSrc === 'inferido' ? ` — função **${P[id].role} inferida** (${P[id].roleWhy})` : ''}`); }
    lines.push('');
  }
  lines.push('## Times novos', '');
  for (const n of newTeams) lines.push(`- ${n}`);
  lines.push('', '## Times extintos (não disputáveis, id preservado)', '');
  for (const d of defunct) lines.push(`- ${d}`);
  if (!defunct.length) lines.push('- nenhum');
  lines.push('', '## Jogadores sem time (novos free agents)', '');
  for (const p of freeNow) { const d = describe(p.id); lines.push(`- **${p.nick}** (${basePlayer.get(p.id)?.team.team ?? '—'}) — ${d.when}`); }
  lines.push('', '## Aposentados, inativos ou que viraram técnico (fora dos times)', '');
  for (const p of retired.players) { const d = describe(p.id); lines.push(`- **${p.nick}** (${basePlayer.get(p.id)?.team.team ?? '—'}): ${retiredWhy.get(p.id)} — ${d.when}`); }
  lines.push('', '## Casos duvidosos (decisão humana)', '');
  const standins = [...dest.keys()].filter((id) => P[id]?.tr?.[0]?.action_type === 2);
  for (const id of standins) { const d = describe(id); doubts.push(`${d.nick}: última movimentação é stand-in — ${d.when}`); }
  for (const d of [...new Set(doubts)].sort()) lines.push(`- ${d}`);
  lines.push('', '## Funções inferidas (jogadores novos sem função na API)', '');
  const inferred = [...seen.keys()].filter((id) => !baseIds.has(id) && P[id]?.roleSrc === 'inferido').sort();
  lines.push(`${inferred.length} jogadores; regra em \`scripts/lib/roles.mts\` (papéis por round do bo3.gg). O bo3.gg não publica IGL: nenhum novato é IGL por inferência.`, '');
  for (const id of inferred) lines.push(`- ${P[id].nick}: ${P[id].role} (${P[id].roleWhy})`);
  lines.push('');
  return { teams: teamsOut, report: lines.join('\n'), summary: { teams: teamsOut.length, playable: teamsOut.filter((t) => !t.defunct && t.id !== FREE).length, players: totalPlayers, free: free.players.length, retired: retired.players.length, moved: moved.length, newTeams: newTeams.length, defunct: defunct.length } };
}

function main() {
  const base = loadBase() as unknown as Team[];
  const stats = JSON.parse(readFileSync(STATS, 'utf8')) as Stats;
  const attrs = JSON.parse(readFileSync(ATTRS, 'utf8')) as Record<string, PlayerAttrs>;
  const { teams, report, summary } = updateRosters(base, stats, attrs);
  writeFileSync(OUT, JSON.stringify(teams, null, 1) + '\n');
  writeFileSync(REPORT, report);
  console.log('[elencos]', JSON.stringify(summary));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
