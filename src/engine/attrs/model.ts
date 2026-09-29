// CONTRATO DO REALISMO FM (fase 1) — fonte da verdade dos atributos de um jogador.
//
// Três frentes trabalham em paralelo em cima deste arquivo:
//   - dados: base da cena atual calibrada por estatísticas reais (bo3.gg) grava
//     `PlayerAttrs` por jogador;
//   - atributos: migração dos saves, CA/PA, evolução por atributo e a ponte
//     `legacyFromAttrs` para o código que ainda lê os 5 números antigos;
//   - motor: a partida por duelos lê SÓ `attrsOf(p)`.
// As ASSINATURAS abaixo são o contrato: a implementação interna pode mudar, os
// nomes e formatos não. Mudou o contrato? Combine antes com as outras frentes.
//
// Frente B (atributos): os atributos são a FONTE DA VERDADE e os 5 números
// legados (aim/awp/igl/clutch/consistency) viraram uma VISÃO deles:
//   - `legacyFromAttrs` agrega grupos DISJUNTOS de atributos com pesos inteiros
//     (soma ≥ 5), o que permite a volta EXATA: `deriveAttrs` ajusta os atributos
//     de cada grupo para que `legacyFromAttrs(deriveAttrs(p))` devolva os mesmos
//     5 números de `p` (OVR, preço de carta e salário ficam idênticos para quem
//     ainda não tem atributos reais);
//   - `attrsOf` confere se os atributos gravados ainda batem com os 5 números
//     do objeto; se algum código antigo mexeu nos números (drift da IA, edição
//     do admin), ele reajusta os atributos com o MENOR movimento possível, então
//     atributos e números nunca divergem.

import { ALL_ATTRS, type AttrKey, type PlayerForAttrs } from '../attributes';
import { hashStr } from '../../state/hash';
import type { Role } from '../../types';

export type { AttrKey };

// Atributos ocultos, como no FM: nunca aparecem como número na tela; o jogador
// só os percebe por relatórios de olheiro e pelo comportamento em jogo.
export type HiddenKey =
  | 'bigMatch'         // pressão: rende (ou some) em jogo grande, LAN, Major, playoff
  | 'temperament'      // resistência a tilt: quanto uma sequência ruim derruba o jogo
  | 'consistencyHidden'// variância real de jogo a jogo (o "Consistência" visível é a leitura do olheiro)
  | 'professionalism'  // treino, evolução, comportamento fora do servidor
  | 'ambition'         // quer títulos e clube maior; pesa em contrato e transferência
  | 'loyalty'          // apego ao clube; pesa em renovação e propostas
  | 'injuryProneness'  // propensão a lesão (punho, tendão) e burnout
  | 'versatility';     // rendimento fora da função principal

export const HIDDEN_KEYS: HiddenKey[] = [
  'bigMatch', 'temperament', 'consistencyHidden', 'professionalism', 'ambition', 'loyalty', 'injuryProneness', 'versatility',
];

// Escala FM: atributos 1–20; habilidade atual (CA) e potencial (PA) 1–200, CA ≤ PA.
export interface PlayerAttrs {
  v: 1;
  a: Record<AttrKey, number>;
  h: Record<HiddenKey, number>;
  ca: number;
  pa: number;
}

// Qualquer jogador do jogo (Player da base, TPlayer do torneio, jogador da
// Carreira/RtP/Ultimate) serve, desde que tenha id, função e os 5 legados; se
// trouxer `attrs`, eles vencem. `age` e `role2` são opcionais: a idade entra no
// PA (jovem tem mais espaço) e no perfil (reflexos × leitura de jogo); a função
// secundária entra na versatilidade.
// `sourcePlayerId` (TPlayer) aponta o jogador da base quando o id é de runtime.
export type AttrsSource = PlayerForAttrs & { role: Role; attrs?: PlayerAttrs | null; age?: number; role2?: Role; sourcePlayerId?: string };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const unit = (seed: string) => (hashStr(seed) % 10_000) / 10_000; // 0..1 determinístico
const noise = (seed: string, amp: number) => (unit(seed) * 2 - 1) * amp; // -amp..+amp

