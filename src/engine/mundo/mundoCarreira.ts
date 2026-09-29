// [fase 4 · frente CIRCUITO] Ponte do circuito com a Carreira (puro, sem React):
// resultados do SEU evento, o mundo em segundo plano de cada etapa, o Major
// inteiro (com o que você jogou de verdade), a publicação do VRS, a poda dos
// resultados (save enxuto) e a semeadura do mundo em save migrado/carreira nova.

import type { MundoState, WorldEventResult, VrsEntry, EventKind } from './model';
import type { TeamSeason } from '../../types';
import type { MacroRegion } from '../../data/regions';
import {
  EVENTS_PER_SPLIT, MAJOR_POOL, MAJOR_S1, MAJOR_S2, MAJOR_S3, RMR_FIELD, RMR_POOL, RMR_REGIONS, RMR_LABEL, RMR_SLOTS,
  buildEtapaEvents, etapaTime, isMajorSplit, majorIdOf, majorTime, rmrIdOf, rmrRegionOf, teamMacroRegion,
  seasonCalendarFrom, calendarFresh, eventHost,
  type EtapaEvent, type MajorRoute, type RmrRegion,
} from './circuito';
import { computeVrs, publishVrs, VRS_WINDOW, type VrsTable } from './vrs';
import { completeMajor, quickGslEvent, quickSwiss, seedRng, withEventForm, type MajorProgress, type MajorWorld, type QPlacement } from './mundoSim';
import { majorName } from '../../data/tournaments';
import { ct } from '../../state/career-i18n';

export const USER_ID = 'user';

/** (split, etapa) de um tempo absoluto (aceita negativo: a pré-história do mundo). */
export function splitEtapaOf(t: number): { split: number; etapa: number } {
  const ti = Math.floor(t);
  const split = Math.floor(ti / EVENTS_PER_SPLIT) + 1;
  const etapa = ((ti % EVENTS_PER_SPLIT) + EVENTS_PER_SPLIT) % EVENTS_PER_SPLIT + 1;
  return { split, etapa };
}

export function eventResult(
  meta: { id: string; name: string; tier: 1 | 2 | 3; kind: EventKind; lan: boolean; prize: number; split: number; t: number },
  placements: QPlacement[],
): WorldEventResult {
  return {
    eventId: meta.id, split: meta.split, name: meta.name, tier: meta.tier, kind: meta.kind, lan: meta.lan,
    prizePool: meta.prize, t: meta.t, field: placements.length,
    placements: [...placements].sort((a, b) => a.place - b.place).map((p) => ({ teamId: p.teamId, place: p.place })),
  };
}

// ─── Etapa: os eventos que você não joga ────────────────────────────────────
/**
 * Simula (modelo de força calibrado) os eventos da etapa, menos os de `skip`.
 * Determinístico por evento: o mesmo save mostra sempre o mesmo mundo.
 */
export function simulateEtapaWorld(events: EtapaEvent[], split: number, etapa: number, strengthOf: (id: string) => number, skip: ReadonlySet<string> = new Set()): WorldEventResult[] {
  const t = etapaTime(split, etapa);
  const out: WorldEventResult[] = [];
  for (const ev of events) {
    if (skip.has(ev.id) || ev.teams.length < 4) continue;
    const rng = seedRng(`etapa:${ev.id}`);
    const teams = withEventForm(rng, ev.teams.map((tm) => ({ id: tm.id, s: strengthOf(tm.id) })));
    const r = quickGslEvent(rng, teams);
    out.push(eventResult({ id: ev.id, name: ev.name, tier: ev.tier, kind: 'gsl', lan: ev.lan, prize: ev.prize, split, t }, r.placements));
  }
  return out;
}

