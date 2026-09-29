// [fase 4 · frente CIRCUITO] O circuito real da Carreira.
//
//   - CALENDÁRIO por temporada (4 splits × 3 etapas + o ciclo do Major): em cada
//     etapa correm, ao mesmo tempo, oito eventos reais de tiers S/A/B (1/2/3) —
//     dois tier 1, dois tier 2 e quatro tier 3 (mundial + três regionais). Os
//     tier 1 têm QUALIFICATÓRIO FECHADO (convite pelo VRS pra disputar a vaga),
//     os tier 2 têm QUALIFICATÓRIO ABERTO. No split de Major: RMRs regionais
//     (Europa, Américas, Ásia-Pacífico) → Major com Stage 1/2/3 suíço + playoffs.
//   - FIELD de cada etapa: faixa de força do tier (a mesma régua de antes, pra a
//     dificuldade não mudar) com os CONVITES diretos saindo do ranking VRS.
//   - LAN × online (sede real do evento), visto (chance pequena de negação por
//     região → stand-in), bootcamp antes de LAN grande e as pausas do calendário.
//
// Puro (sem React): a Carreira chama daqui, os testes e as medições também.

import type { CalendarEvent, EventKind, MundoState, WorldEventResult, VrsEntry } from './model';
import type { MacroRegion } from '../../data/regions';
import { macroRegionOf, macroRegionPlurality } from '../../data/regions';
import type { TeamSeason } from '../../types';
import {
  eventMeta, venueHost, majorName, t1EventName, t2EventName, t3EventName, t3RegionalEventName,
} from '../../data/tournaments';
import { hashStr } from '../../state/hash';

// ─── Relógio do circuito ───────────────────────────────────────────────────
export const EVENTS_PER_SPLIT = 3;   // etapas por split (cada uma = um campeonato)
export const MAJOR_EVERY = 4;        // o split de Major fecha a temporada
export const WEEKS_PER_ETAPA = 5;    // semana 1 = qualificatórios · 2-4 = grupos · 5 = playoffs
export const isMajorSplit = (split: number): boolean => split % MAJOR_EVERY === 0;
export const seasonOfSplit = (split: number): number => Math.max(1, Math.ceil(Math.max(1, split) / MAJOR_EVERY));
export const seasonSplits = (season: number): number[] => Array.from({ length: MAJOR_EVERY }, (_, i) => (season - 1) * MAJOR_EVERY + i + 1);
/** Tempo absoluto de uma etapa, em "etapas" (≈ 1 mês): a idade de um resultado no VRS. */
export const etapaTime = (split: number, etapa: number): number => (split - 1) * EVENTS_PER_SPLIT + (Math.max(1, etapa) - 1);
/** O Major acontece depois da etapa 3 do split de Major. */
export const majorTime = (split: number): number => etapaTime(split, EVENTS_PER_SPLIT) + 0.5;
/** semana do split em que a etapa começa (qualificatórios) */
export const etapaWeek = (etapa: number): number => (Math.max(1, etapa) - 1) * WEEKS_PER_ETAPA + 1;
export const RMR_WEEK = EVENTS_PER_SPLIT * WEEKS_PER_ETAPA + 1;   // 16
export const MAJOR_WEEK = RMR_WEEK + 1;                           // 17 (Stage 1) … 20 (playoffs)
/** semana da pausa no fim do split */
export const splitBreakWeek = (split: number): number => (isMajorSplit(split) ? MAJOR_WEEK + 4 : EVENTS_PER_SPLIT * WEEKS_PER_ETAPA + 1);