// ─────────────────────────────────────────────────────────────────────────────
// Ponte legada: 5 números (0–100) ← grupos DISJUNTOS de atributos (1–20).
//
// Os grupos seguem o Road to Pro (que já agregava os 28 atributos assim) e têm
// pesos inteiros com soma ≥ 5 e ao menos um peso 1: com isso, qualquer número
// legado inteiro de 5 a 99 é alcançável EXATAMENTE por atributos inteiros.
// Atributos fora dos grupos (teamwork, adaptability, reflexes, stamina,
// coordination, apm) não entram no OVR legado — o motor novo lê direto.
export interface LegacyStats { aim: number; awp: number; igl: number; clutch: number; consistency: number }
export const LEGACY_KEYS: (keyof LegacyStats)[] = ['aim', 'awp', 'igl', 'clutch', 'consistency'];

export const LEGACY_GROUPS: Record<keyof LegacyStats, Partial<Record<AttrKey, number>>> = {
  aim: { aim: 1, aimMovement: 1, tap: 1, spray: 1, headshot: 1, crosshair: 1, preAim: 1 },
  awp: { awp: 4, reaction: 1 },
  igl: { leadership: 1, communication: 1, gameSense: 1, decisions: 1, vision: 1 },
  clutch: { clutch: 2, composure: 1, anticipation: 1, offAngles: 1 },
  consistency: { consistency: 2, concentration: 1, discipline: 1, positioning: 1 },
};
const GROUP_ENTRIES = Object.fromEntries(
  LEGACY_KEYS.map((k) => [k, Object.entries(LEGACY_GROUPS[k]) as [AttrKey, number][]]),
) as Record<keyof LegacyStats, [AttrKey, number][]>;
const GROUP_W = Object.fromEntries(
  LEGACY_KEYS.map((k) => [k, GROUP_ENTRIES[k].reduce((s, [, w]) => s + w, 0)]),
) as Record<keyof LegacyStats, number>;
/** Grupo legado de cada atributo (ou null para os que ficam fora do OVR legado). */
export const LEGACY_GROUP_OF: Record<AttrKey, keyof LegacyStats | null> = Object.fromEntries(
  ALL_ATTRS.map((k) => [k, LEGACY_KEYS.find((g) => k in LEGACY_GROUPS[g]) ?? null]),
) as Record<AttrKey, keyof LegacyStats | null>;

function groupValue(a: Record<AttrKey, number>, g: keyof LegacyStats): number {
  let s = 0;
  for (const [k, w] of GROUP_ENTRIES[g]) s += a[k] * w;
  return clamp(Math.round((s / GROUP_W[g]) * 5), 1, 99);
}

/** Os 5 números legados a partir de um mapa de 28 atributos. */
export function legacyFromA(a: Record<AttrKey, number>): LegacyStats {
  return {
    aim: groupValue(a, 'aim'),
    awp: groupValue(a, 'awp'),
    igl: groupValue(a, 'igl'),
    clutch: groupValue(a, 'clutch'),
    consistency: groupValue(a, 'consistency'),
  };
}

// Ponte para o código legado que ainda lê aim/awp/igl/clutch/consistency (0–100).
// Enquanto existir código lendo os 5 números, eles passam a SAIR dos atributos.
export function legacyFromAttrs(x: PlayerAttrs): LegacyStats {
  return legacyFromA(x.a);
}

// ─────────────────────────────────────────────────────────────────────────────
// OVR e CA/PA

