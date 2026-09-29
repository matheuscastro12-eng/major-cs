// [fase 4 · frente JUVENTUDE] Jovens gerados (newgens): geração anual, evolução e poda.
//
// GERAÇÃO ANUAL (uma vez por ano de Carreira = 3 splits): cada macro-região
// revela uma leva de jovens de 16–18 anos. Quantidade e qualidade seguem a
// força da cena (Europa/CIS mais e melhores; Oceania/África menos). O PA segue
// uma distribuição realista — a maioria 90–130, poucos 130–160 e raros 160+ —
// e o CA de estreia é uma fração do PA pela idade. Os atributos saem do modelo
// da fase 1 (`deriveAttrs`: perfil da função + idade + ruído estável), com os
// ocultos plausíveis, então o jovem é coerente com a função desde o primeiro dia.
//
// ACADEMIAS: os clubes com academia (Liga Academy, `academy-clubs.json`) revelam
// um jovem a mais por ano, com PA melhor (a base forma). O SEU clube também tem
// a sua geração (2 por ano, qualidade pela comissão: formação de jovens), que você
// leva para a academia na tela Juventude — quem você não leva vai para o mercado.
//
// EVOLUÇÃO: cada jovem evolui atributo a atributo (`evolveAttrs`, fase 1) no
// fechamento de cada split, com teto no PA e rodagem pelo que joga (titular da
// IA, banco ou sem clube). PODA: quem nunca foi contratado e ficou velho (ou é
// fraco demais para o profissional) sai do mundo — o save não explode.
//
// PERSISTÊNCIA: `mundo.newgens[id]` guarda o Player SEM `attrs` (os 5 números
// ficam coerentes com eles) e `mundo.newgenAttrs[id]` guarda os 28 atributos +
// ocultos + CA/PA empacotados (≈45 bytes em vez de ≈600). Leia sempre por
// `newgenPlayer`/`newgenList`, que devolvem o jogador COM atributos.
//
// Leve de propósito: entra no bundle da migração do save (nada da base bo3 aqui;
// a integração com o mundo da IA mora em `juventudeMundo.ts`).
import type { Player, Role } from '../../types';
import { MACRO_REGION_ORDER, macroRegionOf, type MacroRegion } from '../../data/regions';
import { hashStr } from '../../state/hash';
import { ALL_ATTRS, type AttrKey } from '../attributes';
import {
  HIDDEN_KEYS, deriveAttrs, legacyFromAttrs, ovrFromCa, ovrFromLegacy,
  type HiddenKey, type LegacyStats, type PlayerAttrs,
} from '../attrs/model';
import { evolveAttrs } from '../attrs/progression';
import type { MundoState, YouthIntakeLog } from './model';
import { youthCountry, youthIdentity } from './juventudeNomes';

// ─── contrato (esqueleto da fase 4) ─────────────────────────────────────────
// A migração v29→v30 grava o bloco vazio (neutro): a leva do ano corrente nasce
// na primeira abertura da Carreira (`ensureYearIntake` em juventudeMundo.ts),
// que conhece o mundo da IA (academias) — a migração não pode importar a base.
export function defaultNewgens(_save?: Record<string, unknown>): Record<string, Player> { return {}; }
export function defaultIntake(_save?: Record<string, unknown>): YouthIntakeLog[] { return []; }

export const SPLITS_PER_YEAR = 3;
/** Ano de Carreira (0-based) do split: splits 1–3 = ano 0. */
export const careerYearOf = (split: number) => Math.floor((Math.max(1, Math.floor(split)) - 1) / SPLITS_PER_YEAR);
/** Primeiro split de um ano de Carreira. */
export const firstSplitOfYear = (year: number) => year * SPLITS_PER_YEAR + 1;