// ─── Os oito eventos de cada etapa ─────────────────────────────────────────
export type SlotId = 't1' | 't1-alt' | 't2' | 't2-alt' | 't3' | 't3-sa' | 't3-eu' | 't3-asia';
export type SlotRegion = 'global' | 'sa' | 'eu' | 'asia';
export interface SlotDef {
  id: SlotId;
  tier: 1 | 2 | 3;
  region: SlotRegion;
  spots: number;          // (legado) vagas exibidas
  prizeMult: number;      // multiplicador do prêmio em caixa (economia da Carreira — intacta)
  qualifier?: 'closed' | 'open';
}
export const SLOTS: SlotDef[] = [
  { id: 't1', tier: 1, region: 'global', spots: 2, prizeMult: 1.8, qualifier: 'closed' },
  { id: 't1-alt', tier: 1, region: 'global', spots: 1, prizeMult: 1.6, qualifier: 'closed' },
  { id: 't2', tier: 2, region: 'global', spots: 2, prizeMult: 1, qualifier: 'open' },
  { id: 't2-alt', tier: 2, region: 'global', spots: 1, prizeMult: 0.9, qualifier: 'open' },
  { id: 't3', tier: 3, region: 'global', spots: 1, prizeMult: 0.6 },
  { id: 't3-sa', tier: 3, region: 'sa', spots: 1, prizeMult: 0.55 },
  { id: 't3-eu', tier: 3, region: 'eu', spots: 1, prizeMult: 0.55 },
  { id: 't3-asia', tier: 3, region: 'asia', spots: 1, prizeMult: 0.5 },
];
export const slotDef = (id: string): SlotDef | undefined => SLOTS.find((s) => s.id === id);
export const SLOT_REGION_MACRO: Record<SlotRegion, MacroRegion | 'global'> = { global: 'global', sa: 'americas', eu: 'europe', asia: 'asia' };

/** Nome real do evento do slot na etapa (a mesma rotação de sempre dos pools de data/tournaments.ts). */
export function slotName(slot: SlotId, split: number, etapa: number): string {
  switch (slot) {
    case 't1': return t1EventName(split, etapa);
    case 't1-alt': return t1EventName(split, etapa + 7);
    case 't2': return t2EventName(split, etapa);
    case 't2-alt': return t2EventName(split, etapa + 5);
    case 't3': return t3EventName(split, etapa);
    case 't3-sa': return t3RegionalEventName(split, etapa, 'sa');
    case 't3-eu': return t3RegionalEventName(split, etapa, 'eu');
    case 't3-asia': return t3RegionalEventName(split, etapa, 'asia');
  }
}
export const eventIdOf = (split: number, etapa: number, slot: string): string => `ev:${split}:${etapa}:${slot}`;
export const qualifierIdOf = (split: number, etapa: number, slot: string): string => `q:${split}:${etapa}:${slot}`;
export const majorIdOf = (split: number): string => `major:${split}`;
export const rmrIdOf = (split: number, region: RmrRegion): string => `rmr:${split}:${region}`;
/** Decompõe um id de evento do circuito (ev/q/major/rmr); null se não for. */
export function parseEventId(id: string): { kind: 'ev' | 'q' | 'major' | 'rmr'; split: number; etapa?: number; slot?: string; region?: RmrRegion } | null {
  const p = id.split(':');
  if ((p[0] === 'ev' || p[0] === 'q') && p.length === 4) return { kind: p[0], split: +p[1], etapa: +p[2], slot: p[3] };
  if (p[0] === 'major' && p.length === 2) return { kind: 'major', split: +p[1] };
  if (p[0] === 'rmr' && p.length === 3) return { kind: 'rmr', split: +p[1], region: p[2] as RmrRegion };
  return null;
}

// ─── LAN × online ──────────────────────────────────────────────────────────
// A sede real decide: evento com cidade-sede é LAN, "online" é online. Tier 3 é
// quase sempre online; qualificatório é SEMPRE online; RMR e Major são LAN.
export function eventHost(name: string, tier: number): { venue: string; cc: string | null; lan: boolean } {
  const m = eventMeta(name, tier);
  const h = venueHost(m.venue);
  return { venue: m.venue, cc: h.cc, lan: h.lan };
}
/**
 * Peso do oculto bigMatch (pressão) no motor v2: online 0; LAN pequeno; Major um
 * pouco mais; a final MD5 continua sendo jogo grande (1). Calibrado em
 * scripts/test-circuito-lan.mts (efeito pequeno; time médio não muda).
 */
export const LAN_PRESSURE = 0.35;
export const MAJOR_PRESSURE = 0.5;
export const pressureFor = (ev: { lan?: boolean; kind?: EventKind } | null | undefined): number =>
  !ev?.lan ? 0 : ev.kind === 'major' || ev.kind === 'rmr' ? MAJOR_PRESSURE : LAN_PRESSURE;

