// [fase 3 · frente VESTIÁRIO] Dinâmica do elenco estilo FM. Puro, sem React.
//
//   - STATUS NO ELENCO (estrela … promessa) com expectativa de tempo de jogo;
//     jogar abaixo do esperado gera incômodo → pedido de conversa → pedido de
//     saída (a frente de mercado transforma em proposta/rumor via `wantsToLeave`).
//   - BANCO: o elenco tem até 7; `lineup.starters` (5) joga, o banco entra por
//     lesão (gestao/condicao.ts `substituteInjured`) ou por decisão sua. Sem
//     escalação salva, o motor usa os 5 primeiros do elenco, como sempre.
//   - HIERARQUIA E INFLUÊNCIA: liderança, tempo de casa, qualidade e status. Os
//     influentes arrastam a moral do grupo (pra cima ou pra baixo).
//   - GRUPOS SOCIAIS: idioma (line nacional × mista) e idade (veteranos × jovens).
//     Grupo coeso entrosa mais rápido (pairChem); jogador isolado sofre.
//   - FELICIDADE: os fatores novos do modelo único (career/happiness.ts).
//   - REUNIÕES DE EQUIPE, CONVERSAS com peso e CONFLITOS entre jogadores.
//
// Tudo determinístico (sementes por split/par) e neutro quando nada é
// configurado: elenco de 5, sem escalação salva, todos jogam tudo.

import type { Role } from '../../types';
import { hashStr } from '../../state/hash';
import type { AttrsSource } from '../attrs/model';
import { derivePersonality, type FmPersonality } from '../career/personality';
import type { PlayerPromise } from '../career/playerPromises';
import type { DressingRoomState, Lineup, SquadStatus, SocialGroupKey, TransferWindow, ClubeState } from './model';

// ─── constantes ────────────────────────────────────────────────────────────
export const STARTERS = 5;
export const SQUAD_MIN = 5;
export const SQUAD_MAX = 7;
export const BENCH_MAX = SQUAD_MAX - STARTERS;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const roll = (seed: string) => (hashStr(seed) % 10_000) / 10_000;
const pairOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function defaultDressingRoom(_save?: Record<string, unknown>): DressingRoomState {
  return { v: 1, status: {}, lineup: null, playTime: {}, meetings: [], conflicts: [], unrest: {}, lastPlayTime: {} };
}

type SaveWithClube = { clube?: Partial<ClubeState> | null; satisfaction?: Record<string, number>; morale?: Record<string, number> };

/** Vestiário do save (padrão quando o bloco ainda não existe). */
export function dressingOf(save: SaveWithClube | null | undefined): DressingRoomState {
  const d = save?.clube?.dressing;
  return d && d.v === 1 ? d : defaultDressingRoom();
}

// ─── jogador visto pelo vestiário ──────────────────────────────────────────
export interface VPlayer {
  id: string;
  nick: string;
  ovr: number;
  age: number;
  country: string;
  role: Role;          // função natural (base)
  role2?: Role;
  leadership: number;  // 1–20
  temperament: number; // 1–20 (oculto)
  professionalism: number;
  ambition: number;
  loyalty: number;
  fm: FmPersonality;
  tenure: number;      // splits no clube
}

export function toVPlayer(p: AttrsSource & { nick: string; country?: string }, ctx: { ovr: number; age: number; tenure: number }): VPlayer {
  const pp = derivePersonality({ ...p, age: ctx.age });
  return {
    id: p.id, nick: p.nick, ovr: ctx.ovr, age: ctx.age, country: (p.country ?? '').toLowerCase(),
    role: p.role, role2: p.role2,
    leadership: pp.leadership, temperament: pp.temperament, professionalism: pp.professionalism,
    ambition: pp.ambition, loyalty: pp.loyalty, fm: pp.fm, tenure: Math.max(0, ctx.tenure),
  };
}

// ─── status no elenco ──────────────────────────────────────────────────────
export const SQUAD_STATUSES: SquadStatus[] = ['star', 'key', 'starter', 'rotation', 'backup', 'prospect'];

export const STATUS_LABEL: Record<SquadStatus, string> = {
  star: 'Estrela', key: 'Importante', starter: 'Titular', rotation: 'Rotação', backup: 'Reserva', prospect: 'Promessa',
};

export const STATUS_DESC: Record<SquadStatus, string> = {
  star: 'O melhor do time: espera jogar praticamente todos os mapas.',
  key: 'Peça central: espera jogar quase sempre.',
  starter: 'Titular: espera jogar a maior parte dos mapas.',
  rotation: 'Rotação: aceita revezar, mas quer jogar com frequência.',
  backup: 'Reserva: sabe que joga pouco, entra quando precisa.',
  prospect: 'Promessa: jovem em formação, quer minutos aos poucos.',
};