// ─── O SEU evento (liga GSL + playoffs da Carreira) ─────────────────────────
interface LeagueLike { teams: { id: string }[]; gsl?: { place: Record<string, number> } }
interface MatchLike { a: string; b: string; result?: { winner: 0 | 1 } }
interface PlayoffLike { seeds: string[]; qf: MatchLike[] | null; sf: MatchLike[]; final: MatchLike | null; champion: string | null; runnerUp: string | null }
const loserOf = (m: MatchLike | null | undefined): string | null => (m?.result && m.a && m.b ? (m.result.winner === 0 ? m.b : m.a) : null);
/** Colocações do evento que você jogou: 1, 2, 3-4, 5-8 (playoffs), 9-12 / 13-16 (3º/4º do grupo). */
export function leaguePlacements(league: LeagueLike, playoff: PlayoffLike | null): QPlacement[] {
  const place = new Map<string, number>();
  if (playoff) {
    if (playoff.champion) place.set(playoff.champion, 1);
    if (playoff.runnerUp) place.set(playoff.runnerUp, 2);
    for (const m of playoff.sf) { const l = loserOf(m); if (l && !place.has(l)) place.set(l, 3); }
    for (const m of playoff.qf ?? []) { const l = loserOf(m); if (l && !place.has(l)) place.set(l, 5); }
    for (const id of playoff.seeds) if (!place.has(id)) place.set(id, playoff.qf ? 5 : 3);
  }
  for (const t of league.teams) {
    if (place.has(t.id)) continue;
    const gp = league.gsl?.place[t.id];
    place.set(t.id, gp === 3 ? 9 : gp === 4 ? 13 : 9);
  }
  return [...place.entries()].map(([teamId, p]) => ({ teamId, place: p }));
}

// ─── Poda: o save guarda o que o VRS precisa (janela) + o pódio do histórico ─
export const HISTORY_KEEP = 18; // etapas (~1,5 temporada) de pódio no histórico dos eventos
export function pruneResults(results: WorldEventResult[], now: number): WorldEventResult[] {
  const out: WorldEventResult[] = [];
  for (const r of results) {
    const age = now - (r.t ?? now);
    if (age > HISTORY_KEEP) continue;
    if (age >= VRS_WINDOW) {
      // fora da janela do VRS: só o pódio (+ você) — o histórico do evento
      const keep = r.placements.filter((p) => p.place <= 2 || p.teamId === USER_ID);
      out.push({ ...r, field: r.field ?? r.placements.length, placements: keep });
    } else out.push(r);
  }
  return out;
}

/** Fecha um momento do mundo: grava os resultados, poda e publica o VRS. */
export function closeWorld(m: MundoState, add: WorldEventResult[], now: number): { mundo: MundoState; table: VrsTable } {
  const ids = new Set(add.map((r) => r.eventId));
  const results = pruneResults([...m.results.filter((r) => !ids.has(r.eventId)), ...add], now);
  const table = computeVrs(results, now);
  const vrs = publishVrs(table, m.vrs);
  return { mundo: { ...m, results, vrs, vrsAt: now }, table };
}

// ─── Major: field pelo VRS, RMRs e o mundo do Major ─────────────────────────
export interface MajorFieldPlan extends MajorProgress { ranked: string[] }
/**
 * Field do Major a partir do ranking publicado: 1–8 Stage 3, 9–16 Stage 2,
 * 17–24 Stage 1; os próximos de cada região (até 16) disputam o RMR dela.
 * Sem ranking suficiente, completa pela força.
 */
export function majorFieldFromVrs(vrs: Record<string, VrsEntry>, pool: TeamSeason[], user?: { region: MacroRegion | null | undefined } | null): MajorFieldPlan {
  const byId = new Map(pool.map((t) => [t.id, t]));
  const ids = [...pool.map((t) => t.id), ...(user ? [USER_ID] : [])];
  const pts = (id: string) => vrs[id]?.points ?? 0;
  const tw = (id: string) => byId.get(id)?.teamwork ?? 0;
  const ranked = [...new Set(ids)].sort((a, b) => pts(b) - pts(a) || tw(b) - tw(a));
  const regionOf = (id: string): RmrRegion => (id === USER_ID ? rmrRegionOf(user?.region) : rmrRegionOf(teamMacroRegion(byId.get(id)!)));
  const rest = ranked.slice(MAJOR_S1);
  const rmr: MajorProgress['rmr'] = {};
  for (const reg of RMR_REGIONS) rmr[reg] = { field: rest.filter((id) => regionOf(id) === reg).slice(0, RMR_FIELD) };
  return { ranked, s3: ranked.slice(0, MAJOR_S3), s2: ranked.slice(MAJOR_S3, MAJOR_S2), s1Invites: ranked.slice(MAJOR_S2, MAJOR_S1), rmr };
}
/** Sua rota ao Major pelo ranking: Stage 3/2/1 direto, RMR da sua região ou fora. */
export function majorRouteOf(plan: MajorFieldPlan, id = USER_ID): MajorRoute {
  const i = plan.ranked.indexOf(id);
  if (i >= 0 && i < MAJOR_S3) return { kind: 'stage', stage: 3 };
  if (i >= 0 && i < MAJOR_S2) return { kind: 'stage', stage: 2 };
  if (i >= 0 && i < MAJOR_S1) return { kind: 'stage', stage: 1 };
  for (const reg of RMR_REGIONS) if (plan.rmr[reg]?.field.includes(id)) return { kind: 'rmr', region: reg };
  return { kind: 'out' };
}
/** Resolve (modelo calibrado) os RMRs que ainda não têm ordem final — o Stage 1 precisa dos classificados. */
export function resolveRmrs(plan: MajorFieldPlan, strengthOf: (id: string) => number, seedKey: string): MajorFieldPlan {
  const rmr = { ...plan.rmr };
  for (const reg of RMR_REGIONS) {
    const r = rmr[reg];
    if (!r || r.order || r.field.length < 2) continue;
    const rng = seedRng(`rmr:${seedKey}:${reg}`);
    rmr[reg] = { ...r, order: quickSwiss(rng, withEventForm(rng, r.field.map((id) => ({ id, s: strengthOf(id) })))).order };
  }
  return { ...plan, rmr };
}
/** Os classificados dos RMRs (na ordem Europa, Américas, Ásia-Pacífico). */
export function rmrQualifiedIds(plan: MajorProgress): string[] {
  return RMR_REGIONS.flatMap((reg) => plan.rmr[reg]?.order?.slice(0, RMR_SLOTS[reg]) ?? []);
}