// ─── Premiação real (o VRS usa o dinheiro real do evento, como o da Valve) ──
export { shareOf as prizeShare } from './vrs';
export const MAJOR_POOL = 1_250_000;
export const RMR_POOL = 100_000;

// ─── Ciclo do Major ────────────────────────────────────────────────────────
export type RmrRegion = 'europe' | 'americas' | 'asia';
export const RMR_REGIONS: RmrRegion[] = ['europe', 'americas', 'asia'];
/** vagas no Stage 1 do Major por RMR (Europa + CIS / Américas / Ásia-Pacífico) */
export const RMR_SLOTS: Record<RmrRegion, number> = { europe: 4, americas: 2, asia: 2 };
export const RMR_LABEL: Record<RmrRegion, string> = { europe: 'Europa', americas: 'Américas', asia: 'Ásia-Pacífico' };
export const rmrRegionOf = (r: MacroRegion | null | undefined): RmrRegion =>
  r === 'americas' ? 'americas' : r === 'asia' || r === 'oceania' || r === 'africa' ? 'asia' : 'europe';
/** ranking VRS → rota ao Major: Stage 3 (1–8), Stage 2 (9–16), Stage 1 (17–24), RMR, fora */
export const MAJOR_S3 = 8;
export const MAJOR_S2 = 16;
export const MAJOR_S1 = 24;
export const RMR_FIELD = 16;
export type MajorRoute = { kind: 'stage'; stage: 1 | 2 | 3 } | { kind: 'rmr'; region: RmrRegion } | { kind: 'out' };

const stripUndef = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined || o[k] === null) delete o[k];
  return o;
};

// ─── Calendário da temporada ───────────────────────────────────────────────
/** Os eventos de UMA etapa (sem os times: o field é montado na hora). */
export function etapaCalendar(split: number, etapa: number): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const week = etapaWeek(etapa);
  for (const s of SLOTS) {
    const name = slotName(s.id, split, etapa);
    const host = eventHost(name, s.tier);
    const id = eventIdOf(split, etapa, s.id);
    if (s.qualifier) {
      out.push(stripUndef<CalendarEvent>({
        id: qualifierIdOf(split, etapa, s.id), name, tier: s.tier, kind: 'qualifier', lan: false,
        region: SLOT_REGION_MACRO[s.region], split, week, slots: s.qualifier === 'closed' ? 8 : 64,
        prize: 0, vrsWeight: 0, qualifiesTo: id, qualifier: s.qualifier, etapa, slot: s.id,
      }));
    }
    out.push(stripUndef<CalendarEvent>({
      id, name, tier: s.tier, kind: 'gsl', lan: host.lan, region: SLOT_REGION_MACRO[s.region], split,
      week: week + 1, slots: 16, prize: eventMeta(name, s.tier).prize, vrsWeight: s.tier === 1 ? 1 : s.tier === 2 ? 0.5 : 0.2,
      host: host.cc ?? undefined, etapa, slot: s.id,
    }));
  }
  return out;
}

/** Ciclo do Major (só no split de Major): três RMRs → Major (Stage 1/2/3 suíço + playoffs). */
export function majorCalendar(split: number): CalendarEvent[] {
  if (!isMajorSplit(split)) return [];
  const name = majorName(split);
  const host = eventHost(name, 1);
  const major = majorIdOf(split);
  return [
    ...RMR_REGIONS.map((r) => stripUndef<CalendarEvent>({
      id: rmrIdOf(split, r), name: `${name} · RMR ${RMR_LABEL[r]}`, tier: 1, kind: 'rmr', lan: true,
      region: r, split, week: RMR_WEEK, slots: RMR_FIELD, prize: RMR_POOL, vrsWeight: 0.6,
      qualifiesTo: major, host: host.cc ?? undefined,
    })),
    stripUndef<CalendarEvent>({
      id: major, name, tier: 1, kind: 'major', lan: true, region: 'global', split, week: MAJOR_WEEK,
      slots: 32, prize: MAJOR_POOL, vrsWeight: 1.5, host: host.cc ?? undefined,
    }),
  ];
}