// ─── ids ────────────────────────────────────────────────────────────────────
// ng.<split de estreia>.<idade na estreia>.<região>.<n> — o id carrega o
// relógio de idade (como o RegenPlayerId), então qualquer tela calcula a idade
// sem consultar o save.
const RG_CODE: Record<MacroRegion, string> = { americas: 'am', europe: 'eu', cis: 'cis', asia: 'as', oceania: 'oc', africa: 'af' };
const RG_OF_CODE: Record<string, MacroRegion> = Object.fromEntries(Object.entries(RG_CODE).map(([k, v]) => [v, k as MacroRegion]));
const NEWGEN_RX = /^ng\.(\d+)\.(\d+)\.([a-z]+)\.(\d+)$/;

export interface NewgenId { debut: number; ageAtDebut: number; region: MacroRegion; n: number }
export function newgenId(debut: number, ageAtDebut: number, region: MacroRegion, n: number): string {
  return `ng.${debut}.${ageAtDebut}.${RG_CODE[region]}.${n}`;
}
export function parseNewgenId(id: string): NewgenId | null {
  const m = NEWGEN_RX.exec(id);
  if (!m) return null;
  const region = RG_OF_CODE[m[3]];
  if (!region) return null;
  return { debut: Number(m[1]), ageAtDebut: Number(m[2]), region, n: Number(m[4]) };
}
export const isNewgenId = (id: string) => NEWGEN_RX.test(id);
/** Idade do jovem no split (sobe 1 a cada 3 splits desde a estreia). */
export function newgenAge(id: string, split: number): number | null {
  const g = parseNewgenId(id);
  if (!g) return null;
  return g.ageAtDebut + Math.floor(Math.max(0, split - g.debut) / SPLITS_PER_YEAR);
}

// ─── atributos empacotados (≈45 bytes por jogador) ──────────────────────────
// 28 atributos + 8 ocultos (1–20, um caractere base-36 cada) + CA + PA (1–200,
// dois caracteres base-36 cada). Ordem fixa: ALL_ATTRS, HIDDEN_KEYS.
const d1 = (v: number) => Math.max(1, Math.min(20, Math.round(v))).toString(36);
const d2 = (v: number) => Math.max(1, Math.min(200, Math.round(v))).toString(36).padStart(2, '0');
export function packAttrs(x: PlayerAttrs): string {
  return ALL_ATTRS.map((k) => d1(x.a[k])).join('') + HIDDEN_KEYS.map((k) => d1(x.h[k])).join('') + d2(x.ca) + d2(x.pa);
}
export function unpackAttrs(s: string): PlayerAttrs | null {
  const n = ALL_ATTRS.length, m = HIDDEN_KEYS.length;
  if (typeof s !== 'string' || s.length !== n + m + 4) return null;
  const a = {} as Record<AttrKey, number>;
  const h = {} as Record<HiddenKey, number>;
  for (let i = 0; i < n; i++) a[ALL_ATTRS[i]] = parseInt(s[i], 36);
  for (let i = 0; i < m; i++) h[HIDDEN_KEYS[i]] = parseInt(s[n + i], 36);
  const ca = parseInt(s.slice(n + m, n + m + 2), 36);
  const pa = parseInt(s.slice(n + m + 2), 36);
  if ([...Object.values(a), ...Object.values(h), ca, pa].some((v) => !Number.isFinite(v) || v < 1)) return null;
  return { v: 1, a, h, ca, pa: Math.max(ca, pa) };
}

// ─── leitura/escrita no bloco ───────────────────────────────────────────────
export type MundoYouth = Pick<MundoState, 'newgens'> & { newgenAttrs?: Record<string, string> };

