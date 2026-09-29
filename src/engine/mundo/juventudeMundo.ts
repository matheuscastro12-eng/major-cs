// [fase 4 · frente JUVENTUDE] Os jovens no MUNDO DA IA (só a Carreira importa:
// este módulo conhece a base bo3 e o pipeline do engine/career/aiWorld.ts).
//
//   - `withNewgens`: os jovens sem clube entram no mercado livre (`__free__`)
//     da base; `save.moves` os leva para os clubes como qualquer jogador real, e
//     o mercado da IA (engine/clube/mercadoIA.ts) os contrata quando rendem —
//     academias e clubes de estratégia "youth" preferem os jovens da casa.
//   - `tickJuventude` (fechamento do split): aposentadorias do mundo (alguns
//     viram técnico/analista no pool da comissão), evolução dos jovens pela
//     rodagem, poda de quem nunca estourou e, na virada do ano, a leva nova.
//   - `ensureYearIntake`: garante a leva do ano corrente (save migrado / Carreira
//     nova abre a tela Juventude com a geração do ano).
import type { Player, TeamSeason } from '../../types';
import { CS2_REAL_2026 } from '../../data/bo3';
import { macroRegionOf, type MacroRegion } from '../../data/regions';
import { ACADEMY_CLUBS } from '../career/academyLeague';
import { BASE_PLAYER_IDS, agedFreeAgents, aiAgeOf, buildAiWorld, type AiWorldArgs } from '../career/aiWorld';
import type { YouthDebut } from '../career/playerAge';
import { FREE_TEAM_ID } from '../career/transferAI';
import { playerOvr } from '../ratings';
import { hashStr } from '../../state/hash';
import { attrsOf } from '../attrs/model';
import type { RetiredSource } from '../gestao/staff';
import type { MundoState, WorldRetiree } from './model';
import {
  applyIntake, careerYearOf, evolveNewgens, firstSplitOfYear, generateIntake, hasIntake, isNewgenId,
  newgenId, newgenList, newgenOrigin, pruneNewgens, storeNewgen, youthSeedFor,
  type AcademySource, type MundoJuv, type NewgenStatus,
} from './juventude';

export const EMPTY_MUNDO: MundoJuv = { v: 1, calendar: [], results: [], vrs: {}, newgens: {}, intake: [], databaseId: null };
/** Bloco `mundo` do save com padrões (Carreira nova não passa pela migração v30). */
export function mundoOf(save: { mundo?: MundoState | null }): MundoJuv {
  const m = save.mundo;
  return m && m.v === 1 ? (m as MundoJuv) : EMPTY_MUNDO;
}

// ─── jovens no mercado livre ────────────────────────────────────────────────
/**
 * A base do mundo com os jovens: todos entram no `__free__` (o `save.moves`
 * os leva aos clubes). `exclude` = quem não pode aparecer no mundo (seu elenco,
 * vendidos com cópia no extraOnTeam).
 */
export function withNewgens(base: TeamSeason[], mundo: MundoJuv | null | undefined, exclude?: ReadonlySet<string>): TeamSeason[] {
  const list = newgenList(mundo).filter((p) => !exclude?.has(p.id));
  if (list.length === 0) return base;
  let found = false;
  const out = base.map((t) => {
    if (t.id !== FREE_TEAM_ID) return t;
    found = true;
    return { ...t, players: [...t.players, ...list] };
  });
  return found ? out : base;
}

/**
 * Ids que o mercado da IA pode mover: jogadores da base + jovens do mundo.
 * `base` = os movíveis da base da Carreira (com base customizada do editor, os
 * jogadores dela; padrão: a base oficial).
 */
export function movableIdsWith(mundo: MundoJuv | null | undefined, base: ReadonlySet<string> = BASE_PLAYER_IDS): ReadonlySet<string> {
  const ids = Object.keys(mundo?.newgens ?? {});
  if (ids.length === 0) return base;
  return new Set([...base, ...ids]);
}