/** Calendário completo da temporada (4 splits). Puro: mesma temporada ⇒ mesmo calendário. */
export function buildSeasonCalendar(season: number): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const split of seasonSplits(season)) {
    for (let e = 1; e <= EVENTS_PER_SPLIT; e++) out.push(...etapaCalendar(split, e));
    out.push(...majorCalendar(split));
  }
  return out;
}

/**
 * O que fica gravado em `mundo.calendar`: a agenda do SPLIT CORRENTE (os 8
 * eventos de cada etapa + os qualificatórios) e o ciclo do Major da temporada
 * (RMRs + Major — a rota que o jogador persegue). A temporada inteira é função
 * pura (buildSeasonCalendar): as telas regeneram. Save enxuto (~8 KB).
 */
export function seasonCalendarFrom(split: number): CalendarEvent[] {
  const season = seasonOfSplit(split);
  const majorSplit = seasonSplits(season).find(isMajorSplit) ?? split;
  const out: CalendarEvent[] = [];
  for (let e = 1; e <= EVENTS_PER_SPLIT; e++) out.push(...etapaCalendar(split, e));
  out.push(...majorCalendar(majorSplit));
  return out;
}
/** O calendário gravado está em dia com este split? (renova a cada split) */
export function calendarFresh(calendar: CalendarEvent[] | undefined, split: number): boolean {
  if (!calendar?.length) return false;
  return calendar.some((e) => e.split === split && e.kind === 'gsl') && calendar.every((e) => e.split === split || e.kind === 'major' || e.kind === 'rmr')
    && calendar.filter((e) => e.kind === 'major').every((e) => seasonOfSplit(e.split) === seasonOfSplit(split));
}
/** Sede de um evento do calendário (o gravado não carrega o texto da sede). */
export function calendarVenue(ev: Pick<CalendarEvent, 'name' | 'tier' | 'kind' | 'split'>): { venue: string; cc: string | null; lan: boolean } {
  if (ev.kind === 'qualifier') return { venue: 'online 🌐', cc: null, lan: false };
  return ev.kind === 'major' || ev.kind === 'rmr' ? eventHost(majorName(ev.split), 1) : eventHost(ev.name, ev.tier);
}

// ─── Field de cada etapa ───────────────────────────────────────────────────
// Faixas de FORÇA por tier (índice no ranking de força — a MESMA régua de antes:
// o Tier-1 sai só da elite, o Tier-3 só do acesso; a dificuldade não muda).
// Dentro da faixa, os CONVITES diretos são os melhores do ranking VRS (antes, o
// núcleo fixo era "os mais fortes"); as outras vagas saem do qualificatório.
export interface EtapaEvent {
  slot: SlotId;
  id: string;
  name: string;
  teams: TeamSeason[];
  invited: string[];      // convites diretos (VRS); o resto veio do qualificatório
  spots: number;
  prizeMult: number;
  vrsWeight: number;      // força média do field no VRS publicado (exibição)
  tier: 1 | 2 | 3;
  region: SlotRegion;
  lan: boolean;
  venue: string;
  host: string | null;
  prize: number;          // prize pool real (USD)
}

/** Embaralhamento determinístico (Fisher-Yates com semente) — o mesmo de antes. */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = hashStr(`${seed}:${i}`) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const SA_COUNTRIES = new Set(['br', 'ar', 'cl', 'pe', 'uy', 'co', 'ec', 'bo', 'py', 've', 'mx']);
const EU_COUNTRIES = new Set(['de', 'fr', 'gb', 'es', 'it', 'pl', 'dk', 'se', 'fi', 'no', 'nl', 'be', 'at', 'cz', 'ro', 'hu', 'bg', 'pt', 'ie', 'ch', 'sk', 'rs', 'hr', 'si', 'ba', 'mk', 'al', 'gr', 'md', 'is', 'lu', 'mt', 'ee', 'lv', 'lt']);
const ASIA_COUNTRIES = new Set(['cn', 'jp', 'kr', 'mn', 'vn', 'th', 'id', 'ph', 'my', 'sg', 'in', 'pk', 'tw', 'hk', 'kz', 'uz', 'tr']);