/** Resultados do Major (RMRs + Major) pro mundo. */
export function majorResults(split: number, w: MajorWorld): WorldEventResult[] {
  const name = majorName(split);
  const t = majorTime(split);
  const out: WorldEventResult[] = [];
  for (const reg of RMR_REGIONS) {
    const pl = w.rmr[reg];
    if (!pl?.length) continue;
    out.push(eventResult({ id: rmrIdOf(split, reg), name: `${name} · RMR ${RMR_LABEL[reg]}`, tier: 1, kind: 'rmr', lan: true, prize: RMR_POOL, split, t: t - 0.25 }, pl));
  }
  if (w.major.length) out.push(eventResult({ id: majorIdOf(split), name, tier: 1, kind: 'major', lan: true, prize: MAJOR_POOL, split, t }, w.major));
  return out;
}

// ─── Manchetes do mundo (caixa de entrada) ──────────────────────────────────
export interface WorldHeadline { id: string; icon: string; tone: 'good' | 'bad' | 'info'; title: string; body: string }
/**
 * No máximo 3 por etapa: campeões tier 1, um resumo do tier 2 e a zebra (campeão
 * que não estava entre os favoritos do field). `favorites` = ids em ordem de força.
 */
export function worldHeadlines(results: WorldEventResult[], split: number, tagOf: (id: string) => string, strengthRank?: (eventId: string, teamId: string) => number): WorldHeadline[] {
  const out: WorldHeadline[] = [];
  const champ = (r: WorldEventResult) => r.placements.find((p) => p.place === 1)?.teamId;
  const runner = (r: WorldEventResult) => r.placements.find((p) => p.place === 2)?.teamId;
  const major = results.find((r) => r.kind === 'major');
  if (major && champ(major) && champ(major) !== USER_ID) {
    const c = champ(major)!, ru = runner(major);
    out.push({
      id: `${split}:world:major`, icon: '🏆', tone: 'info',
      title: `${tagOf(c)} ${ct('é campeã do')} ${major.name}`,
      body: `${ct('Final contra')} ${ru ? tagOf(ru) : '—'}. ${ct('O título do Major vale o maior bounty do VRS da temporada.')}`,
    });
  }
  const t1 = results.filter((r) => r.tier === 1 && r.kind === 'gsl' && champ(r) && champ(r) !== USER_ID);
  for (const r of t1.slice(0, 2)) {
    const c = champ(r)!, ru = runner(r);
    const rank = strengthRank?.(r.eventId, c) ?? 0;
    const upset = rank >= 6;
    out.push({
      id: `${split}:world:${r.eventId}`, icon: upset ? '💥' : '🏆', tone: 'info',
      title: upset ? `${ct('Zebra:')} ${tagOf(c)} ${ct('vence a')} ${r.name}` : `${tagOf(c)} ${ct('vence a')} ${r.name}`,
      body: `${ct('Final contra')} ${ru ? tagOf(ru) : '—'}${r.lan ? ` ${ct('diante do público, na LAN')}` : ''}. ${upset ? ct('Ninguém apostava neles: o ranking VRS vai sentir.') : ct('Pontos pesados no ranking VRS.')}`,
    });
  }
  const t2 = results.filter((r) => r.tier === 2 && champ(r) && champ(r) !== USER_ID);
  if (t2.length) {
    out.push({
      id: `${split}:world:t2:${t2[0].eventId}`, icon: '🌐', tone: 'info',
      title: `${ct('Tier 2:')} ${t2.map((r) => `${tagOf(champ(r)!)} (${r.name})`).join(' · ')}`,
      body: ct('Os campeões do segundo escalão sobem no ranking e batem na porta dos convites do tier 1.'),
    });
  }
  return out.slice(0, 3);
}