/**
 * Afinidade do comprador com o jovem (somada ao score da escolha do mercado da
 * IA): o clube dono da academia que revelou o jovem tem preferência por ele.
 */
export function youthAffinity(mundo: MundoJuv | null | undefined): (buyerId: string, p: Player) => number {
  const originOf = new Map<string, string>();
  for (const l of mundo?.intake ?? []) for (const [id, o] of Object.entries(l.origin ?? {})) originOf.set(id, o);
  const parent = new Map(ACADEMY_CLUBS.filter((c) => c.parentId).map((c) => [c.id, c.parentId!] as [string, string]));
  return (buyerId, p) => {
    const o = originOf.get(p.id);
    if (!o) return 0;
    return parent.get(o) === buyerId || o === buyerId ? 25 : 0;
  };
}

// ─── academias ──────────────────────────────────────────────────────────────
/** Clubes com academia cujo clube-pai existe no mundo (revelam 1 jovem a mais por ano). */
export function academySources(world: TeamSeason[]): AcademySource[] {
  const alive = new Set(world.map((t) => t.id));
  return ACADEMY_CLUBS.filter((c) => !c.parentId || alive.has(c.parentId)).map((c) => ({ teamId: c.id, name: c.name, country: c.country }));
}
export function academyName(id: string): string | null {
  return ACADEMY_CLUBS.find((c) => c.id === id)?.name ?? null;
}
export function academyParentOf(id: string): string | null {
  return ACADEMY_CLUBS.find((c) => c.id === id)?.parentId ?? null;
}

export interface UserYouthCtx {
  country: string;
  region: MacroRegion;
  /** 1 = comissão mediana (formação de jovens); a estrutura de treino soma */
  quality: number;
}

/** Garante a leva do ano do split (idempotente). */
export function ensureYearIntake(mundo: MundoJuv, a: {
  split: number; save: Parameters<typeof youthSeedFor>[0]; world: TeamSeason[]; user?: UserYouthCtx | null;
}): MundoJuv {
  const year = careerYearOf(a.split);
  if (hasIntake(mundo, year)) return mundo;
  const seed = mundo.seed ?? youthSeedFor(a.save);
  const r = generateIntake({ seed, year, split: Math.max(firstSplitOfYear(year), Math.min(a.split, firstSplitOfYear(year) + 2)), academies: academySources(a.world), user: a.user ?? null });
  return applyIntake({ ...mundo, seed }, r);
}

// ─── aposentadorias do mundo ────────────────────────────────────────────────
const idsOf = (teams: TeamSeason[], free: Player[]) => {
  const out = new Map<string, { p: Player; teamId: string }>();
  for (const t of teams) for (const p of t.players) out.set(p.id, { p, teamId: t.id });
  for (const p of free) if (!out.has(p.id)) out.set(p.id, { p, teamId: FREE_TEAM_ID });
  return out;
};

/**
 * Parte de quem se aposenta vira comissão técnica (entra no mercado de staff):
 * IGL tende a técnico, suporte/lurker a analista, o resto a auxiliar — ~1 em 3,
 * mais provável para quem tem leitura de jogo (atributos mentais).
 */
export function retireeStaffRole(p: Player, ovr: number): WorldRetiree['staffRole'] {
  const a = attrsOf(p).a;
  const mind = (a.gameSense + a.decisions + a.leadership + a.communication) / 4;
  const chance = 18 + Math.max(0, mind - 10) * 5 + (p.role === 'IGL' ? 20 : 0) + (ovr >= 80 ? 8 : 0);
  if (hashStr(`staffret:${p.id}`) % 100 >= chance) return null;
  if (p.role === 'IGL') return mind >= 12 ? 'headCoach' : 'assistant';
  if (p.role === 'Support' || p.role === 'Lurker') return 'analyst';
  return hashStr(`staffrole:${p.id}`) % 3 === 0 ? 'analyst' : 'assistant';
}