const hydrated = new Map<string, Player>(); // chave: id|pacote (o pacote muda quando evolui)
/** O jovem COM atributos (ou null se não existe). */
export function newgenPlayer(m: MundoYouth | null | undefined, id: string): Player | null {
  const p = m?.newgens?.[id];
  if (!p) return null;
  if (p.attrs) return p;
  const packed = m?.newgenAttrs?.[id];
  if (!packed) return p;
  const key = `${id}|${packed}|${p.role}|${p.nick}|${p.country}`;
  const hit = hydrated.get(key);
  if (hit) return hit;
  const x = unpackAttrs(packed);
  const out: Player = x ? { ...p, attrs: x, ...legacyFromAttrs(x) } : p;
  if (hydrated.size > 5000) hydrated.clear();
  hydrated.set(key, out);
  return out;
}
/** Todos os jovens do mundo, com atributos. */
export function newgenList(m: MundoYouth | null | undefined): Player[] {
  const out: Player[] = [];
  for (const id of Object.keys(m?.newgens ?? {})) { const p = newgenPlayer(m, id); if (p) out.push(p); }
  return out;
}
/** Grava um jovem (Player sem `attrs` + pacote), mantendo os 5 números coerentes. */
export function storeNewgen<T extends MundoYouth>(m: T, p: Player & { attrs: PlayerAttrs }): T {
  const { attrs, ...rest } = p;
  const lean: Player = { ...rest, ...legacyFromAttrs(attrs) };
  return {
    ...m,
    newgens: { ...m.newgens, [p.id]: lean },
    newgenAttrs: { ...(m.newgenAttrs ?? {}), [p.id]: packAttrs(attrs) },
  };
}
export function dropNewgens<T extends MundoYouth>(m: T, ids: Iterable<string>): T {
  const kill = new Set(ids);
  if (kill.size === 0) return m;
  const newgens: Record<string, Player> = {};
  const newgenAttrs: Record<string, string> = {};
  for (const [id, p] of Object.entries(m.newgens ?? {})) if (!kill.has(id)) newgens[id] = p;
  for (const [id, s] of Object.entries(m.newgenAttrs ?? {})) if (!kill.has(id)) newgenAttrs[id] = s;
  return { ...m, newgens, newgenAttrs };
}

// ─── quantidade e qualidade por região ──────────────────────────────────────
/** Jovens por ano e deslocamento médio do PA, pela força da cena. */
export const REGION_YOUTH: Record<MacroRegion, { count: number; paShift: number }> = {
  europe: { count: 16, paShift: 5 },
  cis: { count: 9, paShift: 6 },
  americas: { count: 10, paShift: 0 },
  asia: { count: 6, paShift: -6 },
  oceania: { count: 2, paShift: -8 },
  africa: { count: 2, paShift: -12 },
};
export const ACADEMY_PA_BONUS = 10;
export const USER_INTAKE_COUNT = 2;
export const USER_ORIGIN = 'user';