// ─── Semeadura: o mundo nasce com passado ───────────────────────────────────
export interface UserRecordSeed {
  t: number; name: string; tier: 1 | 2 | 3; place: number; lan?: boolean; prize?: number;
  /** o Major deste split (save migrado): split do Major e a sua colocação real nele */
  major?: { split: number; place: number };
}

/**
 * Enxerta `teamId` num resultado na colocação `place` EMPURRANDO quem estava
 * dali pra baixo: as vagas de colocação do evento (1, 2, 3, 3, 5…) ficam as
 * mesmas, cada time a partir da sua desce uma vaga e o último sai (o field não
 * cresce). Um só campeão: quem venceu na simulação vira vice. Puro.
 */
export function graftPlacement(placements: readonly QPlacement[], teamId: string, place: number): QPlacement[] {
  const rest = [...placements].filter((p) => p.teamId !== teamId).sort((a, b) => a.place - b.place);
  const slots = [...placements].map((p) => p.place).sort((a, b) => a - b);
  if (!slots.length) return [{ teamId, place }];
  let k = slots.findIndex((x) => x >= place);
  if (k < 0) k = slots.length - 1; // pior que todos: fica na última vaga
  const order = [...rest.slice(0, k), { teamId, place: slots[k] }, ...rest.slice(k)].slice(0, slots.length);
  return order.map((p, i) => ({ teamId: p.teamId, place: slots[i] }));
}

/**
 * Pré-história do mundo (as 6 etapas antes de `now`, com o Major que caiu nelas)
 * pelo modelo calibrado. `takeoverId` (time real que você assumiu) vira 'user'
 * nos resultados — você herda a posição da org. `userRecords` (save migrado)
 * põe os seus resultados reais das últimas etapas nos eventos da época (e a sua
 * colocação real no Major da janela).
 */
export function seedWorld(opts: {
  pool: TeamSeason[];
  strengthOf: (id: string) => number;
  now: number;
  takeoverId?: string | null;
  userRegion?: MacroRegion | null;
  userRecords?: UserRecordSeed[];
}): { results: WorldEventResult[]; vrs: Record<string, VrsEntry>; vrsAt: number } {
  const { pool, strengthOf, now } = opts;
  let results: WorldEventResult[] = [];
  let vrs: Record<string, VrsEntry> = {};
  for (let t = now - VRS_WINDOW; t < now; t++) {
    const { split, etapa } = splitEtapaOf(t);
    const events = buildEtapaEvents(pool, split, etapa, vrs);
    results.push(...simulateEtapaWorld(events, split, etapa, strengthOf));
    if (etapa === EVENTS_PER_SPLIT && isMajorSplit(split)) {
      vrs = publishVrs(computeVrs(results, t));
      const plan = majorFieldFromVrs(vrs, pool, null);
      results.push(...majorResults(split, completeMajor(plan, strengthOf, `seed:${split}`)));
    }
    vrs = publishVrs(computeVrs(results, t), vrs);
  }
  if (opts.takeoverId) {
    results = results.map((r) => ({ ...r, placements: r.placements.map((p) => (p.teamId === opts.takeoverId ? { ...p, teamId: USER_ID } : p)) }));
  }
  // resultados reais do save migrado: você entra no evento de mesmo nome da época
  // (ou no do tier) NA SUA COLOCAÇÃO, empurrando quem estava dali pra baixo (um
  // só campeão); sem evento compatível, vira um evento só seu
  for (const rec of opts.userRecords ?? []) {
    const cands = results.filter((r) => r.t === rec.t && r.kind === 'gsl');
    const target = cands.find((r) => r.name === rec.name) ?? cands.find((r) => r.tier === rec.tier);
    if (target && !target.placements.some((p) => p.teamId === USER_ID)) {
      target.placements = graftPlacement(target.placements, USER_ID, rec.place);
    } else if (!target) {
      const { split } = splitEtapaOf(rec.t);
      results.push({
        eventId: `hist:${rec.t}`, split, name: rec.name, tier: rec.tier, kind: 'gsl', lan: !!rec.lan, prizePool: rec.prize ?? 15_000,
        t: rec.t, field: 16, placements: [{ teamId: USER_ID, place: rec.place }],
      });
    }
    // o Major que você jogou de verdade: a sua colocação real no Major da janela
    const mj = rec.major && results.find((r) => r.kind === 'major' && r.split === rec.major!.split);
    if (mj && !mj.placements.some((p) => p.teamId === USER_ID)) {
      mj.placements = graftPlacement(mj.placements, USER_ID, rec.major!.place);
    }
  }
  results = pruneResults(results, now - 1);
  // o Major da janela acontece meia etapa depois da última etapa (majorTime): se
  // ele já passou, o ranking semeado é publicado depois dele (senão o campeão só
  // contava no primeiro fechamento de etapa)
  const at = Math.max(now - 1, ...results.map((r) => r.t ?? -Infinity).filter((t) => t < now));
  return { results, vrs: publishVrs(computeVrs(results, at)), vrsAt: at };
}