// fração dos mapas disponíveis que o status promete
const EXPECTED: Record<SquadStatus, number> = { star: 0.95, key: 0.85, starter: 0.7, rotation: 0.45, backup: 0.2, prospect: 0.1 };
export function expectedPlayTime(status: SquadStatus): number {
  return EXPECTED[status] ?? EXPECTED.starter;
}

export const STATUS_RANK: Record<SquadStatus, number> = { star: 0, key: 1, starter: 2, rotation: 3, backup: 4, prospect: 4 };

/** Status automático (o que o clube "prometeu" sem você mexer): pelo OVR no elenco. */
export function autoStatus(players: Pick<VPlayer, 'id' | 'ovr' | 'age'>[]): Record<string, SquadStatus> {
  const sorted = [...players].sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1));
  const out: Record<string, SquadStatus> = {};
  sorted.forEach((p, i) => {
    out[p.id] = i === 0 ? (p.ovr >= 84 ? 'star' : 'key')
      : i === 1 ? 'key'
        : i < STARTERS ? 'starter'
          : p.age <= 20 ? 'prospect' : 'rotation';
  });
  return out;
}

/** Status efetivo: o atribuído por você, senão o automático. */
export function statusesOf(dr: DressingRoomState, players: Pick<VPlayer, 'id' | 'ovr' | 'age'>[]): Record<string, SquadStatus> {
  const auto = autoStatus(players);
  const out: Record<string, SquadStatus> = {};
  for (const p of players) out[p.id] = dr.status[p.id] ?? auto[p.id] ?? 'starter';
  return out;
}

/** Moral imediata de mudar o status (rebaixar dói, promover anima). */
export function statusChangeMorale(from: SquadStatus, to: SquadStatus, p: Pick<VPlayer, 'fm' | 'ambition'>): number {
  const steps = STATUS_RANK[to] - STATUS_RANK[from];
  if (steps === 0) return 0;
  if (steps < 0) return Math.min(8, -steps * 3);
  let hit = steps * 4;
  if (p.fm === 'ambitious' || p.ambition >= 15 || p.fm === 'temperamental') hit *= 1.5;
  if (p.fm === 'unambitious' || p.fm === 'loyal') hit *= 0.5;
  return -Math.min(15, Math.round(hit));
}

// ─── escalação e banco ─────────────────────────────────────────────────────
/**
 * Os 5 que jogam e o banco. Sem escalação salva: os 5 primeiros do elenco
 * (exatamente o que o motor fazia). Titular que saiu do elenco é trocado pelo
 * próximo da ordem do elenco; o banco é o resto (até 2).
 */
export function resolveLineup(squadIds: string[], lineup: Lineup | null | undefined): { starters: string[]; bench: string[] } {
  const inSquad = new Set(squadIds);
  const starters: string[] = [];
  for (const id of lineup?.starters ?? []) if (inSquad.has(id) && !starters.includes(id) && starters.length < STARTERS) starters.push(id);
  for (const id of squadIds) { if (starters.length >= STARTERS) break; if (!starters.includes(id)) starters.push(id); }
  const rest = squadIds.filter((id) => !starters.includes(id));
  const benchPref = (lineup?.bench ?? []).filter((id) => rest.includes(id));
  const bench = [...benchPref, ...rest.filter((id) => !benchPref.includes(id))];
  return { starters, bench };
}

/** Troca dois jogadores de lugar (titular ↔ banco ou posição entre titulares). */
export function swapLineup(squadIds: string[], lineup: Lineup | null | undefined, a: string, b: string): Lineup {
  const cur = resolveLineup(squadIds, lineup);
  const all = [...cur.starters, ...cur.bench];
  const ia = all.indexOf(a), ib = all.indexOf(b);
  if (ia < 0 || ib < 0 || ia === ib) return { starters: cur.starters, bench: cur.bench };
  [all[ia], all[ib]] = [all[ib], all[ia]];
  return { starters: all.slice(0, STARTERS), bench: all.slice(STARTERS) };
}

/** Janela de transferências com roster lock (frente de mercado grava `market.window`). */
export function rosterLocked(save: SaveWithClube | null | undefined): boolean {
  const w = (save?.clube?.market as { window?: TransferWindow } | undefined)?.window;
  return !!w?.rosterLocked;
}

// ─── tempo de jogo ─────────────────────────────────────────────────────────
/** Soma a série: disponível = no elenco e sem lesão; jogou = entrou no servidor. */
export function recordPlayTime(
  dr: DressingRoomState,
  a: { squadIds: string[]; playedIds: string[]; maps: number; unavailable?: ReadonlySet<string> },
): DressingRoomState {
  if (a.maps <= 0) return dr;
  const played = new Set(a.playedIds);
  const playTime = { ...dr.playTime };
  for (const id of a.squadIds) {
    const cur = playTime[id] ?? { played: 0, available: 0 };
    const avail = !a.unavailable?.has(id) || played.has(id);
    playTime[id] = { played: cur.played + (played.has(id) ? a.maps : 0), available: cur.available + (avail ? a.maps : 0) };
  }
  return { ...dr, playTime };
}