const u01 = (seed: string) => ((hashStr(seed) % 1_000_000) + 0.5) / 1_000_000;
function gauss(seed: string): number {
  const a = u01(`${seed}:a`), b = u01(`${seed}:b`);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

/**
 * PA (1–200) de um jovem. Mistura calibrada para a cena: ~76% "profissional
 * comum" (centro 105), ~19% bons (centro 134) e ~5% craques (centro 162).
 */
export function samplePa(seed: string, shift = 0): number {
  const r = u01(`mix:${seed}`);
  const [mu, sd] = r < 0.74 ? [105, 13] : r < 0.94 ? [135, 11] : [163, 11];
  return Math.max(55, Math.min(195, Math.round(mu + shift + gauss(`pa:${seed}`) * sd)));
}

// fração do PA já desenvolvida na estreia (CA/PA) pela idade
function caShare(age: number, seed: string): number {
  const base = age <= 16 ? 0.52 : age === 17 ? 0.57 : 0.62;
  return base + u01(`cas:${seed}`) * 0.1;
}

const ROLE_WEIGHTS: [Role, number][] = [['Rifler', 34], ['Entry', 18], ['AWP', 17], ['Support', 16], ['IGL', 9], ['Lurker', 6]];
function sampleRole(seed: string): Role {
  let r = u01(`role:${seed}`) * 100;
  for (const [role, w] of ROLE_WEIGHTS) { r -= w; if (r < 0) return role; }
  return 'Rifler';
}

// os 5 números por função em torno do OVR-alvo (a especialidade sobressai)
const ROLE_SHAPE: Record<Role, LegacyStats> = {
  AWP: { aim: -2, awp: 4, igl: -14, clutch: -3, consistency: -1 },
  IGL: { aim: -4, awp: -16, igl: 3, clutch: -2, consistency: 0 },
  Entry: { aim: 1, awp: -14, igl: -13, clutch: -3, consistency: -3 },
  Rifler: { aim: 1, awp: -12, igl: -12, clutch: -2, consistency: -1 },
  Support: { aim: -1, awp: -13, igl: -8, clutch: 0, consistency: 1 },
  Lurker: { aim: 0, awp: -13, igl: -12, clutch: 2, consistency: 0 },
};
function legacyForOvr(role: Role, ovr: number, seed: string): LegacyStats {
  const shape = ROLE_SHAPE[role];
  const jit = (k: string) => Math.round((u01(`jit:${seed}:${k}`) - 0.5) * 4);
  const clamp = (v: number) => Math.max(20, Math.min(99, v));
  let off = 0;
  const at = (): LegacyStats => ({
    aim: clamp(ovr + off + shape.aim + jit('aim')),
    awp: clamp(ovr + off + shape.awp + jit('awp')),
    igl: clamp(ovr + off + shape.igl + jit('igl')),
    clutch: clamp(ovr + off + shape.clutch + jit('clutch')),
    consistency: clamp(ovr + off + shape.consistency + jit('cons')),
  });
  for (let i = 0; i < 12; i++) {
    const d = ovr - ovrFromLegacy(at());
    if (d === 0) break;
    off += d;
  }
  return at();
}

export interface NewgenSpec {
  id: string;
  seed: string;
  region: MacroRegion;
  age: number;
  pa: number;
  country?: string;
  role?: Role;
}
/** Um jovem completo: identidade do país, função, atributos coerentes, CA/PA. */
export function makeNewgen(spec: NewgenSpec): Player & { attrs: PlayerAttrs } {
  const country = spec.country ?? youthCountry(spec.region, spec.seed);
  const { nick, name } = youthIdentity(spec.seed, country);
  const role = spec.role ?? sampleRole(spec.seed);
  const pa = Math.max(40, Math.min(195, Math.round(spec.pa)));
  const ca = Math.max(20, Math.round(pa * caShare(spec.age, spec.seed)));
  const legacy = legacyForOvr(role, ovrFromCa(ca), spec.seed);
  const base: Player = { id: spec.id, nick, name, country, role, ...legacy };
  // deriveAttrs lê a idade (perfil jovem: reflexo alto, leitura em formação)
  const x = deriveAttrs({ ...base, age: spec.age });
  const attrs: PlayerAttrs = { ...x, pa: Math.max(x.ca, pa) };
  return { ...base, ...legacyFromAttrs(attrs), attrs };
}

// ─── a leva do ano ──────────────────────────────────────────────────────────
export interface AcademySource { teamId: string; name: string; country: string }
export interface IntakeArgs {
  /** semente da Carreira (mundo.seed) */
  seed: string;
  year: number;
  /** split em que a leva estreia (primeiro split do ano) */
  split: number;
  /** clubes da IA com academia (revelam 1 jovem a mais, com PA melhor) */
  academies?: AcademySource[];
  /** a geração do SEU clube: país da org e qualidade (1 = comissão mediana) */
  user?: { country: string; region: MacroRegion; quality: number } | null;
}
export interface IntakeResult {
  players: (Player & { attrs: PlayerAttrs })[];
  logs: YouthIntakeLog[];
}

export function generateIntake(a: IntakeArgs): IntakeResult {
  const players: (Player & { attrs: PlayerAttrs })[] = [];
  const logs: YouthIntakeLog[] = [];
  const counters: Partial<Record<MacroRegion, number>> = {};
  const next = (region: MacroRegion) => (counters[region] = (counters[region] ?? 0) + 1);
  const ageFor = (seed: string) => 16 + (hashStr(`age:${seed}`) % 3); // 16–18
  for (const region of MACRO_REGION_ORDER) {
    const cfg = REGION_YOUTH[region];
    const ids: string[] = [];
    for (let i = 0; i < cfg.count; i++) {
      const seed = `${a.seed}:y${a.year}:${region}:${i}`;
      const age = ageFor(seed);
      const p = makeNewgen({ id: newgenId(a.split, age, region, next(region)), seed, region, age, pa: samplePa(seed, cfg.paShift) });
      players.push(p); ids.push(p.id);
    }
    logs.push({ year: a.year, region, playerIds: ids });
  }
  // academias da IA: um jovem a mais, do país do clube, PA melhor
  const origin: Record<string, string> = {};
  const acaIds: string[] = [];
  for (const ac of a.academies ?? []) {
    const region = macroRegionOf(ac.country) ?? 'europe';
    const seed = `${a.seed}:y${a.year}:aca:${ac.teamId}`;
    const age = ageFor(seed);
    const p = makeNewgen({ id: newgenId(a.split, age, region, next(region)), seed, region, age, country: ac.country, pa: samplePa(seed, REGION_YOUTH[region].paShift + ACADEMY_PA_BONUS) });
    players.push(p); acaIds.push(p.id); origin[p.id] = ac.teamId;
  }
  if (acaIds.length) logs.push({ year: a.year, region: 'global', playerIds: acaIds, origin });
  // a geração do seu clube (formação de jovens da comissão pesa no PA)
  if (a.user) {
    const ids: string[] = [];
    const uo: Record<string, string> = {};
    const bonus = Math.round((a.user.quality - 1) * 25) + 4;
    for (let i = 0; i < USER_INTAKE_COUNT; i++) {
      const seed = `${a.seed}:y${a.year}:user:${i}`;
      const age = ageFor(seed);
      const home = hashStr(`home:${seed}`) % 100 < 80 ? a.user.country : undefined;
      const p = makeNewgen({ id: newgenId(a.split, age, a.user.region, next(a.user.region)), seed, region: a.user.region, age, country: home, pa: samplePa(seed, REGION_YOUTH[a.user.region].paShift + bonus) });
      players.push(p); ids.push(p.id); uo[p.id] = USER_ORIGIN;
    }
    logs.push({ year: a.year, region: a.user.region, playerIds: ids, origin: uo });
  }
  return { players, logs };
}

/** O ano já teve a sua leva? */
export const hasIntake = (m: Pick<MundoState, 'intake'>, year: number) => (m.intake ?? []).some((l) => l.year === year);

export type MundoJuv = MundoState & { newgenAttrs?: Record<string, string> };

/** Grava a leva no bloco (jogadores + log; o log guarda os últimos 10 anos). */
export function applyIntake<T extends MundoJuv>(m: T, r: IntakeResult): T {
  let out = m;
  for (const p of r.players) out = storeNewgen(out, p);
  const years = [...new Set([...(m.intake ?? []).map((l) => l.year), ...r.logs.map((l) => l.year)])].sort((x, y) => y - x).slice(0, 10);
  const keep = new Set(years);
  return { ...out, intake: [...(m.intake ?? []), ...r.logs].filter((l) => keep.has(l.year)) };
}

/** De onde o jovem saiu: 'user' (sua base), id do clube com academia, ou null (cena aberta). */
export function newgenOrigin(m: Pick<MundoState, 'intake'>, id: string): string | null {
  for (const l of m.intake ?? []) { const o = l.origin?.[id]; if (o) return o; }
  return null;
}

// ─── evolução e poda ────────────────────────────────────────────────────────
export type NewgenStatus = 'starter' | 'bench' | 'free' | 'user';
export interface EvolveNewgensArgs {
  /** split que FECHA (a evolução do split que acabou) */
  split: number;
  statusOf: (id: string) => NewgenStatus;
  /** multiplicador de crescimento por jovem (academia boa, comissão) */
  growthOf?: (id: string) => number;
}
const MAPS_BY_STATUS: Record<NewgenStatus, number> = { starter: 12, bench: 5, free: 4, user: 12 };

export function evolveNewgens<T extends MundoJuv>(m: T, a: EvolveNewgensArgs): T {
  let out = m;
  for (const id of Object.keys(m.newgens ?? {})) {
    const st = a.statusOf(id);
    if (st === 'user') continue; // no seu elenco evolui pelo save (attrEvo): a cópia do mundo congela
    const p = newgenPlayer(m, id);
    const age = newgenAge(id, a.split);
    if (!p?.attrs || age == null) continue;
    const r = evolveAttrs(p.attrs, { playerId: id, split: a.split, age, role: p.role, mapsPlayed: MAPS_BY_STATUS[st], growthMul: a.growthOf?.(id) ?? 1 });
    if (Object.keys(r.deltas).length === 0 && r.attrs.ca === p.attrs.ca) continue;
    out = storeNewgen(out, { ...p, attrs: r.attrs });
  }
  return out;
}

export interface PruneArgs {
  split: number;
  statusOf: (id: string) => NewgenStatus;
  /** referenciado por algo que não pode sumir (seu elenco, academia, empréstimo, venda) */
  pinned?: (id: string) => boolean;
}
export type PruneReason = 'quit' | 'retired';
/** Máximo de jovens SEM clube guardados no save (o resto "largou o competitivo"). */
export const FREE_NEWGEN_CAP = 150;
/**
 * Quem sai do mundo: sem clube e velho para "estourar" (≥ 20 e OVR < 72, ou
 * ≥ 22), sem clube e sem futuro depois do 1º ano (PA < 105) — largou o competitivo;
 * e quem tem clube, envelheceu e caiu (≥ 32 e OVR < 72) — aposentou. Acima de
 * `FREE_NEWGEN_CAP` jovens sem clube, sai quem tem o menor PA.
 */
export function pruneNewgens<T extends MundoJuv>(m: T, a: PruneArgs): { mundo: T; removed: { id: string; reason: PruneReason }[] } {
  const removed: { id: string; reason: PruneReason }[] = [];
  const freeLeft: { id: string; pa: number }[] = [];
  for (const id of Object.keys(m.newgens ?? {})) {
    if (a.pinned?.(id)) continue;
    const st = a.statusOf(id);
    if (st === 'user') continue;
    const p = newgenPlayer(m, id);
    const age = newgenAge(id, a.split) ?? 99;
    if (!p?.attrs) { removed.push({ id, reason: 'quit' }); continue; }
    const ovr = ovrFromLegacy(legacyFromAttrs(p.attrs));
    const years = a.split - (parseNewgenId(id)?.debut ?? a.split);
    const quit = st === 'free' && ((age >= 20 && ovr < 72) || age >= 22 || (years >= SPLITS_PER_YEAR && p.attrs.pa < 105));
    const retire = st !== 'free' && age >= 32 && ovr < 72;
    if (quit) removed.push({ id, reason: 'quit' });
    else if (retire) removed.push({ id, reason: 'retired' });
    else if (st === 'free') freeLeft.push({ id, pa: p.attrs.pa });
  }
  // teto do mercado livre de jovens: passou dele, sai quem tem menos futuro
  if (freeLeft.length > FREE_NEWGEN_CAP) {
    freeLeft.sort((x, y) => x.pa - y.pa || (x.id < y.id ? -1 : 1));
    for (const f of freeLeft.slice(0, freeLeft.length - FREE_NEWGEN_CAP)) removed.push({ id: f.id, reason: 'quit' });
  }
  return { mundo: dropNewgens(m, removed.map((r) => r.id)), removed };
}

/** Bytes que o bloco de jovens ocupa no save (JSON). */
export function newgenBytes(m: MundoYouth & Pick<MundoState, 'intake'>): number {
  return JSON.stringify({ n: m.newgens ?? {}, a: m.newgenAttrs ?? {}, i: m.intake ?? [] }).length;
}

/** Semente estável da Carreira para a juventude (gravada no bloco na 1ª leva). */
export function youthSeedFor(save: { org?: { name?: string; tag?: string } | null; split?: number; squad?: { playerId: string }[] }): string {
  const sq = (save.squad ?? []).map((s) => s.playerId).sort().join(',');
  return hashStr(`${save.org?.name ?? ''}|${save.org?.tag ?? ''}|${save.split ?? 1}|${sq}`).toString(36);
}

/** OVR do jovem (atalho para telas e testes). */
export const newgenOvr = (p: Player) => ovrFromLegacy(p.attrs ? legacyFromAttrs(p.attrs) : p);