/** Quem estava no mundo no split `split` e não está mais no `split + 1` (aposentou). */
export function worldRetirements(a: Omit<AiWorldArgs, 'split'> & { split: number; free0: Player[]; free1: Player[]; world0: TeamSeason[]; world1: TeamSeason[]; youthDebut?: Record<string, YouthDebut> }): WorldRetiree[] {
  const before = idsOf(a.world0, a.free0);
  const after = idsOf(a.world1, a.free1);
  const out: WorldRetiree[] = [];
  for (const [id, { p, teamId }] of before) {
    if (after.has(id) || isNewgenId(id) || a.skip.has(id)) continue;
    if (id.includes('__aca')) continue; // reposição da base (sintética), não é aposentadoria
    const ovr = playerOvr(p);
    out.push({ id, nick: p.nick, age: aiAgeOf(p, a.split + 1, a.youthDebut), split: a.split + 1, ovr, role: p.role, country: p.country, teamId: teamId === FREE_TEAM_ID ? undefined : teamId, staffRole: retireeStaffRole(p, ovr) });
  }
  return out.sort((x, y) => y.ovr - x.ovr || (x.id < y.id ? -1 : 1));
}

/** Aposentados que viraram comissão → candidatos do mercado de staff. */
// `base` = base da Carreira (com a customizada do editor); padrão: a oficial.
export function retireeStaffSources(mundo: MundoJuv | null | undefined, base: TeamSeason[] = CS2_REAL_2026): RetiredSource[] {
  const byId = new Map<string, Player>();
  for (const t of base) for (const p of t.players) byId.set(p.id, p);
  return (mundo?.retirees ?? []).filter((r) => r.staffRole).map((r) => {
    const p = byId.get(r.id);
    const a = attrsOf(p ?? { id: r.id, nick: r.nick, name: r.nick, country: r.country, role: r.role, aim: r.ovr, awp: r.ovr - 10, igl: r.ovr - 8, clutch: r.ovr - 2, consistency: r.ovr - 1, age: r.age }).a;
    return { id: r.id, nick: r.nick, name: p?.name, country: r.country, age: r.age, role: r.role, a };
  });
}

// ─── vendidos presos no banco ───────────────────────────────────────────────
type ExtraOnTeam = NonNullable<AiWorldArgs['extraOnTeam']>;
/** Splits fora dos 5 (desde a chegada) até o vendido voltar ao mercado livre. */
export const EXTRA_BENCH_SPLITS = 2;
/**
 * Vendido seu (extraOnTeam: sem id na base, o mercado da IA não o move) que está
 * FORA DOS 5 do comprador no split que fecha e chegou há ≥ EXTRA_BENCH_SPLITS
 * splits volta ao mercado livre como jovem do mundo (newgen): movível pela IA,
 * evolui e é podado como os outros. Os vendidos entram na frente do elenco
 * (buildAiWorld), então só cai no banco quem foi empurrado por chegadas novas.
 */