/** Fração de mapas jogados no split corrente (null sem mapa disponível). */
export function playShareOf(dr: DressingRoomState, id: string): number | null {
  const t = dr.playTime[id];
  if (!t || t.available <= 0) return null;
  return Math.max(0, Math.min(1, t.played / t.available));
}

/** Fração que vale para a felicidade: o split corrente (com 3+ mapas), senão o último fechado. */
export function effectivePlayShare(dr: DressingRoomState, id: string): number | null {
  const t = dr.playTime[id];
  if (t && t.available >= 3) return playShareOf(dr, id);
  return dr.lastPlayTime?.[id] ?? playShareOf(dr, id);
}

/** Valor de mercado de quem vive no banco (1 = normal; até −15% sem jogar). */
export function benchValueFactor(dr: DressingRoomState, id: string): number {
  const s = effectivePlayShare(dr, id);
  if (s == null) return 1;
  return Math.round((0.85 + 0.15 * Math.min(1, s / 0.6)) * 1000) / 1000;
}

// ─── incômodo por tempo de jogo → conversa → saída ─────────────────────────
export const UNREST_GAP = 0.15; // abaixo do esperado por mais que isto = incômodo
export type UnrestLevel = 0 | 1 | 2 | 3;
export const UNREST_LABEL: Record<UnrestLevel, string> = { 0: 'Tranquilo', 1: 'Incomodado', 2: 'Pediu conversa', 3: 'Quer sair' };

export interface DressingEvent { kind: 'talkRequest' | 'leaveRequest' | 'settled'; playerId: string }

/**
 * Fechamento do split no vestiário: compara o tempo de jogo com o status,
 * sobe/desce o incômodo, guarda a fração do split e zera a contagem.
 * Ambicioso/temperamental escalam mais rápido; leal/acomodado aguentam mais.
 */
export function closeSplitDressing(
  dr: DressingRoomState,
  players: Pick<VPlayer, 'id' | 'ovr' | 'age' | 'fm' | 'ambition'>[],
  split: number,
): { dressing: DressingRoomState; events: DressingEvent[] } {
  const statuses = statusesOf(dr, players);
  const unrest = { ...(dr.unrest ?? {}) };
  const lastPlayTime: Record<string, number> = {};
  const events: DressingEvent[] = [];
  const ids = new Set(players.map((p) => p.id));
  for (const id of Object.keys(unrest)) if (!ids.has(id)) delete unrest[id];
  for (const p of players) {
    const share = playShareOf(dr, p.id);
    if (share == null) { if (dr.lastPlayTime?.[p.id] != null) lastPlayTime[p.id] = dr.lastPlayTime[p.id]; continue; }
    lastPlayTime[p.id] = Math.round(share * 100) / 100;
    const exp = expectedPlayTime(statuses[p.id]);
    const cur = unrest[p.id]?.level ?? 0;
    const patient = p.fm === 'loyal' || p.fm === 'unambitious';
    const gap = exp - share;
    let next: number = cur;
    if (gap > (patient ? UNREST_GAP * 2 : UNREST_GAP)) {
      next = cur + 1 + ((p.fm === 'ambitious' || p.fm === 'temperamental') && gap > 0.4 && cur >= 1 ? 1 : 0);
    } else if (gap <= 0.05) {
      next = cur - 1;
    }
    const level = Math.max(0, Math.min(3, next)) as UnrestLevel;
    if (level === 0) { delete unrest[p.id]; if (cur > 0) events.push({ kind: 'settled', playerId: p.id }); continue; }
    unrest[p.id] = { level, since: level > cur ? split : (unrest[p.id]?.since ?? split) };
    if (level > cur && level === 2) events.push({ kind: 'talkRequest', playerId: p.id });
    if (level > cur && level === 3) events.push({ kind: 'leaveRequest', playerId: p.id });
  }
  return { dressing: { ...dr, unrest, lastPlayTime, playTime: {} }, events };
}

/** O jogador quer sair? (pedido de saída por banco, ou insatisfação crônica). Frente de mercado lê. */
export function wantsToLeave(save: SaveWithClube | null | undefined, playerId: string): boolean {
  const dr = dressingOf(save);
  if ((dr.unrest?.[playerId]?.level ?? 0) >= 3) return true;
  const sat = save?.satisfaction?.[playerId];
  const mor = save?.morale?.[playerId];
  return sat != null && sat < 25 && (mor ?? 70) < 35;
}

/** Quem quer sair agora (ids). */
export function leaveRequests(save: SaveWithClube | null | undefined, squadIds: string[]): string[] {
  return squadIds.filter((id) => wantsToLeave(save, id));
}