/** Peso do field antes do mundo ter VRS (a régua antiga: força média do elenco). */
function legacyFieldWeight(teams: TeamSeason[]): number {
  const core = (tw: number) => Math.max(0, tw - 61) * 25 + Math.pow(Math.max(0, tw - 82), 2) * 10;
  const favg = teams.reduce((a, t) => a + core(t.teamwork), 0) / Math.max(1, teams.length);
  return Math.max(0.08, Math.min(1.25, (favg - 250) / 450));
}

/**
 * Os eventos da etapa com o field de cada um. `pool` = times da IA disputáveis
 * (sem o usuário). `vrs` = ranking publicado (convites); sem VRS (mundo ainda não
 * semeado) o núcleo é o de antes, por força.
 */
export function buildEtapaEvents(pool: TeamSeason[], split: number, etapa: number, vrs?: Record<string, VrsEntry> | null): EtapaEvent[] {
  const byStrength = [...pool].sort((a, b) => b.teamwork - a.teamwork);
  const pts = (id: string) => vrs?.[id]?.points ?? 0;
  const hasVrs = !!vrs && Object.keys(vrs).length > 0;
  const used = new Set<string>();
  const invitedOf = new Map<string, string[]>();
  const byVrsDesc = (a: TeamSeason, b: TeamSeason) => pts(b.id) - pts(a.id) || b.teamwork - a.teamwork;
  const bandField = (key: SlotId, lo: number, hi: number, coreN: number, n: number, seed: number, rotBy: number): TeamSeason[] => {
    const band = byStrength.slice(lo, hi).filter((t) => !used.has(t.id));
    const core = (hasVrs ? [...band].sort(byVrsDesc) : band).slice(0, coreN);
    const coreIds = new Set(core.map((t) => t.id));
    const windowPart = band.filter((t) => !coreIds.has(t.id));
    const off = windowPart.length ? (((rotBy % windowPart.length) + windowPart.length) % windowPart.length) : 0;
    const rotatedWindow = [...windowPart.slice(off), ...windowPart.slice(0, off)];
    const rot = seededShuffle(rotatedWindow, seed).slice(0, Math.max(0, n - core.length));
    const field = [...core, ...rot];
    for (const t of field) used.add(t.id);
    invitedOf.set(key, core.map((t) => t.id));
    return field;
  };
  const bandFieldRegional = (key: SlotId, lo: number, hi: number, n: number, seed: number, countrySet: Set<string>): TeamSeason[] => {
    const band = byStrength.slice(lo, hi).filter((t) => !used.has(t.id) && countrySet.has(t.country.toLowerCase()));
    const picked = seededShuffle(band, seed).slice(0, n);
    for (const t of picked) used.add(t.id);
    // regionais tier 3 são abertos: convite = os 4 melhores do VRS entre eles
    invitedOf.set(key, [...picked].sort(byVrsDesc).slice(0, 4).map((t) => t.id));
    return picked;
  };
  const evSeed = etapa * 7;
  const evRot = (etapa - 1) * 4;
  // mesma ordem de montagem de antes (os campos são disjuntos e dependem dela)
  const fields: Partial<Record<SlotId, TeamSeason[]>> = {};
  fields.t1 = bandField('t1', 0, 24, 9, 15, split * 101 + 1 + evSeed, evRot);
  fields.t2 = bandField('t2', 15, 42, 9, 15, split * 101 + 2 + evSeed, evRot + 1);
  fields.t3 = bandField('t3', 34, 80, 9, 15, split * 101 + 3 + evSeed, evRot + 2);
  fields['t1-alt'] = bandField('t1-alt', 8, 28, 4, 15, split * 101 + 21 + evSeed, evRot + 3);
  fields['t2-alt'] = bandField('t2-alt', 20, 50, 4, 15, split * 101 + 22 + evSeed, evRot + 5);
  fields['t3-sa'] = bandFieldRegional('t3-sa', 30, 95, 15, split * 101 + 31, SA_COUNTRIES);
  fields['t3-eu'] = bandFieldRegional('t3-eu', 30, 95, 15, split * 101 + 32, EU_COUNTRIES);
  fields['t3-asia'] = bandFieldRegional('t3-asia', 30, 95, 15, split * 101 + 33, ASIA_COUNTRIES);
  const out: EtapaEvent[] = [];
  for (const s of SLOTS) {
    const teams = (fields[s.id] ?? []).slice(0, 15);
    if (teams.length < 5) continue;
    const name = slotName(s.id, split, etapa);
    const host = eventHost(name, s.tier);
    const avg = teams.reduce((a, t) => a + pts(t.id), 0) / teams.length;
    out.push({
      slot: s.id, id: eventIdOf(split, etapa, s.id), name, teams, invited: invitedOf.get(s.id) ?? [],
      spots: s.spots, prizeMult: s.prizeMult,
      vrsWeight: hasVrs ? Math.max(0.08, Math.min(1.6, avg / 1200)) : legacyFieldWeight(teams),
      tier: s.tier, region: s.region, lan: host.lan, venue: host.venue, host: host.cc, prize: eventMeta(name, s.tier).prize,
    });
  }
  return out;
}