export function releaseBenchedExtras<T extends MundoJuv>(a: { mundo: T; extraOnTeam: ExtraOnTeam | undefined; world: TeamSeason[]; split: number }): {
  mundo: T; extraOnTeam: ExtraOnTeam | undefined; released: { from: string; to: string; teamId: string }[];
} {
  const released: { from: string; to: string; teamId: string }[] = [];
  if (!a.extraOnTeam) return { mundo: a.mundo, extraOnTeam: a.extraOnTeam, released };
  const indexOf = new Map<string, number>();
  for (const t of a.world) t.players.forEach((p, i) => indexOf.set(`${t.id}|${p.id}`, i));
  let mundo = a.mundo;
  const out: ExtraOnTeam = {};
  const debut = a.split + 1;
  for (const [teamId, list] of Object.entries(a.extraOnTeam)) {
    const keep = list.filter((e) => {
      const i = indexOf.get(`${teamId}|${e.player.id}`);
      if (i == null || i < 5 || a.split + 1 - e.arrival < EXTRA_BENCH_SPLITS) return true;
      const p = e.player;
      const age = Math.max(16, Math.min(40, aiAgeOf(p, debut)));
      const region = macroRegionOf(p.country) ?? 'europe';
      let n = 900;
      while (mundo.newgens[newgenId(debut, age, region, n)]) n++;
      const id = newgenId(debut, age, region, n);
      // sem `age`/`attrs` herdados: a idade sai do id; os atributos do vendido viram os do jovem
      const { age: _age, attrs: _attrs, ...rest } = p;
      mundo = storeNewgen(mundo, { ...rest, id, attrs: attrsOf(p) });
      released.push({ from: p.id, to: id, teamId });
      return false;
    });
    if (keep.length) out[teamId] = keep;
  }
  return released.length ? { mundo, extraOnTeam: out, released } : { mundo: a.mundo, extraOnTeam: a.extraOnTeam, released };
}

// ─── o tick do fechamento do split ──────────────────────────────────────────
export interface JuventudeTickArgs {
  mundo: MundoJuv;
  /** split que FECHA */
  split: number;
  /** base da Carreira (oficial + edições do admin + base customizada), SEM os jovens */
  base: TeamSeason[];
  moves?: Record<string, string>;
  arrivals?: Record<string, number>;
  aiDrift?: Record<string, number>;
  takeoverId?: string | null;
  extraOnTeam?: AiWorldArgs['extraOnTeam'];
  /** seu elenco (e quem mais está preso ao seu clube: academia, empréstimos) */
  skip: ReadonlySet<string>;
  /** semente para a 1ª leva (org/elenco do save) */
  save: Parameters<typeof youthSeedFor>[0];
  user?: UserYouthCtx | null;
  /** multiplicador de evolução dos jovens do SEU clube vindos da sua base (comissão) */
  youthGrowth?: number;
  /** save.youthDebut: base promovida vendida/emprestada segue o relógio da promoção */
  youthDebut?: Record<string, YouthDebut>;
}
/** Manchete da juventude (dados crus; a Carreira monta o texto traduzido). */
export interface JuventudeNews {
  kind: 'retire' | 'intake' | 'breakout';
  split: number;
  playerId?: string;
  nick?: string;
  age?: number;
  ovr?: number;
  staffRole?: WorldRetiree['staffRole'];
  teamId?: string;
  count?: number;
}
export interface JuventudeTickResult {
  mundo: MundoJuv;
  retirees: WorldRetiree[];
  news: JuventudeNews[];
  /** jovens que saíram do mundo (poda): tire de `moves` */
  removed: string[];
  /** vendidos presos no banco que voltaram ao mercado livre: o novo extraOnTeam
   *  (undefined = nada mudou) */
  extraOnTeam?: AiWorldArgs['extraOnTeam'];
}

const RETIREE_LOG = 60;