/**
 * Efeito de uma conversa 1-a-1 no incômodo: falar de tempo de jogo com quem
 * está incomodado e acertar o tom acalma (−1); errar piora (+1). Elogio e
 * defesa pública acalmam só um pouco quem ainda está no nível 1.
 */
export function talkUnrestDelta(topic: string, valence: 'positive' | 'neutral' | 'negative', level: number): -1 | 0 | 1 {
  if (level <= 0) return 0;
  if (topic === 'playtime') return valence === 'positive' ? -1 : valence === 'negative' ? 1 : 0;
  if ((topic === 'praise' || topic === 'defend') && valence === 'positive' && level === 1) return -1;
  if (valence === 'negative' && level >= 2) return 1;
  return 0;
}

export function applyUnrestDelta(dr: DressingRoomState, id: string, delta: number, split: number): DressingRoomState {
  if (!delta) return dr;
  const unrest = { ...(dr.unrest ?? {}) };
  const cur = unrest[id]?.level ?? 0;
  const level = Math.max(0, Math.min(3, cur + delta)) as UnrestLevel;
  if (level === 0) delete unrest[id];
  else unrest[id] = { level, since: level > cur ? split : (unrest[id]?.since ?? split) };
  return { ...dr, unrest };
}

// ─── hierarquia e influência ───────────────────────────────────────────────
export type InfluenceTier = 'leader' | 'high' | 'influential' | 'none';
export const INFLUENCE_LABEL: Record<InfluenceTier, string> = {
  leader: 'Líder do time', high: 'Muito influente', influential: 'Influente', none: 'Sem influência',
};
const STATUS_INFLUENCE: Record<SquadStatus, number> = { star: 12, key: 8, starter: 4, rotation: 1, backup: 0, prospect: 0 };

export interface HierarchyEntry {
  id: string;
  score: number; // 0–100
  tier: InfluenceTier;
  parts: { leadership: number; tenure: number; ability: number; status: number };
}