// ─── Rota do usuário: direto, convite, qualificatório fechado/aberto, abaixo ─
export type EntryRoute = 'direct' | 'invite' | 'closed' | 'open' | 'below' | 'locked';
/** Corte do ranking VRS pra CONVITE direto num evento um tier acima do seu. */
export const INVITE_RANK: Record<1 | 2, number> = { 1: 20, 2: 44 };
/** Corte do ranking VRS pra disputar o qualificatório FECHADO (tier 1). */
export const CLOSED_QUALI_RANK = 48;
export function entryRoute(eventTier: number, playerTier: number, worldRank: number): EntryRoute {
  if (eventTier === playerTier) return 'direct';
  if (eventTier === playerTier + 1) return 'below';
  if (eventTier === playerTier - 1) {
    if (worldRank > 0 && worldRank <= INVITE_RANK[eventTier as 1 | 2]) return 'invite';
    if (eventTier === 1) return worldRank > 0 && worldRank <= CLOSED_QUALI_RANK ? 'closed' : 'locked';
    return 'open';
  }
  return 'locked';
}
/** Séries do qualificatório: fechado = 1 série MD3; aberto = MD1 + MD3 (as duas pra passar). */
export function qualifierPlan(route: 'closed' | 'open'): { bo: 1 | 3 }[] {
  return route === 'closed' ? [{ bo: 3 }] : [{ bo: 1 }, { bo: 3 }];
}
/**
 * Quem o usuário enfrenta no qualificatório: times logo abaixo da faixa do evento
 * que NÃO entraram no field (disputavam a mesma vaga). Determinístico; o último
 * adversário é o mais forte (a "final" do qualificatório).
 */
export function qualifierOpponents(ev: EtapaEvent, pool: TeamSeason[], route: 'closed' | 'open', seed: string): TeamSeason[] {
  const inField = new Set(ev.teams.map((t) => t.id));
  const floor = Math.min(...ev.teams.map((t) => t.teamwork));
  const cands = pool.filter((t) => !inField.has(t.id) && t.teamwork <= floor + 3 && t.players.length >= 5)
    .sort((a, b) => b.teamwork - a.teamwork).slice(0, 10);
  const picked = seededShuffle(cands, hashStr(seed)).slice(0, qualifierPlan(route).length);
  return picked.sort((a, b) => a.teamwork - b.teamwork);
}

// ─── Visto: chance pequena de negação por região → stand-in ─────────────────
// Probabilidade por jogador (região do jogador → região da sede). Mesma região = 0.
const VISA_RISK: Partial<Record<MacroRegion, Partial<Record<MacroRegion, number>>>> = {
  cis: { americas: 0.07, europe: 0.04, asia: 0.02, oceania: 0.05 },
  asia: { americas: 0.05, europe: 0.035, oceania: 0.03, cis: 0.02 },
  africa: { americas: 0.06, europe: 0.05, asia: 0.03, oceania: 0.05 },
  americas: { europe: 0.012, asia: 0.02, oceania: 0.015, cis: 0.02 },
  europe: { americas: 0.008, asia: 0.012, cis: 0.01, oceania: 0.01 },
  oceania: { americas: 0.01, europe: 0.008, asia: 0.012 },
};
export function visaRisk(playerCountry: string, hostCc: string | null | undefined): number {
  if (!hostCc) return 0;
  const cc = (playerCountry || '').toLowerCase();
  if (cc === hostCc.toLowerCase()) return 0;
  const from = macroRegionOf(cc);
  const to = macroRegionOf(hostCc);
  if (!from || !to || from === to) return 0;
  return VISA_RISK[from]?.[to] ?? 0.01;
}
/** Quem teve o visto negado pro evento (determinístico por evento × jogador; no máximo um). */
export function visaDenials(eventId: string, hostCc: string | null | undefined, players: { id: string; country: string }[]): string[] {
  if (!hostCc) return [];
  for (const p of players) {
    const r = visaRisk(p.country, hostCc);
    if (r > 0 && (hashStr(`visa:${eventId}:${p.id}`) % 10000) / 10000 < r) return [p.id];
  }
  return [];
}

