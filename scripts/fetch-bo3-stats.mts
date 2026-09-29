// Pipeline de dados do realismo FM (fase 1, frente A) — COLETA.
//
// Busca na API pública do bo3.gg (nunca HLTV) tudo o que a base precisa e grava:
//   - src/data/player-stats-2026.json  estatística bruta resumida por jogador
//     (chave = id do jogo, preservando os ids da base) + retrato dos elencos
//     (time atual, status ativo/banco/inativo, técnico, data de entrada);
//   - docs/calibration-targets.json    alvos de calibração do motor, cada um
//     com a fonte (amostra de jogos tier S da janela) ou marcado como estimativa.
//
// Reprodutível: toda requisição passa pelo cache em disco de lib/bo3-client
// (BO3_CACHE_DIR). Com o cache quente, rodar de novo dá o mesmo arquivo.
// A base de ids vem do commit BASE_REF (a base de elencos ANTES da atualização
// de setembro/2026), para o pipeline ser idempotente mesmo depois de reescrever
// src/data/bo3-2026.json.
//
// Uso:
//   BO3_CACHE_DIR=/caminho/cache npx tsx scripts/fetch-bo3-stats.mts
// Depois: scripts/stats-to-attrs.mts e scripts/update-rosters-2026.mts.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { get, getAll, url, stats as netStats, fetchedAt } from './lib/bo3-client.mts';
import { roleShares, inferRole, inferRoleFromStats, type RoleRow, type RoleShares, type Role } from './lib/roles.mts';

export const WINDOW = { from: '2026-03-28', to: '2026-09-28' };   // 6 meses: estatística principal
export const WINDOW12 = { from: '2025-09-28', to: '2026-09-28' }; // 12 meses: fallback de amostra pequena
export const BASE_REF = process.env.BASE_REF ?? 'a46d0cc';        // motor/base: elencos antes da atualização
const TARGET_PLAYERS = 1100;   // meta da base (1.000+ com folga)
const MAX_SAMPLE_GAMES = 700;  // mapas tier S da amostra de calibração
const OUT_STATS = 'src/data/player-stats-2026.json';
// nome da base → nome no bo3.gg (erros de digitação/abreviação da planilha antiga)
const TEAM_ALIAS: Record<string, string> = { 'SAW Youngters': 'SAW Youngsters', 'Red Canids AC': 'RED Canids Academy' };
const OUT_CALIB = 'docs/calibration-targets.json';

// ─── tipos mínimos das respostas ─────────────────────────────────────────────
interface Country { code: string }
interface TeamRef { id: number; slug: string; name: string; rank: number | null; country_id?: number }
interface ApiPlayer {
  id: number; slug: string; nickname: string; first_name?: string | null; last_name?: string | null;
  birthday: string | null; status: number; team_id: number | null; is_coach?: boolean; coach_status?: number | null;
  joined_team_at?: string | null; total_prize?: number | null; role?: string | null; six_month_avg_rating?: number | null;
  country?: Country | null; team?: TeamRef | null;
}
interface SLRow {
  player_id: number; games_count: number; rounds_count: number; rounds_win: number; avg_player_rating: number;
  avg_kills: number; avg_death: number; avg_assists: number; avg_damage: number;
  avg_first_kills: number; avg_first_death: number; avg_trade_kills: number; avg_trade_death: number;
  avg_shots_accuracy: number; avg_headshots_accuracy: number; avg_headshot_kills_accuracy: number;
  avg_flash_assists: number; avg_molotov_damage: number; avg_he_damage: number; avg_multikills: number;
  clutches_vs_1: number; clutches_vs_2: number; clutches_vs_3: number; clutches_vs_4: number; clutches_vs_5: number;
  player: ApiPlayer;
}
interface ApiTeam { id: number; slug: string; name: string; rank: number | null; acronym: string | null; country?: Country | null; discipline_id?: number; image_url?: string | null }
interface BasePlayer { id: string; nick: string; name: string; country: string; role: Role; role2?: Role; age?: number }
interface BaseTeam { id: string; team: string; tag: string; players: BasePlayer[] }

// ─── util ────────────────────────────────────────────────────────────────────
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
function ageAt(born: string | null | undefined, at = WINDOW.to): number | null {
  if (!born) return null;
  const b = new Date(born + 'T00:00:00Z'), d = new Date(at + 'T00:00:00Z');
  let a = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
  return a > 10 && a < 60 ? a : null;
}
const STATUS = ['inactive', 'active', 'benched'] as const;

export function loadBase(): BaseTeam[] {
  try {
    return JSON.parse(execSync(`git show ${BASE_REF}:src/data/bo3-2026.json`, { encoding: 'utf8', maxBuffer: 64 << 20 }));
  } catch {
    console.warn(`[fetch] git show ${BASE_REF} falhou; usando src/data/bo3-2026.json do disco`);
    return JSON.parse(readFileSync('src/data/bo3-2026.json', 'utf8'));
  }
}

async function statsList(w: { from: string; to: string }, minGames: number, extra: Record<string, string> = {}): Promise<SLRow[]> {
  const rows = await getAll<SLRow>('/players/stats_list', {
    'filter[game_begin_at][gt]': w.from, 'filter[game_begin_at][lt]': w.to,
    min_games_count: minGames, sort: '-avg_player_rating', ...extra,
  });
  // algumas linhas vêm sem o cadastro do jogador (conta apagada): ficam de fora
  return rows.filter((r) => r.player && r.player.id === r.player_id);
}

async function playersBy(filter: 'id' | 'team_id', ids: number[]): Promise<ApiPlayer[]> {
  const out: ApiPlayer[] = [];
  for (const c of chunk([...new Set(ids)].sort((a, b) => a - b), 40)) {
    out.push(...await getAll<ApiPlayer>('/players', { [`filter[${filter}][in]`]: c.join(','), with: 'country,team' }, 100));
  }
  return out;
}