export function hierarchy(players: VPlayer[], statuses: Record<string, SquadStatus>): HierarchyEntry[] {
  const rows = players.map((p) => {
    const parts = {
      leadership: Math.round(p.leadership * 2.2),
      tenure: Math.round(Math.min(8, p.tenure) * 2.5),
      ability: Math.round(clamp((p.ovr - 60) * 0.6, 0, 24)),
      status: STATUS_INFLUENCE[statuses[p.id] ?? 'starter'],
    };
    return { id: p.id, score: clamp(parts.leadership + parts.tenure + parts.ability + parts.status), tier: 'none' as InfluenceTier, parts };
  }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  let high = 0;
  rows.forEach((r, i) => {
    if (i === 0) r.tier = 'leader';
    else if (r.score >= 55 && high < 2) { r.tier = 'high'; high++; }
    else if (r.score >= 42) r.tier = 'influential';
  });
  return rows;
}

const TIER_W: Record<InfluenceTier, number> = { leader: 3, high: 2, influential: 1, none: 0 };

/** Moral média dos influentes (pesada pelo nível de influência). */
export function influentialMorale(hier: HierarchyEntry[], morale: Record<string, number>, base = 70): number | null {
  let s = 0, w = 0;
  for (const h of hier) { const k = TIER_W[h.tier]; if (!k) continue; s += (morale[h.id] ?? base) * k; w += k; }
  return w > 0 ? s / w : null;
}

/** Arrasto dos influentes na moral do grupo (delta por jogador, ±3; o líder não é arrastado). */
export function influencePull(hier: HierarchyEntry[], morale: Record<string, number>, base = 70): Record<string, number> {
  const L = influentialMorale(hier, morale, base);
  const out: Record<string, number> = {};
  if (L == null) return out;
  for (const h of hier) {
    if (h.tier === 'leader') continue;
    const m = morale[h.id] ?? base;
    const d = Math.max(-3, Math.min(3, Math.round((L - m) * 0.1)));
    if (d) out[h.id] = d;
  }
  return out;
}

// ─── grupos sociais ────────────────────────────────────────────────────────
const LANG_BY_COUNTRY: Record<string, string> = {
  br: 'pt', pt: 'pt',
  ru: 'ru', ua: 'ru', by: 'ru', kz: 'ru', uz: 'ru', kg: 'ru', tm: 'ru', md: 'ru', am: 'ru', az: 'ru', ge: 'ru',
  ar: 'es', es: 'es', uy: 'es', mx: 'es', co: 'es', cl: 'es', vz: 'es', ve: 'es', pe: 'es', gt: 'es', pr: 'es',
  us: 'en', ca: 'en', gb: 'en', uk: 'en', au: 'en', nz: 'en', ie: 'en', za: 'en', mt: 'en', eu: 'en',
  dk: 'scand', dn: 'scand', se: 'scand', sw: 'scand', no: 'scand',
  fr: 'fr', be: 'fr', lu: 'fr',
  de: 'de', at: 'de', ch: 'de', li: 'de',
  pl: 'pl', po: 'pl',
  cz: 'cs', sk: 'cs',
  rs: 'bcs', ba: 'bcs', me: 'bcs', hr: 'bcs',
  xk: 'sq', ks: 'sq', al: 'sq',
  cn: 'zh', tw: 'zh', hk: 'zh',
  tr: 'tr', mn: 'mn', fi: 'fi', ro: 'ro', bg: 'bg', hu: 'hu', mk: 'mk', lv: 'ru', lt: 'lt', ee: 'ru', // bálticos da cena falam russo no servidor
  il: 'he',
  sa: 'ar', jo: 'ar', iq: 'ar', lb: 'ar', ps: 'ar', id: 'id', vn: 'vi', nl: 'nl',
};
export function languageOf(country: string): string {
  const c = (country ?? '').toLowerCase();
  return LANG_BY_COUNTRY[c] ?? (c || 'en');
}
export const LANGUAGE_LABEL: Record<string, string> = {
  pt: 'Português', ru: 'Russo', es: 'Espanhol', en: 'Inglês', scand: 'Escandinavo', fr: 'Francês', de: 'Alemão',
  pl: 'Polonês', cs: 'Tcheco/eslovaco', bcs: 'Servo-croata', sq: 'Albanês', zh: 'Chinês', tr: 'Turco', mn: 'Mongol',
  fi: 'Finlandês', ro: 'Romeno', bg: 'Búlgaro', hu: 'Húngaro', mk: 'Macedônio', lv: 'Letão', lt: 'Lituano', et: 'Estoniano',
  he: 'Hebraico', ar: 'Árabe', id: 'Indonésio', vi: 'Vietnamita', nl: 'Holandês',
};

export const VETERAN_AGE = 28;
export const YOUNG_AGE = 21;

export interface SocialGroup { key: SocialGroupKey; kind: 'lang' | 'age'; label: string; members: string[] }

export function socialGroups(players: Pick<VPlayer, 'id' | 'country' | 'age'>[]): SocialGroup[] {
  const out: SocialGroup[] = [];
  const byLang = new Map<string, string[]>();
  for (const p of players) { const l = languageOf(p.country); byLang.set(l, [...(byLang.get(l) ?? []), p.id]); }
  for (const [l, members] of [...byLang].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
    if (members.length >= 2) out.push({ key: `lang:${l}`, kind: 'lang', label: LANGUAGE_LABEL[l] ?? l.toUpperCase(), members });
  }
  const vets = players.filter((p) => p.age >= VETERAN_AGE).map((p) => p.id);
  const kids = players.filter((p) => p.age <= YOUNG_AGE).map((p) => p.id);
  if (vets.length >= 2) out.push({ key: 'veterans', kind: 'age', label: 'Veteranos', members: vets });
  if (kids.length >= 2) out.push({ key: 'youngsters', kind: 'age', label: 'Jovens', members: kids });
  return out;
}

/** Tamanho do maior grupo de idioma (a "língua do servidor"). */
export function dominantLanguageSize(groups: SocialGroup[]): number {
  return groups.filter((g) => g.kind === 'lang').reduce((m, g) => Math.max(m, g.members.length), 1);
}

/** Isolados: ninguém fala a língua dele num elenco que tem uma língua dominante (3+). */
export function isolatedIds(players: Pick<VPlayer, 'id'>[], groups: SocialGroup[]): string[] {
  if (dominantLanguageSize(groups) < 3) return [];
  const inLang = new Set(groups.filter((g) => g.kind === 'lang').flatMap((g) => g.members));
  return players.map((p) => p.id).filter((id) => !inLang.has(id));
}

/** Multiplicador de química por par: mesmo idioma entrosa mais rápido; par em conflito, menos. */
export function socialPairBonus(players: Pick<VPlayer, 'id' | 'country'>[], conflicts: DressingRoomState['conflicts'] = []) {
  const lang = new Map(players.map((p) => [p.id, languageOf(p.country)]));
  const fights = new Set(conflicts.map((c) => pairOf(c.a, c.b)));
  return (a: string, b: string): number => {
    if (fights.has(pairOf(a, b))) return 0.5;
    const la = lang.get(a), lb = lang.get(b);
    return la && lb && la === lb ? 1.15 : 1;
  };
}

// ─── fatores de felicidade do vestiário (0–100; 60 = como esperado) ────────
export function playTimeScore(share: number | null | undefined, status: SquadStatus): number | undefined {
  if (share == null) return undefined;
  const e = expectedPlayTime(status);
  if (share >= e) return Math.round(60 + Math.min(5, (share - e) * 20));
  return Math.round(clamp(60 - ((e - share) / e) * 75));
}

/** Papel tático: jogar na função natural (ou na 2ª) × fora dela. */
export function roleScore(natural: Role, natural2: Role | undefined, assigned: Role | undefined): number {
  if (!assigned || assigned === natural || assigned === natural2) return 60;
  return 38;
}

/** Salário do contrato × salário de mercado (frente de contratos grava o contrato). */
export function wageScore(contractWage: number | null | undefined, marketWage: number): number | undefined {
  if (!contractWage || contractWage <= 0 || marketWage <= 0) return undefined;
  const r = contractWage / marketWage;
  return Math.round(clamp(60 + (r - 1) * 70, 10, 95));
}

/** Promessas: abertas dão esperança, cumpridas agradam, quebradas pesam; status prometido em contrato conta. */
export function promisesScore(
  list: PlayerPromise[] | undefined,
  split: number,
  statusPromise?: SquadStatus | null,
  current?: SquadStatus,
): number | undefined {
  const hasList = !!list?.length;
  const brokeStatus = !!statusPromise && !!current && STATUS_RANK[current] > STATUS_RANK[statusPromise];
  if (!hasList && !statusPromise) return undefined;
  let v = 60;
  let open = 0;
  for (const p of list ?? []) {
    if (p.status === 'open') open++;
    else if (p.status === 'kept' && p.deadlineSplit >= split - 4) v += 10;
    else if (p.status === 'broken' && p.deadlineSplit >= split - 6) v -= 20;
  }
  v += Math.min(8, open * 4);
  if (brokeStatus) v -= 25;
  return Math.round(clamp(v));
}

/** Comissão técnica: staffEffects().moraleRecovery (1 = sem comissão/linha de base). */
export function staffScore(moraleRecovery: number | null | undefined): number {
  return Math.round(clamp(60 + ((moraleRecovery ?? 1) - 1) * 100));
}

/** Grupo social: núcleo da mesma língua agrada; isolado sofre; conflito pesa. */
export function socialScore(id: string, groups: SocialGroup[], conflicts: DressingRoomState['conflicts'] = []): number {
  const lang = groups.find((g) => g.kind === 'lang' && g.members.includes(id));
  const dominant = dominantLanguageSize(groups);
  let v = lang ? (lang.members.length >= 3 ? 66 : 62) : dominant >= 3 ? 35 : 55;
  if (groups.some((g) => g.kind === 'age' && g.members.includes(id))) v += 4;
  for (const c of conflicts) if (c.a === id || c.b === id) v -= 12 * c.severity;
  return Math.round(clamp(v));
}

/** Ambição × tamanho do clube (tier 1 = elite). */
export function ambitionScore(ambition: number, clubTier: number): number {
  const want = ambition >= 16 ? 1 : ambition >= 13 ? 2 : 3;
  const gap = clubTier - want;
  return Math.round(clamp(gap > 0 ? 62 - gap * 14 : 62 + Math.min(10, -gap * 5)));
}

// ─── reuniões de equipe ────────────────────────────────────────────────────
export type MeetingKind = 'praise' | 'demand' | 'calm';
export const MEETING_LABEL: Record<MeetingKind, string> = { praise: 'Elogiar o grupo', demand: 'Cobrar o grupo', calm: 'Acalmar o grupo' };
export const MEETING_DESC: Record<MeetingKind, string> = {
  praise: 'Funciona depois de bons resultados; em má fase soa falso.',
  demand: 'Funciona em má fase e com profissionais; irrita temperamentais e soa injusto quando o time vai bem.',
  calm: 'Funciona com moral baixa ou conflitos no vestiário; alivia os atritos.',
};

export interface MeetingInput {
  kind: MeetingKind;
  results01: number;                 // campanha recente 0..1
  players: VPlayer[];
  morale: Record<string, number>;
  hierarchy: HierarchyEntry[];
  conflicts: number;                 // conflitos abertos
  motivating?: number;               // motivação do técnico principal (1–20)
}

export interface MeetingResult {
  kind: MeetingKind;
  fit: 'good' | 'ok' | 'bad';
  leaderBacks: boolean;
  leaderId: string | null;
  deltas: Record<string, number>;
  mean: number;
}

export function canHoldMeeting(dr: DressingRoomState, split: number): boolean {
  return !dr.meetings.some((m) => m.split === split);
}

export function resolveTeamMeeting(i: MeetingInput): MeetingResult {
  const avgMorale = i.players.length ? i.players.reduce((s, p) => s + (i.morale[p.id] ?? 70), 0) / i.players.length : 70;
  const fit: MeetingResult['fit'] =
    i.kind === 'praise' ? (i.results01 >= 0.6 ? 'good' : i.results01 >= 0.45 ? 'ok' : 'bad')
      : i.kind === 'demand' ? (i.results01 < 0.45 ? 'good' : i.results01 < 0.6 ? 'ok' : 'bad')
        : (avgMorale < 50 || i.conflicts > 0 ? 'good' : avgMorale >= 75 ? 'bad' : 'ok');
  const base = i.kind === 'praise' ? { good: 5, ok: 2, bad: -2 }[fit]
    : i.kind === 'demand' ? { good: 4, ok: 1, bad: -4 }[fit]
      : { good: 4, ok: 1, bad: 0 }[fit];
  const leader = i.hierarchy.find((h) => h.tier === 'leader') ?? null;
  const lp = leader ? i.players.find((p) => p.id === leader.id) : undefined;
  const leaderMorale = leader ? i.morale[leader.id] ?? 70 : 70;
  const leaderBacks = !!lp && fit !== 'bad' && leaderMorale >= 50 && !(lp.fm === 'temperamental' && i.kind === 'demand');
  const leaderAgainst = !!lp && (fit === 'bad' || leaderMorale < 40);
  const mot = 1 + ((i.motivating ?? 10) - 10) * 0.03;
  const deltas: Record<string, number> = {};
  for (const p of i.players) {
    let d = base;
    const m = i.morale[p.id] ?? 70;
    if (i.kind === 'demand') {
      if (p.fm === 'professional' || p.fm === 'modelPro' || p.fm === 'resolute') d += 2;
      if (p.fm === 'bornLeader') d += 1;
      if (p.fm === 'temperamental') d -= 3;
      if (p.fm === 'unambitious') d -= 1;
    } else if (i.kind === 'praise') {
      if (p.fm === 'mercenary') d = Math.round(d * 0.5);
      if (p.fm === 'ambitious' || p.age <= YOUNG_AGE) d += 1;
      if (m >= 80) d = Math.min(d, 1); // complacência: quem já está no alto quase não sobe
    } else {
      if (p.fm === 'temperamental') d += 2;
      if (p.fm === 'resolute') d = Math.round(d * 0.5);
    }
    if (d > 0) d = d * mot * (leaderBacks ? 1.5 : leaderAgainst ? 0.5 : 1);
    else if (d < 0 && leaderAgainst) d *= 1.3;
    deltas[p.id] = Math.max(-8, Math.min(8, Math.round(d)));
  }
  const vals = Object.values(deltas);
  const mean = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
  return { kind: i.kind, fit, leaderBacks, leaderId: leader?.id ?? null, deltas, mean };
}

/** Grava a reunião (e a reunião de acalmar alivia 1 de severidade de cada conflito). */
export function recordMeeting(dr: DressingRoomState, r: MeetingResult, split: number): DressingRoomState {
  const meetings = [...dr.meetings, { split, kind: r.kind, outcome: r.mean }].slice(-12);
  const conflicts = r.kind === 'calm' && r.fit !== 'bad'
    ? dr.conflicts.map((c) => ({ ...c, severity: c.severity - 1 })).filter((c) => c.severity > 0)
    : dr.conflicts;
  return { ...dr, meetings, conflicts };
}

// ─── conflitos ─────────────────────────────────────────────────────────────
export const MAX_CONFLICTS = 2;

/** Atrito de um par (0–1): temperamento, idioma, química, fase e choque de estrelas. */
export function frictionOf(
  a: VPlayer, b: VPlayer,
  ctx: { pairChem: number; results01: number; statusA?: SquadStatus; statusB?: SquadStatus },
): number {
  const t = ((20 - a.temperament) + (20 - b.temperament)) / 40;
  let f = Math.max(0, t - 0.35) * 1.4;
  if (languageOf(a.country) !== languageOf(b.country)) f += 0.15;
  if (ctx.pairChem < 35) f += 0.1;
  if (ctx.results01 < 0.4) f += 0.1;
  if (ctx.statusA && ctx.statusB && STATUS_RANK[ctx.statusA] <= 1 && STATUS_RANK[ctx.statusB] <= 1) f += 0.1;
  if (a.fm === 'modelPro' || b.fm === 'modelPro' || a.fm === 'bornLeader' || b.fm === 'bornLeader') f -= 0.1;
  return Math.max(0, Math.min(1, f));
}

/**
 * Fechamento do split: poda quem saiu, escala conflitos não mediados, esfria
 * atritos antigos e abre novos (no máximo 2 abertos) por sorteio semeado.
 */
export function tickConflicts(
  dr: DressingRoomState,
  players: VPlayer[],
  ctx: { split: number; results01: number; pairChem: (a: string, b: string) => number; statuses: Record<string, SquadStatus> },
): { dressing: DressingRoomState; started: { a: string; b: string }[]; escalated: { a: string; b: string }[] } {
  const ids = new Set(players.map((p) => p.id));
  const started: { a: string; b: string }[] = [];
  const escalated: { a: string; b: string }[] = [];
  const conflicts: DressingRoomState['conflicts'] = [];
  for (const c of dr.conflicts) {
    if (!ids.has(c.a) || !ids.has(c.b)) continue;
    const r = roll(`conflict-tick:${ctx.split}:${pairOf(c.a, c.b)}`);
    if (c.mediatedAt !== ctx.split && c.severity < 3 && r < 0.35) { conflicts.push({ ...c, severity: c.severity + 1 }); escalated.push({ a: c.a, b: c.b }); continue; }
    if (c.severity === 1 && ctx.split - c.since >= 3 && r > 0.6) continue; // esfriou sozinho
    conflicts.push(c);
  }
  const open = new Set(conflicts.map((c) => pairOf(c.a, c.b)));
  const cands: { a: VPlayer; b: VPlayer; f: number }[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (open.has(pairOf(a.id, b.id))) continue;
      const f = frictionOf(a, b, { pairChem: ctx.pairChem(a.id, b.id), results01: ctx.results01, statusA: ctx.statuses[a.id], statusB: ctx.statuses[b.id] });
      if (f > 0) cands.push({ a, b, f });
    }
  }
  cands.sort((x, y) => y.f - x.f);
  for (const c of cands) {
    if (conflicts.length >= MAX_CONFLICTS) break;
    const chance = Math.min(0.12, c.f * 0.25);
    if (roll(`conflict:${ctx.split}:${pairOf(c.a.id, c.b.id)}`) < chance) {
      conflicts.push({ a: c.a.id, b: c.b.id, since: ctx.split, severity: 1 });
      started.push({ a: c.a.id, b: c.b.id });
    }
  }
  return { dressing: { ...dr, conflicts }, started, escalated };
}