export function tickJuventude(a: JuventudeTickArgs): JuventudeTickResult {
  const skip = new Set(a.skip);
  const exclude = new Set([...skip, ...Object.values(a.extraOnTeam ?? {}).flat().map((e) => e.player.id)]);
  const base = withNewgens(a.base, a.mundo, exclude);
  const args = { base, moves: a.moves, skip, takeoverId: a.takeoverId, extraOnTeam: a.extraOnTeam, aiDrift: a.aiDrift, arrivals: a.arrivals };
  const world0 = buildAiWorld({ ...args, split: a.split });
  const world1 = buildAiWorld({ ...args, split: a.split + 1 });
  const free0 = agedFreeAgents(base, a.moves, a.split, skip);
  const free1 = agedFreeAgents(base, a.moves, a.split + 1, skip);
  const news: JuventudeNews[] = [];

  // 1) aposentadorias do mundo (IA) — manchetes e pool da comissão
  const retirees = worldRetirements({ ...args, split: a.split, world0, world1, free0, free1, youthDebut: a.youthDebut });
  for (const r of retirees.filter((x) => x.ovr >= 78).slice(0, 4)) {
    news.push({ kind: 'retire', split: a.split + 1, playerId: r.id, nick: r.nick, age: r.age, ovr: r.ovr, staffRole: r.staffRole, teamId: r.teamId });
  }

  // 2) evolução dos jovens pelo que jogaram no split
  const status = new Map<string, NewgenStatus>();
  for (const t of world0) t.players.forEach((p, i) => { if (isNewgenId(p.id)) status.set(p.id, i < 5 ? 'starter' : 'bench'); });
  const statusOf = (id: string): NewgenStatus => (skip.has(id) || exclude.has(id) ? 'user' : status.get(id) ?? 'free');
  const before = new Map(newgenList(a.mundo).map((p) => [p.id, playerOvr(p)] as [string, number]));
  let mundo = evolveNewgens(a.mundo, { split: a.split, statusOf, growthOf: (id) => (newgenOrigin(a.mundo, id) === 'user' ? a.youthGrowth ?? 1 : 1) });
  // estouro: jovem que passou de 80 de OVR vira manchete
  for (const p of newgenList(mundo)) {
    const b = before.get(p.id) ?? 0, now = playerOvr(p);
    if (b < 80 && now >= 80 && news.filter((n) => n.kind === 'breakout').length < 3) {
      news.push({ kind: 'breakout', split: a.split + 1, playerId: p.id, nick: p.nick, age: aiAgeOf(p, a.split + 1, a.youthDebut), ovr: now });
    }
  }

  // 3) poda: quem nunca foi contratado e ficou velho, ou aposentou
  const pr = pruneNewgens(mundo, { split: a.split + 1, statusOf, pinned: (id) => skip.has(id) || exclude.has(id) });
  mundo = pr.mundo;

  // 3b) vendido seu preso no banco do comprador volta ao mercado livre
  const rel = releaseBenchedExtras({ mundo, extraOnTeam: a.extraOnTeam, world: world0, split: a.split });
  mundo = rel.mundo;

  // 4) aposentados recentes (log curto)
  const retLog = [...retirees, ...(mundo.retirees ?? [])].slice(0, RETIREE_LOG);
  mundo = { ...mundo, retirees: retLog };

  // 5) virada do ano: a leva nova
  const nextYear = careerYearOf(a.split + 1);
  if (!hasIntake(mundo, nextYear)) {
    const n0 = Object.keys(mundo.newgens).length;
    mundo = ensureYearIntake(mundo, { split: a.split + 1, save: a.save, world: world1, user: a.user });
    const n = Object.keys(mundo.newgens).length - n0;
    if (n > 0) news.push({ kind: 'intake', split: a.split + 1, count: n });
  }
  return { mundo, retirees, news, removed: pr.removed.map((r) => r.id), ...(rel.released.length ? { extraOnTeam: rel.extraOnTeam } : {}) };
}

/** Tira de `moves` quem saiu do mundo (poda). */
export function movesWithout(moves: Record<string, string> | undefined, ids: string[]): Record<string, string> | undefined {
  if (!moves || ids.length === 0) return moves;
  const kill = new Set(ids);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(moves)) if (!kill.has(k)) out[k] = v;
  return out;
}

/** Clube atual de um jovem (id do time, ou null = sem clube). */
export function newgenClubOf(moves: Record<string, string> | undefined, id: string): string | null {
  const t = moves?.[id];
  return t && t !== FREE_TEAM_ID ? t : null;
}

/** Id do prospecto da academia quando você leva um jovem da sua geração. */
export const academyIdForNewgen = (id: string) => `prospect__${id.replace(/[^a-z0-9]/gi, '')}`;