async function teamsBy(ids: number[]): Promise<ApiTeam[]> {
  const out: ApiTeam[] = [];
  for (const c of chunk([...new Set(ids)].sort((a, b) => a - b), 40)) {
    out.push(...await getAll<ApiTeam>('/teams', { 'filter[teams.id][in]': c.join(','), with: 'country' }, 100));
  }
  return out;
}

// ─── principal ──────────────────────────────────────────────────────────────
async function main() {
  const base = loadBase();
  console.log(`[fetch] base ${BASE_REF}: ${base.length} times, ${base.reduce((s, t) => s + t.players.length, 0)} jogadores`);

  // 1) estatística agregada por jogador (listas paginadas, todas as divisões)
  const sl6 = await statsList(WINDOW, 3);
  const sl12 = await statsList(WINDOW12, 3);
  const slT1 = await statsList(WINDOW, 1, { 'filter[tournament_tier_rank][in]': '1,2' });
  console.log(`[fetch] stats_list 6m=${sl6.length} 12m=${sl12.length} tierS/A=${slT1.length}`);
  const S6 = new Map(sl6.map((r) => [r.player_id, r]));
  const S12 = new Map(sl12.map((r) => [r.player_id, r]));
  const ST1 = new Map(slT1.map((r) => [r.player_id, r]));
  const teamRank = new Map<number, number>();
  for (const r of [...sl12, ...sl6]) if (r.player.team && r.player.team.rank) teamRank.set(r.player.team.id, r.player.team.rank);

  // 2) times da base → id do bo3
  const baseTeamBo3 = new Map<string, number>();  // id do jogo → id do bo3
  const teamResolve: Record<string, { bo3: number | null; how: string; candidates?: string[] }> = {};
  for (const t of base) {
    if (t.id === '__free__') continue;
    const m = /^bo3_team_(\d+)$/.exec(t.id);
    if (m) { baseTeamBo3.set(t.id, +m[1]); teamResolve[t.id] = { bo3: +m[1], how: 'id' }; continue; }
    const name = TEAM_ALIAS[t.team] ?? t.team;
    const res = await get<{ results: (ApiTeam & { discipline_id?: number })[] }>(url('/filters/teams', { search_text: name, 'page[limit]': 20 }));
    const exact = (res?.results ?? []).filter((x) => norm(x.name) === norm(name) && (x.discipline_id ?? 1) === 1);
    let pick: number | null = null;
    if (exact.length === 1) pick = exact[0].id;
    else if (exact.length > 1) {
      // mais de um homônimo: fica o que tem mais jogadores ativos hoje
      const ps = await playersBy('team_id', exact.map((x) => x.id));
      const act = (id: number) => ps.filter((p) => p.team_id === id && p.status === 1 && !p.is_coach).length;
      pick = [...exact].sort((a, b) => act(b.id) - act(a.id) || (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.id - b.id)[0].id;
    }
    teamResolve[t.id] = { bo3: pick, how: pick ? (exact.length > 1 ? 'nome (homônimos)' : 'nome') : 'não encontrado', candidates: exact.map((x) => `${x.id}:${x.slug}`) };
    if (pick) baseTeamBo3.set(t.id, pick);
  }

  // 3) quem joga HOJE nos times da base (ativos, banco e técnicos)
  let onBaseTeams = await playersBy('team_id', [...new Set(baseTeamBo3.values())]);
  // 3b) org que ganhou entidade nova no bo3 (a antiga ficou com < 3 ativos): troca
  // pela homônima com 5+ ativos, se houver exatamente uma. O id do jogo não muda.
  for (const t of base) {
    const cur = baseTeamBo3.get(t.id);
    if (cur == null) continue;
    const act = onBaseTeams.filter((p) => p.team_id === cur && p.status === 1 && !p.is_coach).length;
    if (act >= 3) continue;
    const name = TEAM_ALIAS[t.team] ?? t.team;
    const res = await get<{ results: (ApiTeam & { discipline_id?: number })[] }>(url('/filters/teams', { search_text: name, 'page[limit]': 20 }));
    const alts = (res?.results ?? []).filter((x) => x.id !== cur && norm(x.name) === norm(name) && (x.discipline_id ?? 1) === 1);
    if (!alts.length) continue;
    const ps = await playersBy('team_id', alts.map((x) => x.id));
    const ok = alts.filter((x) => ps.filter((p) => p.team_id === x.id && p.status === 1 && !p.is_coach).length >= 5);
    if (ok.length !== 1) continue;
    baseTeamBo3.set(t.id, ok[0].id);
    teamResolve[t.id] = { bo3: ok[0].id, how: `entidade nova no bo3 (antes ${cur}, com ${act} ativo(s))` };
    onBaseTeams = [...onBaseTeams, ...ps.filter((p) => p.team_id === ok[0].id)];
  }
  const baseTeamIds = [...new Set(baseTeamBo3.values())];

  // 4) jogadores da base → id do bo3
  const nickIdx = new Map<string, number[]>();
  for (const r of [...sl12, ...sl6]) {
    const k = norm(r.player.nickname);
    const arr = nickIdx.get(k) ?? [];
    if (!arr.includes(r.player_id)) arr.push(r.player_id);
    nickIdx.set(k, arr);
  }
  const playerResolve: Record<string, { bo3: number | null; how: string }> = {};
  for (const t of base) {
    const tb = baseTeamBo3.get(t.id);
    for (const p of t.players) {
      const m = /^bo3_(\d+)$/.exec(p.id);
      if (m) { playerResolve[p.id] = { bo3: +m[1], how: 'id' }; continue; }
      if (p.id.startsWith('xls_regen_')) { playerResolve[p.id] = { bo3: null, how: 'fictício (regen)' }; continue; }
      const k = norm(p.nick);
      const sameTeam = onBaseTeams.filter((x) => x.team_id === tb && norm(x.nickname) === k && !x.is_coach);
      if (sameTeam.length === 1) { playerResolve[p.id] = { bo3: sameTeam[0].id, how: 'nick no time' }; continue; }
      const byNick = nickIdx.get(k) ?? [];
      if (byNick.length === 1) { playerResolve[p.id] = { bo3: byNick[0], how: 'nick (estatística)' }; continue; }
      const res = await get<{ results: ApiPlayer[] }>(url('/filters/players', { search_text: p.nick, 'page[limit]': 20 }));
      const exact = (res?.results ?? []).filter((x) => norm(x.nickname) === k && !x.is_coach);
      if (exact.length === 1) { playerResolve[p.id] = { bo3: exact[0].id, how: 'nick (busca)' }; continue; }
      if (exact.length > 1) {
        // homônimos: o que tem estatística recente; empate → id menor (estável)
        const withStats = exact.filter((x) => S12.has(x.id));
        const pool = withStats.length ? withStats : exact;
        const pick = [...pool].sort((a, b) => (S12.get(b.id)?.games_count ?? 0) - (S12.get(a.id)?.games_count ?? 0) || a.id - b.id)[0];
        playerResolve[p.id] = { bo3: pick.id, how: `nick (busca, ${exact.length} homônimos)` };
        continue;
      }
      playerResolve[p.id] = { bo3: null, how: 'não encontrado' };
    }
  }
  // o mesmo jogador do bo3 não pode virar dois ids do jogo
  const seenBo3 = new Map<number, string>();
  for (const [gid, r] of Object.entries(playerResolve)) {
    if (r.bo3 == null) continue;
    const prev = seenBo3.get(r.bo3);
    if (prev) { console.warn(`[fetch] bo3 ${r.bo3} casou com ${prev} e ${gid}; ${gid} fica sem casamento`); r.bo3 = null; r.how = `duplicado de ${prev}`; continue; }
    seenBo3.set(r.bo3, gid);
  }
  const baseBo3Ids = [...seenBo3.keys()];
  const baseNow = await playersBy('id', baseBo3Ids);

  // 5) expansão: times da cena atual que NÃO estão na base, por ranking do bo3
  const baseSet = new Set(baseTeamIds);
  const candTeams = new Map<number, { rank: number; n: number }>();
  for (const r of sl6) {
    const tm = r.player.team;
    if (!tm || baseSet.has(tm.id) || r.player.team_id !== tm.id) continue;
    const c = candTeams.get(tm.id) ?? { rank: tm.rank ?? 1e9, n: 0 };
    if (r.games_count >= 5) c.n++;
    candTeams.set(tm.id, c);
  }
  const ranked = [...candTeams.entries()].filter(([, c]) => c.n >= 3 && c.rank < 1e9).sort((a, b) => a[1].rank - b[1].rank || a[0] - b[0]);
  const baseActiveCount = new Set([
    ...onBaseTeams.filter((p) => !p.is_coach && p.status !== 0).map((p) => p.id),
    ...baseNow.filter((p) => !p.is_coach).map((p) => p.id),
  ]).size + Object.values(playerResolve).filter((r) => r.bo3 == null).length;
  const expTeams: number[] = [];
  let expPlayers: ApiPlayer[] = [];
  let total = baseActiveCount;
  for (const c of chunk(ranked.map(([id]) => id), 20)) {
    if (total >= TARGET_PLAYERS) break;
    const ps = await playersBy('team_id', c);
    for (const tid of c) {
      if (total >= TARGET_PLAYERS) break;
      const roster = ps.filter((p) => p.team_id === tid && !p.is_coach && p.status === 1 && !seenBo3.has(p.id));
      if (roster.length < 5) continue;
      expTeams.push(tid);
      const all = ps.filter((p) => p.team_id === tid);
      expPlayers.push(...all);
      total += roster.length;
    }
  }
  // times de DESTINO de jogadores da base que foram para fora da base e da expansão:
  // entram também (se tiverem 5 ativos), para ninguém da base virar free agent à toa
  const known = new Set([...baseTeamIds, ...expTeams]);
  const destIds = [...new Set(baseNow.filter((p) => p.team_id != null && !known.has(p.team_id) && !p.is_coach && p.status !== 0).map((p) => p.team_id!))];
  if (destIds.length) {
    const ps = await playersBy('team_id', destIds);
    for (const tid of destIds.sort((a, b) => a - b)) {
      const roster = ps.filter((p) => p.team_id === tid && !p.is_coach && p.status === 1);
      if (roster.length < 5) continue;
      expTeams.push(tid);
      expPlayers.push(...ps.filter((p) => p.team_id === tid));
      total += roster.filter((p) => !seenBo3.has(p.id)).length;
    }
  }
  expPlayers = [...new Map(expPlayers.map((p) => [p.id, p])).values()];
  console.log(`[fetch] expansão: ${expTeams.length} times, total estimado ${total}`);

  // 6) cadastro dos times (base + expansão)
  const teamInfo = new Map((await teamsBy([...baseTeamIds, ...expTeams])).map((t) => [t.id, t]));

  // 7) conjunto final de jogadores do bo3 e detalhes por jogador
  const allApi = new Map<number, ApiPlayer>();
  for (const p of [...baseNow, ...onBaseTeams, ...expPlayers]) allApi.set(p.id, { ...allApi.get(p.id), ...p });
  const players = [...allApi.values()].filter((p) => !p.is_coach || seenBo3.has(p.id)).sort((a, b) => a.id - b.id);
  const perPlayer = new Map<number, { roles: RoleShares | null; adv: Record<string, number> | null; form: Form | null }>();
  let i = 0;
  for (const p of players) {
    if (++i % 100 === 0) console.log(`[fetch] detalhes ${i}/${players.length} (${JSON.stringify(netStats())})`);
    const active = S12.has(p.id) || S6.has(p.id);
    const roleRows = await get<RoleRow[]>(url(`/players/${p.slug}/player_roles`));
    let adv: Record<string, number> | null = null;
    let form: Form | null = null;
    if (active) {
      const a = await get<Record<string, number>[]>(url(`/players/${p.slug}/advanced_stats`, { 'filter[begin_at_from]': WINDOW.from, 'filter[begin_at_to]': WINDOW.to }));
      const x = a?.[0];
      if (x && x.rounds_count > 0) {
        adv = {
          rounds: x.rounds_count, clutches: x.clutches, clutchAtt: x.clutch_attempts, flashA: x.flash_assists,
          pistolR: x.pistol_rounds_count, pistolW: x.pistol_round_wins_count, openK: x.open_kills_sum, openD: x.open_deaths_sum,
          openKW: x.open_kills_round_wins_count, tradeK: x.trade_kills, tradeD: x.trade_deaths, smokeCov: x.smoke_covered_enemies,
        };
      }
      const ml = await get<MatchRow[]>(url(`/players/${p.slug}/matches_list_stats/general`, {
        'filter[match_begin_at_from]': WINDOW.from, 'filter[match_begin_at_to]': WINDOW.to,
      }));
      form = formOf(ml ?? [], p.id, teamRank);
    }
    perPlayer.set(p.id, { roles: roleShares(roleRows), adv, form });
  }

  // 8) transferências (datas para o relatório de elencos)
  const transfers = new Map<number, Transfer[]>();
  const oldTeamOf = new Map<number, number | null>();
  for (const t of base) for (const p of t.players) {
    const b = playerResolve[p.id]?.bo3;
    if (b != null) oldTeamOf.set(b, t.id === '__free__' ? null : baseTeamBo3.get(t.id) ?? null);
  }
  const needT = players.filter((p) => {
    if (expPlayers.some((e) => e.id === p.id) && !seenBo3.has(p.id)) return false; // expansão: não é transferência da base
    const old = oldTeamOf.get(p.id);
    return old === undefined || old !== p.team_id || p.status !== 1;
  });
  for (const p of needT) {
    const res = await get<{ results: Transfer[] }>(url('/player_transfers', { 'filter[player_id][eq]': p.id, sort: '-action_date', 'page[limit]': 8 }));
    transfers.set(p.id, (res?.results ?? []).map((t) => ({
      action_date: t.action_date, action_type: t.action_type, team_from_id: t.team_from_id, team_from_name: t.team_from_name,
      team_to_id: t.team_to_id, team_to_name: t.team_to_name, is_coach: t.is_coach,
    })));
  }

  // 9) amostra de calibração (tier S, janela)
  const calib = await calibrationSample();

  // ─── montagem do player-stats ─────────────────────────────────────────────
  const gameIdOf = new Map<number, string>();
  for (const [gid, r] of Object.entries(playerResolve)) if (r.bo3 != null) gameIdOf.set(r.bo3, gid);
  const baseById = new Map(base.flatMap((t) => t.players.map((p) => [p.id, { p, team: t }] as const)));
  const outPlayers: Record<string, unknown> = {};
  const roleOf = new Map<string, Role>();
  for (const p of players) {
    const gid = gameIdOf.get(p.id) ?? `bo3_${p.id}`;
    const bp = baseById.get(gid)?.p;
    const extra = perPlayer.get(p.id)!;
    const s6 = S6.get(p.id), s12 = S12.get(p.id);
    const useRow = s6 && s6.rounds_count >= 200 ? s6 : s12 ?? s6;
    const inferred = inferRole(extra.roles) ?? (useRow ? inferRoleFromStats({
      hsk: useRow.avg_headshot_kills_accuracy, fkpr: useRow.avg_first_kills, fdpr: useRow.avg_first_death, rounds: useRow.rounds_count,
    }) : null);
    const apiRole = apiRoleOf(p.role);
    const role: Role = apiRole ?? bp?.role ?? inferred?.role ?? 'Rifler';
    const roleSrc = apiRole ? 'api' : bp ? 'base' : inferred ? 'inferido' : 'padrão';
    roleOf.set(gid, role);
    const t1 = ST1.get(p.id);
    outPlayers[gid] = {
      bo3: p.id, slug: p.slug, nick: p.nickname,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.nickname,
      country: (p.country?.code ?? bp?.country ?? '').toLowerCase() || null,
      born: p.birthday ?? null, age: ageAt(p.birthday) ?? bp?.age ?? null,
      status: STATUS[p.status] ?? 'inactive', team: p.team_id ?? null, joined: p.joined_team_at?.slice(0, 10) ?? null,
      prize: Math.round(p.total_prize ?? 0), coach: p.is_coach ? true : undefined,
      role, roleSrc, roleWhy: roleSrc === 'inferido' ? inferred?.why : undefined,
      roles: extra.roles,
      s: useRow ? summarize(useRow, useRow === s6 ? '6m' : '12m') : null,
      t1: t1 && t1.rounds_count >= 100 ? { games: t1.games_count, rounds: t1.rounds_count, rating: r3(t1.avg_player_rating), kpr: r4(t1.avg_kills), adr: r3(t1.avg_damage) } : null,
      adv: extra.adv, form: extra.form,
      smp: calib.perPlayer.get(p.id) ?? null,
      tr: transfers.get(p.id),
    };
  }
  // jogadores da base sem casamento no bo3 (fictícios ou não achados): entram sem estatística
  for (const [gid, r] of Object.entries(playerResolve)) {
    if (outPlayers[gid]) continue; // sem casamento, ou casado mas sem cadastro devolvido pela API
    const bp = baseById.get(gid)!.p;
    roleOf.set(gid, bp.role);
    outPlayers[gid] = { bo3: null, nick: bp.nick, name: bp.name, country: bp.country, age: bp.age ?? null, role: bp.role, roleSrc: 'base', unresolved: r.bo3 == null ? r.how : `bo3 ${r.bo3} sem cadastro na API`, s: null };
  }
  const outTeams: Record<string, unknown> = {};
  for (const tid of [...baseTeamIds, ...expTeams].sort((a, b) => a - b)) {
    const t = teamInfo.get(tid);
    const members = [...allApi.values()].filter((p) => p.team_id === tid);
    const coaches = members.filter((p) => p.is_coach).sort((a, b) => (b.coach_status ?? 0) - (a.coach_status ?? 0) || a.id - b.id);
    outTeams[String(tid)] = {
      bo3: tid, slug: t?.slug, name: t?.name, tag: t?.acronym ?? null, rank: t?.rank ?? teamRank.get(tid) ?? null,
      country: t?.country?.code?.toLowerCase() ?? null, logo: t?.image_url ?? null, inBase: baseSet.has(tid),
      active: members.filter((p) => !p.is_coach && p.status === 1).map((p) => gameIdOf.get(p.id) ?? `bo3_${p.id}`),
      benched: members.filter((p) => !p.is_coach && p.status === 2).map((p) => gameIdOf.get(p.id) ?? `bo3_${p.id}`),
      coaches: coaches.map((c) => ({ bo3: c.id, nick: c.nickname, name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.nickname, country: c.country?.code?.toLowerCase() ?? null, since: c.joined_team_at?.slice(0, 10) ?? null, status: c.coach_status ?? null })),
    };
  }
  const anchorUrl = url('/players/stats_list', { 'filter[game_begin_at][gt]': WINDOW.from, 'filter[game_begin_at][lt]': WINDOW.to, min_games_count: 3, sort: '-avg_player_rating', 'page[offset]': 0, 'page[limit]': 100 });
  const meta = {
    source: 'API pública do bo3.gg (https://api.bo3.gg/api/v1): players/stats_list, players, teams, players/<slug>/{player_roles,advanced_stats,matches_list_stats}, player_transfers, tournaments, matches, games',
    collectedAt: fetchedAt(anchorUrl), window: WINDOW, window12: WINDOW12, baseRef: BASE_REF,
    notes: [
      'Taxas por round (kpr, dpr, apr, adr, fkpr...) vêm de players/stats_list na janela de 6 meses; com menos de 200 rounds, usa a de 12 meses.',
      'roles = papéis por round do bo3.gg (vida toda no CS2: o endpoint não aceita filtro de data).',
      'form = últimas até 30 partidas da janela (players/<slug>/matches_list_stats): média e desvio do rating por partida, contra top-20 e depois de derrota.',
      'smp = amostra de mapas tier S da janela (KAST e rating por mapa).',
      'Rating é o do bo3.gg (escala ~4–9, média ~6.2), não o Rating 2.x da HLTV.',
    ],
    teamResolve, playerResolve,
  };
  writeFileSync(OUT_STATS, stringifyPlayers({ meta, teams: outTeams, players: sortObj(outPlayers) }));
  console.log(`[fetch] ${OUT_STATS}: ${Object.keys(outPlayers).length} jogadores, ${Object.keys(outTeams).length} times`);

  writeFileSync(OUT_CALIB, JSON.stringify(buildCalibration(calib, roleOf, gameIdOf, meta.collectedAt), null, 2) + '\n');
  console.log(`[fetch] ${OUT_CALIB} ok; rede=${JSON.stringify(netStats())}`);
}

function apiRoleOf(r: string | null | undefined): Role | null {
  const k = (r ?? '').toLowerCase();
  if (!k) return null;
  if (k.includes('igl') || k.includes('captain')) return 'IGL';
  if (k.includes('awp') || k.includes('sniper')) return 'AWP';
  if (k.includes('entry')) return 'Entry';
  if (k.includes('lurk')) return 'Lurker';
  if (k.includes('support')) return 'Support';
  if (k.includes('rifl')) return 'Rifler';
  return null;
}

function summarize(r: SLRow, win: '6m' | '12m') {
  return {
    win, games: r.games_count, rounds: r.rounds_count, wr: r4(r.rounds_win / Math.max(1, r.rounds_count)),
    rating: r3(r.avg_player_rating), kpr: r4(r.avg_kills), dpr: r4(r.avg_death), apr: r4(r.avg_assists), adr: r3(r.avg_damage),
    fkpr: r4(r.avg_first_kills), fdpr: r4(r.avg_first_death), tkpr: r4(r.avg_trade_kills), tdpr: r4(r.avg_trade_death),
    acc: r4(r.avg_shots_accuracy), hsAcc: r4(r.avg_headshots_accuracy), hsk: r4(r.avg_headshot_kills_accuracy),
    flapr: r4(r.avg_flash_assists), utilpr: r3(r.avg_molotov_damage + r.avg_he_damage), mkpr: r4(r.avg_multikills),
    cl: [r.clutches_vs_1, r.clutches_vs_2, r.clutches_vs_3, r.clutches_vs_4, r.clutches_vs_5],
  };
}

// ─── forma (partida a partida) ──────────────────────────────────────────────
interface MatchRow {
  match_id: number; match_start_date: string; enemy_team_id: number | null; game_wins: number[];
  rounds_count: number; stats: { player_rating: number; player_slug?: string }[];
}
interface Form { n: number; mean: number; sd: number; top: [number, number] | null; rest: [number, number] | null; afterLoss: [number, number] | null; afterWin: [number, number] | null }
function formOf(rows: MatchRow[], _pid: number, teamRank: Map<number, number>): Form | null {
  const xs = rows
    .filter((m) => m.stats?.[0] && Number.isFinite(m.stats[0].player_rating) && m.rounds_count >= 10)
    .sort((a, b) => a.match_start_date.localeCompare(b.match_start_date));
  if (xs.length < 3) return null;
  const rt = xs.map((m) => m.stats[0].player_rating);
  const mean = rt.reduce((s, v) => s + v, 0) / rt.length;
  const sd = Math.sqrt(rt.reduce((s, v) => s + (v - mean) ** 2, 0) / (rt.length - 1));
  const avg = (ys: number[]): [number, number] | null => (ys.length ? [ys.length, r3(ys.reduce((s, v) => s + v, 0) / ys.length)] : null);
  const won = xs.map((m) => m.game_wins.reduce((s, v) => s + v, 0) * 2 > m.game_wins.length);
  const isTop = (m: MatchRow) => m.enemy_team_id != null && (teamRank.get(m.enemy_team_id) ?? 999) <= 20;
  return {
    n: xs.length, mean: r3(mean), sd: r3(sd),
    top: avg(xs.filter(isTop).map((m) => m.stats[0].player_rating)),
    rest: avg(xs.filter((m) => !isTop(m)).map((m) => m.stats[0].player_rating)),
    afterLoss: avg(xs.slice(1).filter((_, k) => !won[k]).map((m) => m.stats[0].player_rating)),
    afterWin: avg(xs.slice(1).filter((_, k) => won[k]).map((m) => m.stats[0].player_rating)),
  };
}

interface Transfer { action_date: string; action_type: number; team_from_id: number | null; team_from_name: string | null; team_to_id: number | null; team_to_name: string | null; is_coach: boolean }

// ─── amostra de calibração ──────────────────────────────────────────────────
interface Tournament { id: number; slug: string; name: string; tier: string; start_date: string; status: string }
interface Match { id: number; slug: string; start_date: string; status: string; tournament_id: number }
interface RoundTeam { team_side: 'CT' | 'T'; round_number: number; win: number; pistol_round: number; economy_level: number; enemy_economy_level: number; first_kills: number; kills: number; kast_scores_sum: number; players_count: number; clan_name: string }
interface GameRounds { id: number; map_name: string; rounds_count: number; game_rounds: { round_number: number; ov_index: number; game_round_team_clans: RoundTeam[] }[] }
interface GamePlayer { kills: number; death: number; assists: number; first_kills: number; first_death: number; kast: number; adr: number; player_rating: number; clan_name: string; steam_profile?: { player_id: number | null } }
interface ClutchRow { player_slug: string; vs_1: CR; vs_2: CR; vs_3: CR; vs_4: CR; vs_5: CR }
interface CR { clutch_attempts_count: number; clutches_count: number }

interface CalibSample {
  tournaments: { id: number; slug: string; name: string; start: string }[];
  games: number; matches: number;
  maps: Map<string, { rounds: number; ct: number; games: number }>;
  mapPoolRounds: Map<string, { rounds: number; ct: number }>;
  pistol: { n: number; conv2: number; conv3: number };
  econ: Map<string, { n: number; w: number }>;
  firstKill: { n: number; w: number };
  kastTeam: { sum: number; n: number };
  clutch: { att: number[]; won: number[] };
  perPlayer: Map<number, { games: number; rounds: number; kast: number; rating: number; adr: number; kills: number; deaths: number; assists: number; fk: number; fd: number; teamK: number; teamFK: number }>;
}

export async function calibrationSample(): Promise<CalibSample> {
  const ts = (await getAll<Tournament>('/tournaments', {
    'filter[tournaments.tier][in]': 's', 'filter[tournaments.status][eq]': 'finished', 'filter[tournaments.discipline_id][eq]': 1,
    'filter[tournaments.start_date][gt]': WINDOW.from, 'filter[tournaments.start_date][lt]': WINDOW.to, sort: '-start_date',
  }, 50)).filter((t) => t.status === 'finished');
  const out: CalibSample = {
    tournaments: ts.map((t) => ({ id: t.id, slug: t.slug, name: t.name, start: t.start_date.slice(0, 10) })),
    games: 0, matches: 0, maps: new Map(), mapPoolRounds: new Map(), pistol: { n: 0, conv2: 0, conv3: 0 }, econ: new Map(),
    firstKill: { n: 0, w: 0 }, kastTeam: { sum: 0, n: 0 }, clutch: { att: [0, 0, 0, 0, 0], won: [0, 0, 0, 0, 0] }, perPlayer: new Map(),
  };
  // CT/T por mapa agregado do map_pool de cada torneio (todos os mapas do torneio)
  for (const t of ts) {
    const mp = await get<{ map_name: string; rounds_count: number; ct_round_wins: number }[]>(url(`/tournaments/${t.slug}/map_pool`));
    for (const m of mp ?? []) {
      const a = out.mapPoolRounds.get(m.map_name) ?? { rounds: 0, ct: 0 };
      a.rounds += m.rounds_count ?? 0; a.ct += m.ct_round_wins ?? 0;
      out.mapPoolRounds.set(m.map_name, a);
    }
  }
  // partidas finalizadas, das mais recentes para trás, até MAX_SAMPLE_GAMES mapas
  const matches: Match[] = [];
  for (const t of ts) {
    matches.push(...(await getAll<Match>('/matches', { 'filter[matches.tournament_id][eq]': t.id, 'filter[matches.status][eq]': 'finished' }, 100)));
  }
  matches.sort((a, b) => b.start_date.localeCompare(a.start_date) || b.id - a.id);
  const games: { id: number; match: Match }[] = [];
  for (const c of chunk(matches, 25)) {
    if (games.length >= MAX_SAMPLE_GAMES) break;
    const gs = await getAll<{ id: number; match_id: number; status: string }>('/games', { 'filter[games.match_id][in]': c.map((m) => m.id).join(',') }, 100);
    for (const g of gs.sort((a, b) => a.id - b.id)) {
      if (g.status !== 'finished') continue;
      const m = c.find((x) => x.id === g.match_id)!;
      games.push({ id: g.id, match: m });
    }
  }
  const sel = games.slice(0, MAX_SAMPLE_GAMES);
  const selMatches = [...new Map(sel.map((g) => [g.match.id, g.match])).values()];
  out.matches = selMatches.length;
  for (const m of selMatches) {
    const cl = await get<ClutchRow[]>(url(`/matches/${m.slug}/clutches_stats`));
    for (const r of cl ?? []) {
      [r.vs_1, r.vs_2, r.vs_3, r.vs_4, r.vs_5].forEach((v, k) => { out.clutch.att[k] += v?.clutch_attempts_count ?? 0; out.clutch.won[k] += v?.clutches_count ?? 0; });
    }
  }
  for (const g of sel) {
    const gr = await get<GameRounds>(url(`/games/${g.id}`, { with: 'rounds' }));
    const ps = await get<GamePlayer[]>(url(`/games/${g.id}/players_stats`));
    if (!gr?.game_rounds?.length) continue;
    out.games++;
    const rounds = gr.game_rounds.filter((r) => r.game_round_team_clans?.length === 2).sort((a, b) => a.round_number - b.round_number);
    const mp = out.maps.get(gr.map_name) ?? { rounds: 0, ct: 0, games: 0 };
    mp.games++;
    const winnerOf = new Map<number, string>();
    for (const r of rounds) {
      const [a, b] = r.game_round_team_clans;
      const w = a.win ? a : b.win ? b : null;
      if (!w) continue;
      winnerOf.set(r.round_number, w.clan_name);
      if (r.ov_index === 0 && r.round_number <= 24) { mp.rounds++; if (w.team_side === 'CT') mp.ct++; }
      for (const t of [a, b]) { out.kastTeam.sum += t.kast_scores_sum; out.kastTeam.n += t.players_count || 5; }
      const fk = a.first_kills > 0 ? a : b.first_kills > 0 ? b : null;
      if (fk) { out.firstKill.n++; if (fk.win) out.firstKill.w++; }
      if (!a.pistol_round) {
        for (const [x, y] of [[a, b], [b, a]] as const) {
          const key = `${econName(x.economy_level)}_vs_${econName(y.economy_level)}`;
          const e = out.econ.get(key) ?? { n: 0, w: 0 };
          e.n++; if (x.win) e.w++;
          out.econ.set(key, e);
        }
      }
    }
    for (const p1 of [1, 13]) {
      const w1 = winnerOf.get(p1);
      if (!w1 || !winnerOf.has(p1 + 1)) continue;
      out.pistol.n++;
      if (winnerOf.get(p1 + 1) === w1) out.pistol.conv2++;
      if (winnerOf.get(p1 + 1) === w1 && winnerOf.get(p1 + 2) === w1) out.pistol.conv3++;
    }
    out.maps.set(gr.map_name, mp);
    // por jogador (KAST, abertura, participação nas kills do time)
    const teamK = new Map<string, number>(), teamFK = new Map<string, number>();
    for (const p of ps ?? []) { teamK.set(p.clan_name, (teamK.get(p.clan_name) ?? 0) + p.kills); teamFK.set(p.clan_name, (teamFK.get(p.clan_name) ?? 0) + p.first_kills); }
    for (const p of ps ?? []) {
      const pid = p.steam_profile?.player_id;
      if (!pid) continue;
      const a = out.perPlayer.get(pid) ?? { games: 0, rounds: 0, kast: 0, rating: 0, adr: 0, kills: 0, deaths: 0, assists: 0, fk: 0, fd: 0, teamK: 0, teamFK: 0 };
      const n = gr.rounds_count || rounds.length;
      a.games++; a.rounds += n; a.kast += p.kast * n; a.rating += p.player_rating * n; a.adr += p.adr * n;
      a.kills += p.kills; a.deaths += p.death; a.assists += p.assists; a.fk += p.first_kills; a.fd += p.first_death;
      a.teamK += teamK.get(p.clan_name) ?? 0; a.teamFK += teamFK.get(p.clan_name) ?? 0;
      out.perPlayer.set(pid, a);
    }
  }
  return out;
}

const econName = (l: number) => (l === -1 ? 'eco' : l === 0 ? 'force' : l === 1 ? 'semi' : l === 2 ? 'full' : 'x');

// Aproximação pública (engenharia reversa da comunidade, amplamente citada) do
// Rating 2.0: 0.0073·KAST + 0.3591·KPR − 0.5329·DPR + 0.2372·Impact + 0.0032·ADR + 0.1587,
// Impact = 2.13·KPR + 0.42·APR − 0.41. KAST em %. É estimativa, não o número oficial.
export function rating2Approx(kast: number, kpr: number, dpr: number, apr: number, adr: number): number {
  const impact = 2.13 * kpr + 0.42 * apr - 0.41;
  return 0.0073 * kast * 100 + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587;
}


// Preenche o formato de alvos definido pela frente C (motor/partida): o arquivo
// docs/calibration-targets.json existente é o molde (chaves, unidades, `def`,
// tolerâncias); aqui só entram os valores medidos e a fonte de cada um.
function buildCalibration(c: CalibSample, roleOf: Map<string, Role>, gameIdOf: Map<number, string>, collectedAt: string | null) {
  type T = { value: number; tol: number; unit: string; def: string; source: string; provisional: boolean; estimate?: boolean; n?: number; by?: Record<string, { value: number; tol: number; n?: number }> };
  const tpl = JSON.parse(readFileSync(OUT_CALIB, 'utf8')) as { targets: Record<string, T>; [k: string]: unknown };
  const src = `bo3.gg, amostra tier S ${WINDOW.from}→${WINDOW.to}: ${c.games} mapas de ${c.matches} partidas (${c.tournaments.length} torneios)`;
  const t = tpl.targets;
  const set = (k: string, value: number | null, source: string, n: number, extra: Partial<T> = {}) => {
    if (value == null || !Number.isFinite(value)) return;
    t[k] = { ...t[k], ...extra, value: r4(value), source, provisional: false, n };
    if (!extra.estimate) delete t[k].estimate;
  };
  // CT por mapa: map_pool dos torneios (regulamento + prorrogação)
  const mp = [...c.mapPoolRounds.entries()];
  const all = mp.reduce((s, [, a]) => ({ rounds: s.rounds + a.rounds, ct: s.ct + a.ct }), { rounds: 0, ct: 0 });
  set('ctRoundWin', all.ct / all.rounds, `${src}; tournaments/<slug>/map_pool de cada torneio (todos os mapas do torneio). Mapas sem amostra (≥ 300 rounds) mantêm o valor provisório`, all.rounds);
  const by = { ...(t.ctRoundWin.by ?? {}) };
  for (const [m, a] of mp.sort()) {
    if (a.rounds < 300) continue;
    const k = m.replace(/^de_/, '');
    by[k] = { value: r4(a.ct / a.rounds), tol: by[k]?.tol ?? 0.03, n: a.rounds };
  }
  t.ctRoundWin.by = Object.fromEntries(Object.entries(by).sort(([a], [b]) => a.localeCompare(b)));
  set('pistolConversion', c.pistol.conv2 / c.pistol.n, `${src}; rounds 1 e 13 (pistol) seguidos do 2 e 14`, c.pistol.n);
  const econ = (k: string) => c.econ.get(k);
  const eco = econ('eco_vs_full'), force = econ('force_vs_full');
  if (eco) set('ecoWin', eco.w / eco.n, `${src}; economy_level do bo3.gg: eco (-1) contra full buy (2), sem pistol`, eco.n);
  if (force) set('forceWin', force.w / force.n, `${src}; economy_level do bo3.gg: force (0) contra full buy (2), sem pistol`, force.n);
  set('openingConversion', c.firstKill.w / c.firstKill.n, `${src}; games/<id>?with=rounds: time com first_kills no round`, c.firstKill.n);
  set('clutch1v1', c.clutch.won[0] / c.clutch.att[0], `${src}; matches/<slug>/clutches_stats (vs_1)`, c.clutch.att[0]);
  set('clutch1v2', c.clutch.won[1] / c.clutch.att[1], `${src}; matches/<slug>/clutches_stats (vs_2)`, c.clutch.att[1]);
  // por função: jogadores da amostra com ≥ 8 mapas; média ponderada por rounds
  const agg = new Map<string, { r: number; rating: number; adr: number; kast: number; fkS: number[]; kS: number[]; players: number }>();
  const tot = { r: 0, rating: 0, adr: 0, kast: 0 };
  for (const [pid, a] of c.perPlayer) {
    tot.r += a.rounds; tot.rating += a.rating; tot.adr += a.adr; tot.kast += a.kast;
    if (a.games < 8) continue;
    const role = roleOf.get(gameIdOf.get(pid) ?? `bo3_${pid}`);
    if (!role) continue;
    const g = agg.get(role) ?? { r: 0, rating: 0, adr: 0, kast: 0, fkS: [], kS: [], players: 0 };
    g.r += a.rounds; g.rating += a.rating; g.adr += a.adr; g.kast += a.kast; g.players++;
    g.fkS.push(a.fk / Math.max(1, a.teamFK)); g.kS.push(a.kills / Math.max(1, a.teamK));
    agg.set(role, g);
  }
  const meanRating = tot.rating / tot.r;
  const roleSrc = `${src}; games/<id>/players_stats; função = base curada do jogo (novatos: inferida pelos papéis por round do bo3.gg)`;
  const byRole = (k: string, f: (g: { r: number; rating: number; adr: number; kast: number; fkS: number[]; kS: number[]; players: number }) => number) => {
    const out = { ...(t[k].by ?? {}) };
    for (const [role, g] of agg) out[role] = { value: r4(f(g)), tol: out[role]?.tol ?? t[k].tol, n: g.players };
    t[k].by = out;
  };
  set('ratingRelByRole', 1, `${roleSrc}; rating do bo3.gg (escala própria), média da função ÷ média geral da amostra`, c.perPlayer.size);
  byRole('ratingRelByRole', (g) => g.rating / g.r / meanRating);
  set('adr', tot.adr / tot.r, roleSrc, tot.r);
  byRole('adr', (g) => g.adr / g.r);
  set('kast', tot.kast / tot.r, roleSrc, tot.r);
  byRole('kast', (g) => g.kast / g.r);
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
  const entry = agg.get('Entry'), awp = agg.get('AWP');
  if (entry) set('entryOpeningShare', mean(entry.fkS), `${roleSrc}; opening kills do Entry ÷ opening kills do time, por jogador`, entry.players);
  if (awp) set('awpKillShare', mean(awp.kS), `${roleSrc}; abates do AWPer de função ÷ abates do time (a API não separa abates por arma: é o share do jogador, não só da AWP)`, awp.players);
  return {
    ...tpl,
    provisional: false,
    owner: 'frente A (motor/dados): valores medidos no bo3.gg por scripts/fetch-bo3-stats.mts; formato definido pela frente C (motor/partida)',
    note: 'Valores medidos numa amostra tier S do bo3.gg (ver `sample`). `n` = tamanho da amostra de cada alvo (rounds, pistols, tentativas ou jogadores). Tolerâncias são as da frente C. `estimate: true` só onde não há dado público confiável.',
    collectedAt, window: WINDOW,
    sample: { tier: 'S', maps: c.games, matches: c.matches, tournaments: c.tournaments },
    targets: t,
  };
}


// ─── serialização estável (uma linha por jogador, diff legível) ─────────────
function sortObj<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}
function stringifyPlayers(x: { meta: unknown; teams: Record<string, unknown>; players: Record<string, unknown> }): string {
  const lines = ['{', ` "meta": ${JSON.stringify(x.meta)},`, ' "teams": {'];
  const te = Object.entries(x.teams);
  te.forEach(([k, v], i) => lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < te.length - 1 ? ',' : ''}`));
  lines.push(' },', ' "players": {');
  const pe = Object.entries(x.players);
  pe.forEach(([k, v], i) => lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < pe.length - 1 ? ',' : ''}`));
  lines.push(' }', '}');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