/** A fórmula do OVR do jogo (a mesma de sempre: preço, salário e carta dependem dela). */
export function ovrFromLegacy(l: LegacyStats): number {
  const spec = Math.max(l.awp, l.igl, l.aim);
  return Math.round(l.aim * 0.45 + l.consistency * 0.18 + l.clutch * 0.12 + spec * 0.25);
}
/** OVR a partir dos atributos (via a ponte legada). */
export function ovrFromAttrs(x: PlayerAttrs): number {
  return ovrFromLegacy(legacyFromAttrs(x));
}

// CA (1–200) é o OVR na escala do FM: OVR 40 → 1, OVR 99 → 200. Assim as
// estrelas do perfil e o OVR mostrado em todo o jogo contam a mesma história.
export function caFromOvr(ovr: number): number {
  return clamp(Math.round(((ovr - 40) * 200) / 59), 1, 200);
}
/** Inverso de caFromOvr (para exibir o PA como OVR potencial). */
export function ovrFromCa(ca: number): number {
  return clamp(Math.round(40 + (ca * 59) / 200), 40, 99);
}

// CA a partir dos atributos. A função fica na assinatura do contrato; o OVR do
// jogo já pondera a especialidade (AWP/IGL/mira) pelo maior dos três.
export function caFromAttrs(a: Record<AttrKey, number>, _role: Role): number {
  return caFromOvr(ovrFromLegacy(legacyFromA(a)));
}