/** O preço do atrito por split: moral dos dois e química do par. */
export function conflictEffects(conflicts: DressingRoomState['conflicts']): { morale: Record<string, number>; pairChem: { a: string; b: string; delta: number }[] } {
  const morale: Record<string, number> = {};
  const pairChem: { a: string; b: string; delta: number }[] = [];
  for (const c of conflicts) {
    morale[c.a] = (morale[c.a] ?? 0) - 2 * c.severity;
    morale[c.b] = (morale[c.b] ?? 0) - 2 * c.severity;
    pairChem.push({ a: c.a, b: c.b, delta: -3 * c.severity });
  }
  return { morale, pairChem };
}

export interface MediationResult { resolved: boolean; chance: number; moraleA: number; moraleB: number; dressing: DressingRoomState }

/** Chance de mediar um conflito: gestão de pessoas do técnico, temperamento e vínculo. */
export function mediationChance(a: VPlayer, b: VPlayer, ctx: { manManagement: number; bondA: number; bondB: number }): number {
  const c = 0.35 + (ctx.manManagement - 10) * 0.03 + ((a.temperament + b.temperament) / 2 - 10) * 0.03 + ((ctx.bondA + ctx.bondB) / 2 - 50) * 0.006;
  return Math.max(0.1, Math.min(0.9, Math.round(c * 100) / 100));
}