// ─── Bootcamp antes de LAN grande ──────────────────────────────────────────
// Viajar antes e treinar perto da sede: custa (mais caro fora do continente),
// junta o grupo (+química entre os titulares, +familiaridade nos mapas do plano)
// e recupera moral/condição. Online não tem viagem, então não tem bootcamp.
export interface BootcampPlan { available: boolean; travel: boolean; cost: number; chem: number; familiarity: number; morale: number; recovery: number; reason?: 'online' }
export function bootcampPlan(ev: { lan?: boolean; tier?: number; host?: string | null; kind?: EventKind } | null | undefined, orgRegion: MacroRegion | null | undefined): BootcampPlan {
  if (!ev || !ev.lan) return { available: false, travel: false, cost: 0, chem: 0, familiarity: 0, morale: 0, recovery: 0, reason: 'online' };
  const hostReg = ev.host ? macroRegionOf(ev.host) : undefined;
  const travel = !!hostReg && !!orgRegion && hostReg !== orgRegion;
  const big = ev.kind === 'major' || ev.kind === 'rmr' || ev.tier === 1;
  const cost = (big ? 60_000 : 35_000) + (travel ? 40_000 : 0);
  return { available: true, travel, cost, chem: big ? 6 : 4, familiarity: big ? 5 : 3, morale: 5, recovery: 30 };
}

// ─── Pausas do calendário ──────────────────────────────────────────────────
export interface CalendarBreak { split: number; week: number; weeks: number; major: boolean; recovery: number }
/** Pausa no fim de cada split (a maior, depois do Major). A recuperação é a do fechamento do split. */
export function seasonBreaks(season: number): CalendarBreak[] {
  return seasonSplits(season).map((split) => ({
    split, week: splitBreakWeek(split), weeks: isMajorSplit(split) ? 3 : 1, major: isMajorSplit(split), recovery: 40,
  }));
}

/** Região (macro) de um time: onde está a maioria dos jogadores. */
export const teamMacroRegion = (t: { players: { country: string }[]; country?: string }): MacroRegion =>
  t.players.some((p) => macroRegionOf(p.country)) ? macroRegionPlurality(t.players.map((p) => p.country)) : (macroRegionOf(t.country ?? '') ?? 'europe');

// ─── Padrões do contrato (migração v30) ────────────────────────────────────
// O calendário depende só da temporada (dá pra gravar na migração). Resultados e
// VRS precisam da base de times (fora do bundle inicial): a Carreira semeia no
// primeiro render (mundoCarreira.seedMundo), como os contratos da fase 3.
export function defaultCalendar(save?: Record<string, unknown>): CalendarEvent[] {
  const split = typeof save?.split === 'number' ? save.split : 1;
  return seasonCalendarFrom(split);
}
export function defaultResults(_save?: Record<string, unknown>): WorldEventResult[] { return []; }
export function defaultVrs(_save?: Record<string, unknown>): Record<string, VrsEntry> { return {}; }

/** Bloco `mundo` com padrões (carreira nova criada já na v30 pode não ter o bloco). */
export function mundoOf(save: { mundo?: MundoState | null; split?: number }): MundoState {
  const m = save.mundo;
  if (m && m.v === 1) return m;
  return { v: 1, calendar: defaultCalendar({ split: save.split ?? 1 }), results: [], vrs: {}, newgens: {}, intake: [], databaseId: null };
}