/** Colocação no Major (PlacementCode da Carreira) → colocação no resultado do mundo. */
export const MAJOR_PLACE: Record<string, number> = { champion: 1, runnerup: 2, semi: 3, quarters: 5, playoffs: 9, swiss: 17 };

/**
 * Converte o histórico da Carreira (SplitRecord: um por etapa jogada) nos seus
 * resultados das últimas etapas antes de `now` (mais recente = now − 1). A etapa
 * que fechou com o Major carrega a sua colocação real nele.
 */
export function userRecordsFromHistory(
  history: { split?: number; circuit: string; position: number; major?: { placement?: string } | null }[],
  now: number,
  tierOf: (name: string) => 1 | 2 | 3,
): UserRecordSeed[] {
  const out: UserRecordSeed[] = [];
  const recent = history.slice(-VRS_WINDOW).reverse();
  recent.forEach((h, i) => {
    const tier = tierOf(h.circuit);
    const host = eventHost(h.circuit, tier);
    const pos = Math.max(1, Math.round(h.position || 9));
    const place = pos === 1 ? 1 : pos === 2 ? 2 : pos <= 4 ? 3 : pos <= 8 ? 5 : pos <= 12 ? 9 : 13;
    const t = now - 1 - i;
    const mPlace = h.major?.placement ? MAJOR_PLACE[h.major.placement] : undefined;
    const mSplit = h.split ?? splitEtapaOf(t).split;
    out.push({ t, name: h.circuit, tier, place, lan: host.lan, ...(mPlace ? { major: { split: mSplit, place: mPlace } } : {}) });
  });
  return out;
}

/** Calendário em dia com o split (renova a cada split; idempotente). */
export function withFreshCalendar(m: MundoState, split: number): MundoState {
  return calendarFresh(m.calendar, split) ? m : { ...m, calendar: seasonCalendarFrom(split) };
}

// ─── Integração J × K × L ───────────────────────────────────────────────────
/**
 * Grava no resultado o nome (tag) de quem não é da base oficial — times de uma
 * base customizada (editor). Se a base some ou o time sai do mundo, o histórico
 * continua legível. Só quem precisa ganha nome (save enxuto).
 */
export function nameUnofficialTeams(rs: WorldEventResult[], isOfficial: (id: string) => boolean, tagOf: (id: string) => string): WorldEventResult[] {
  return rs.map((r) => {
    const extra = r.placements.filter((p) => p.teamId !== USER_ID && !isOfficial(p.teamId) && !r.names?.[p.teamId]);
    if (!extra.length) return r;
    return { ...r, names: { ...(r.names ?? {}), ...Object.fromEntries(extra.map((p) => [p.teamId, tagOf(p.teamId)])) } };
  });
}
/** Tag guardada num resultado (time que já não está no mundo). */
export function storedTagOf(results: readonly WorldEventResult[] | undefined, id: string): string | null {
  for (const r of results ?? []) { const n = r.names?.[id]; if (n) return n; }
  return null;
}
/** O bloco `mundo` é de três frentes: os campos do circuito (J) por cima do resto (K: jovens/aposentados; L: base). */
export function withCircuit<M extends MundoState>(base: M, circ: MundoState): M {
  return {
    ...base, calendar: circ.calendar, results: circ.results, vrs: circ.vrs, vrsAt: circ.vrsAt,
    visa: circ.visa ?? null, qualifiers: circ.qualifiers ?? {}, bootcamp: circ.bootcamp ?? null,
  };
}