/** Mediar (uma tentativa por conflito por split): resolve, ou os dois saem mais irritados. */
export function mediateConflict(
  dr: DressingRoomState, a: VPlayer, b: VPlayer,
  ctx: { split: number; manManagement: number; bondA: number; bondB: number },
): MediationResult {
  const chance = mediationChance(a, b, ctx);
  const key = pairOf(a.id, b.id);
  const c = dr.conflicts.find((x) => pairOf(x.a, x.b) === key);
  if (!c || c.mediatedAt === ctx.split) return { resolved: false, chance, moraleA: 0, moraleB: 0, dressing: dr };
  const ok = roll(`mediate:${ctx.split}:${key}`) < chance;
  const conflicts = ok
    ? dr.conflicts.filter((x) => pairOf(x.a, x.b) !== key)
    : dr.conflicts.map((x) => (pairOf(x.a, x.b) === key ? { ...x, mediatedAt: ctx.split } : x));
  return { resolved: ok, chance, moraleA: ok ? 3 : -2, moraleB: ok ? 3 : -2, dressing: { ...dr, conflicts } };
}

/** Poda o que ficou para trás quando o jogador sai do elenco (venda/fim de contrato). */
export function pruneDressing(dr: DressingRoomState, squadIds: string[]): DressingRoomState {
  const ids = new Set(squadIds);
  const keep = <T>(r: Record<string, T> | undefined) => Object.fromEntries(Object.entries(r ?? {}).filter(([k]) => ids.has(k))) as Record<string, T>;
  const lineup = dr.lineup ? { starters: dr.lineup.starters.filter((x) => ids.has(x)), bench: dr.lineup.bench.filter((x) => ids.has(x)) } : null;
  return {
    ...dr,
    status: keep(dr.status),
    lineup,
    playTime: keep(dr.playTime),
    unrest: keep(dr.unrest),
    lastPlayTime: keep(dr.lastPlayTime),
    conflicts: dr.conflicts.filter((c) => ids.has(c.a) && ids.has(c.b)),
  };
}