// Espaço de crescimento (em OVR) pela idade — a MESMA régua do potencial da
// Carreira (playerPotentialOvr), para o PA de um jogador bater com o teto que
// ele já tinha nos saves: jovem até +9 (+0..3 de talento), veterano 0.
export function potentialRoom(age: number): number {
  return age <= 18 ? 9 : age <= 20 ? 7 : age <= 22 ? 4 : age <= 24 ? 2 : age <= 26 ? 1 : 0;
}
export function potentialOvrFor(id: string, ovr: number, age: number): number {
  const room = potentialRoom(age);
  const talent = room > 0 ? hashStr(`pot:${id}`) % 4 : 0;
  return Math.min(99, ovr + room + talent);
}
/** Idade assumida quando o jogador não traz idade: auge (25–29), como a Carreira. */
export function defaultAge(id: string): number {
  return 25 + (hashStr(`age:${id}`) % 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ajuste exato: atributos inteiros cujo agregado legado bate com o alvo.
//
// `flavor` é o perfil desejado (contínuo, escala 1–20). Para cada grupo, desloca
// o perfil até a soma ponderada cair no alvo, arredonda e fecha o resíduo
// movendo ±1 o atributo que menos se afasta do perfil. Atributos fora dos
// grupos só são arredondados.
function groupSumFor(target: number, g: keyof LegacyStats): number {
  const W = GROUP_W[g];
  const t = clamp(Math.round(target), 5, 99);
  let s = Math.round((t * W) / 5);
  // W=7 (mira): garante que o arredondamento de volta caia exatamente em t
  for (let i = 0; i < 3 && Math.round((s * 5) / W) !== t; i++) s += Math.round((s * 5) / W) < t ? 1 : -1;
  return clamp(s, W, W * 20);
}

export function fitAttrsToLegacy(flavor: Record<AttrKey, number>, target: LegacyStats): Record<AttrKey, number> {
  const out = {} as Record<AttrKey, number>;
  for (const k of ALL_ATTRS) out[k] = clamp(Math.round(flavor[k]), 1, 20);
  for (const g of LEGACY_KEYS) {
    const entries = GROUP_ENTRIES[g];
    const W = GROUP_W[g];
    const S = groupSumFor(target[g], g);
    let fs = 0;
    for (const [k, w] of entries) fs += flavor[k] * w;
    const c = (S - fs) / W;
    const want = {} as Record<string, number>;
    let cur = 0;
    for (const [k, w] of entries) {
      want[k] = flavor[k] + c;
      out[k] = clamp(Math.round(want[k]), 1, 20);
      cur += out[k] * w;
    }
    // fecha o resíduo: ±1 no atributo de menor custo (peso ≤ |resíduo|). Se só
    // sobrou um atributo de peso maior (ex.: reação no teto e AWP com peso 4),
    // passa do alvo com ele e volta pelos de peso 1.
    for (let guard = 0; cur !== S && guard < 200; guard++) {
      const dir = S > cur ? 1 : -1;
      const need = Math.abs(S - cur);
      let best: [AttrKey, number] | null = null;
      let bestCost = Infinity;
      for (const pass of [0, 1]) {
        for (const [k, w] of entries) {
          if (pass === 0 && w > need) continue;
          const nv = out[k] + dir;
          if (nv < 1 || nv > 20) continue;
          const cost = (nv - want[k]) ** 2 - (out[k] - want[k]) ** 2;
          if (cost < bestCost) { bestCost = cost; best = [k, w]; }
        }
        if (best) break;
      }
      if (!best) break; // alvo fora do alcançável (clamp) — fica o mais perto
      out[best[0]] += dir;
      cur += dir * best[1];
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivação calibrada (para quem ainda não tem atributos reais)

// Perfil por função (desvio na escala 1–20). Dentro de cada grupo legado a soma
// é reajustada, então o desvio só troca ÊNFASE (um Entry tem mais mira em
// movimento e menos pre-aim que um AWPer com a mesma "mira" legada).
const ROLE_TILT: Record<Role, Partial<Record<AttrKey, number>>> = {
  Entry: { aimMovement: 1.5, reflexes: 1.5, reaction: 1, offAngles: 1, apm: 1, stamina: 0.5, spray: -0.5, preAim: -1, anticipation: -1, positioning: -1, discipline: -0.5, composure: -0.5 },
  AWP: { crosshair: 1.5, preAim: 1, positioning: 1.5, anticipation: 1, reaction: 1, composure: 0.5, discipline: 0.5, spray: -1.5, aimMovement: -1, offAngles: -1, apm: -0.5 },
  Rifler: { spray: 1.5, tap: 1, headshot: 0.5, coordination: 0.5, preAim: -0.5, leadership: -0.5 },
  Support: { teamwork: 2.5, communication: 1, discipline: 1, positioning: 0.5, adaptability: 1, aimMovement: -0.5, headshot: -0.5, offAngles: -0.5 },
  Lurker: { anticipation: 1.5, offAngles: 1, positioning: 1, composure: 0.5, concentration: 0.5, teamwork: -1, communication: -1, leadership: -0.5 },
  IGL: { leadership: 2, communication: 1.5, vision: 1, gameSense: 0.5, adaptability: 1, teamwork: 0.5, headshot: -1, reflexes: -1, aimMovement: -0.5, apm: -0.5 },
};

// Perfil por idade: jovem tem reflexo e ritmo, veterano tem leitura e voz.
const AGE_TILT_YOUNG: Partial<Record<AttrKey, number>> = {
  reflexes: 1.5, reaction: 1, aimMovement: 0.5, apm: 1, stamina: 0.5,
  composure: -1, leadership: -1.5, anticipation: -1, gameSense: -0.5, discipline: -0.5, communication: -0.5, vision: -0.5,
};
function ageFactor(age: number): number {
  if (age <= 21) return Math.min(1, (22 - age) / 4);   // 21 → 0.25, 18 → 1
  if (age >= 28) return -Math.min(1, (age - 27) / 5);  // 28 → -0.2, 32+ → -1
  return 0;
}

// Base contínua de cada atributo fora do ajuste (0–100), a partir dos 5 legados.
const FREE_BASE: Partial<Record<AttrKey, (p: PlayerForAttrs) => number>> = {
  teamwork: (p) => p.igl * 0.5 + p.consistency * 0.5,
  adaptability: (p) => p.clutch * 0.5 + p.igl * 0.3 + p.consistency * 0.2,
  reflexes: (p) => p.aim * 0.7 + p.clutch * 0.3,
  stamina: (p) => p.consistency * 0.8 + p.clutch * 0.2,
  coordination: (p) => p.aim * 0.5 + p.consistency * 0.5,
  apm: (p) => p.aim * 0.6 + p.consistency * 0.4,
};

function flavorFor(p: AttrsSource, age: number): Record<AttrKey, number> {
  const legacy: LegacyStats = { aim: p.aim, awp: p.awp, igl: p.igl, clutch: p.clutch, consistency: p.consistency };
  const tilt = ROLE_TILT[p.role] ?? {};
  const af = ageFactor(age);
  const f = {} as Record<AttrKey, number>;
  for (const k of ALL_ATTRS) {
    const g = LEGACY_GROUP_OF[k];
    const base = g ? legacy[g] : (FREE_BASE[k]?.(p) ?? 50);
    f[k] = base / 5 + (tilt[k] ?? 0) + (AGE_TILT_YOUNG[k] ?? 0) * af + noise(`attr:${p.id}:${k}`, 1.5);
  }
  return f;
}

/** Ocultos plausíveis a partir dos atributos visíveis, idade e OVR (ruído estável por id). */
export function deriveHiddenAttrs(p: AttrsSource, a: Record<AttrKey, number>, age: number, ovr: number): Record<HiddenKey, number> {
  const n = (k: string, amp: number) => noise(`hidden:${p.id}:${k}`, amp);
  const h = {} as Record<HiddenKey, number>;
  h.bigMatch = a.clutch * 0.6 + a.composure * 0.4 + (age >= 25 ? 1 : 0) + n('bigMatch', 3);
  h.temperament = a.composure * 0.7 + a.discipline * 0.3 + n('temperament', 3);
  h.consistencyHidden = a.consistency + n('consistencyHidden', 2);
  h.professionalism = 6 + a.discipline * 0.4 + (age >= 27 ? 1 : 0) + n('professionalism', 4);
  h.ambition = 11 + (ovr >= 85 ? 2 : 0) + (age <= 23 ? 1 : 0) + n('ambition', 5);
  h.loyalty = 10 + (age >= 30 ? 1 : 0) + n('loyalty', 6);
  h.injuryProneness = 7 + (age >= 30 ? 2 : 0) + n('injuryProneness', 5);
  h.versatility = 8 + (p.role2 ? 4 : 0) + (p.role === 'Support' || p.role === 'Rifler' ? 1 : 0) + n('versatility', 4);
  for (const k of HIDDEN_KEYS) h[k] = clamp(Math.round(h[k]), 1, 20);
  return h;
}

// Derivação calibrada: perfil por função + idade + ruído estável, ajustado para
// devolver EXATAMENTE os 5 números legados; ocultos plausíveis; CA pelo OVR e
// PA pela régua de potencial da idade (a mesma da Carreira).
export function deriveAttrs(p: AttrsSource): PlayerAttrs {
  const age = typeof p.age === 'number' && p.age >= 15 && p.age <= 45 ? p.age : defaultAge(p.id);
  const target: LegacyStats = { aim: p.aim, awp: p.awp, igl: p.igl, clutch: p.clutch, consistency: p.consistency };
  const a = fitAttrsToLegacy(flavorFor(p, age), target);
  const ovr = ovrFromLegacy(legacyFromA(a));
  const ca = caFromOvr(ovr);
  const pa = clamp(caFromOvr(potentialOvrFor(p.id, ovr, age)), ca, 200);
  return { v: 1, a, h: deriveHiddenAttrs(p, a, age, ovr), ca, pa };
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura

const sameLegacy = (a: LegacyStats, p: LegacyStats) =>
  a.aim === Math.round(p.aim) && a.awp === Math.round(p.awp) && a.igl === Math.round(p.igl)
  && a.clutch === Math.round(p.clutch) && a.consistency === Math.round(p.consistency);

const legacyKey = (p: LegacyStats) => `${p.aim}|${p.awp}|${p.igl}|${p.clutch}|${p.consistency}`;

/** Reajusta atributos existentes a novos números legados com o MENOR movimento (mantém o perfil). */
export function refitAttrs(x: PlayerAttrs, target: LegacyStats): PlayerAttrs {
  const a = fitAttrsToLegacy(x.a, target);
  const ca = caFromOvr(ovrFromLegacy(legacyFromA(a)));
  return { v: 1, a, h: x.h, ca, pa: Math.max(x.pa, ca) };
}

// caches: derivação por (id, números, função, idade) e reajuste por objeto de atributos
const deriveCache = new Map<string, PlayerAttrs>();
const refitCache = new WeakMap<PlayerAttrs, { key: string; x: PlayerAttrs }>();

// Atributos gravados, conferidos contra os 5 números do objeto: se um código
// antigo mexeu nos números sem mexer nos atributos, os números são a escrita
// mais recente — reajusta os atributos a eles (memoizado por objeto).
function syncedAttrs(own: PlayerAttrs, p: LegacyStats): PlayerAttrs {
  if (sameLegacy(legacyFromA(own.a), p)) return own;
  const key = legacyKey(p);
  const hit = refitCache.get(own);
  if (hit && hit.key === key) return hit.x;
  const x = refitAttrs(own, { aim: p.aim, awp: p.awp, igl: p.igl, clutch: p.clutch, consistency: p.consistency });
  refitCache.set(own, { key, x });
  return x;
}

// Registro dos atributos da BASE por id de jogador (preenchido pelas fontes de
// dados — ver data/playerAttrs.ts). Assim um TPlayer de torneio salvo não
// precisa carregar os 28 atributos: `attrsOf` acha os da base pelo id e confere
// com os números do objeto. Mantém os saves enxutos (cota do localStorage).
const registry = new Map<string, PlayerAttrs>();
export function registerAttrs(id: string, x: PlayerAttrs): void {
  registry.set(id, x);
}
export function registeredAttrs(id: string): PlayerAttrs | undefined {
  return registry.get(id);
}

// A ÚNICA porta de leitura dos atributos. O motor e as telas usam só esta.
// Ordem: atributos próprios (save/evolução) → base registrada → derivação.
export function attrsOf(p: AttrsSource): PlayerAttrs {
  const own = p.attrs;
  if (own && own.v === 1) return syncedAttrs(own, p);
  const reg = registry.get(p.sourcePlayerId ?? p.id) ?? (p.sourcePlayerId ? registry.get(p.id) : undefined);
  if (reg) return syncedAttrs(reg, p);
  const key = `${p.id}|${legacyKey(p)}|${p.role}|${p.age ?? ''}|${p.role2 ?? ''}`;
  const hit = deriveCache.get(key);
  if (hit) return hit;
  const x = deriveAttrs(p);
  if (deriveCache.size > 20_000) deriveCache.clear();
  deriveCache.set(key, x);
  return x;
}

/**
 * Os 5 números de QUALQUER jogador lidos pelos atributos. Sem atributos
 * gravados, são os do próprio objeto — exatamente o que a derivação devolveria.
 */
export function legacyOf(p: LegacyStats & { attrs?: PlayerAttrs | null }): LegacyStats {
  if (p.attrs && p.attrs.v === 1) return legacyFromAttrs(syncedAttrs(p.attrs, p));
  return { aim: p.aim, awp: p.awp, igl: p.igl, clutch: p.clutch, consistency: p.consistency };
}

/**
 * Materializa um jogador com atributos: grava `attrs` (os informados, os que já
 * tinha ou derivados) e reescreve os 5 números a partir deles. É o que as
 * fontes de dados e a evolução usam para os números nunca saírem dos atributos.
 */
export function withAttrs<T extends AttrsSource>(p: T, attrs?: PlayerAttrs | null): T & { attrs: PlayerAttrs } {
  const x = attrs && attrs.v === 1 ? attrs : attrsOf(p);
  return { ...p, attrs: x, ...legacyFromAttrs(x) };
}

export { ALL_ATTRS };
