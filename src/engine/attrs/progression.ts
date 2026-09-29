// [realismo FM · frente B] EVOLUÇÃO POR ATRIBUTO — substitui o engine/aging.ts.
//
// Cada atributo evolui na virada de split segundo a sua CLASSE:
//   - reflexo (reflexos, reação, mira em movimento, APM, stamina, coordenação):
//     cresce cedo e é o primeiro a cair (a partir dos ~25);
//   - mecânico (mira, tap, spray, HS, crosshair, AWP, pre-aim, off-angles):
//     cresce até ~25 e cai depois dos ~29;
//   - mental (game sense, decisões, antecipação, frieza, concentração,
//     posicionamento, clutch, trabalho em equipe, adaptabilidade, disciplina,
//     consistência): cresce até ~30 e só cai depois dos ~33;
//   - liderança (liderança, comunicação, visão): cresce até ~32.
// O quanto cresce depende do TREINO (foco no jogador, foco no grupo de
// atributos, estrutura do CT), das PARTIDAS JOGADAS no split (rodagem dá leitura
// de jogo; banco estagna) e do PROFISSIONALISMO (oculto): o profissional evolui
// mais rápido e envelhece melhor. O TETO é o PA: nenhum ganho leva o CA além dele.
// A longevidade (mesmo eixo do aiRetireAge da Carreira) desloca a idade do declínio.
//
// As regras de APOSENTADORIA do antigo aging.ts vivem aqui, sem mudança.
//
// Puro e determinístico: mesma entrada, mesmo resultado (sorteios por hash).

import { ALL_ATTRS, type AttrKey } from '../attributes';
import { hashStr } from '../../state/hash';
import type { Role } from '../../types';
import {
  caFromOvr, legacyFromA, ovrFromLegacy, LEGACY_GROUP_OF,
  type LegacyStats, type PlayerAttrs,
} from './model';

export type AttrClass = 'reflex' | 'mechanical' | 'mental' | 'leadership';

export const ATTR_CLASS: Record<AttrKey, AttrClass> = {
  reflexes: 'reflex', reaction: 'reflex', aimMovement: 'reflex', apm: 'reflex', stamina: 'reflex', coordination: 'reflex',
  aim: 'mechanical', tap: 'mechanical', spray: 'mechanical', headshot: 'mechanical', crosshair: 'mechanical',
  awp: 'mechanical', preAim: 'mechanical', offAngles: 'mechanical',
  gameSense: 'mental', decisions: 'mental', anticipation: 'mental', composure: 'mental', concentration: 'mental',
  positioning: 'mental', clutch: 'mental', teamwork: 'mental', adaptability: 'mental', discipline: 'mental', consistency: 'mental',
  leadership: 'leadership', communication: 'leadership', vision: 'leadership',
};

export const ATTR_CLASS_LABEL: Record<AttrClass, string> = {
  reflex: 'Reflexo', mechanical: 'Mecânica', mental: 'Leitura de jogo', leadership: 'Liderança',
};

// Chance por split de +1 num atributo (antes dos multiplicadores), por idade.
export function classGrowth(cls: AttrClass, age: number): number {
  switch (cls) {
    case 'reflex': return age <= 19 ? 0.4 : age <= 21 ? 0.25 : age <= 22 ? 0.05 : 0;
    case 'mechanical': return age <= 19 ? 0.45 : age <= 21 ? 0.4 : age <= 23 ? 0.06 : age <= 25 ? 0.03 : 0;
    case 'mental': return age <= 21 ? 0.35 : age <= 25 ? 0.07 : age <= 29 ? 0.05 : age <= 31 ? 0.03 : 0;
    case 'leadership': return age <= 21 ? 0.2 : age <= 27 ? 0.1 : age <= 31 ? 0.08 : age <= 33 ? 0.04 : 0;
  }
}

// Chance por split de −1 num atributo, pela idade EFETIVA (idade − longevidade).
export function classDecline(cls: AttrClass, age: number): number {
  switch (cls) {
    case 'reflex': return age < 25 ? 0 : age <= 27 ? 0.06 : age <= 29 ? 0.14 : age <= 31 ? 0.24 : 0.34;
    case 'mechanical': return age < 28 ? 0 : age <= 29 ? 0.04 : age <= 31 ? 0.1 : age <= 33 ? 0.2 : 0.3;
    case 'mental': return age < 32 ? 0 : age <= 33 ? 0.04 : age <= 35 ? 0.1 : 0.2;
    case 'leadership': return age < 35 ? 0 : 0.08;
  }
}

/** Anos que a longevidade (determinística por jogador) adia o declínio: −1..+3. */
export function longevityShift(playerId: string): number {
  return Math.floor((hashStr(`long:${playerId}`) % 100) / 20) - 1;
}

export interface EvolveContext {
  playerId: string;
  split: number;
  age: number;
  role?: Role;
  /** Mapas jogados no split que fecha (rodagem). Ausente = rodagem normal. */
  mapsPlayed?: number;
  /** Jogador escolhido como foco de treino do split. */
  focusPlayer?: boolean;
  /** Grupo de atributos em foco no treino (a mesma escolha do "foco de treino" da Carreira). */
  focusGroup?: keyof LegacyStats | null;
  /** Multiplicador extra de crescimento (estrutura do CT, convite, personalidade). */
  growthMul?: number;
}

export interface EvolveResult {
  attrs: PlayerAttrs;
  /** Variação por atributo neste split (só os que mudaram). */
  deltas: Partial<Record<AttrKey, number>>;
  ovrBefore: number;
  ovrAfter: number;
  /** Chegou ao teto (CA ≥ PA) depois da evolução. */
  atCeiling: boolean;
}

const unit = (seed: string) => (hashStr(seed) % 10_000) / 10_000;
const REF_MAPS = 12; // um split cheio de titular (~3 etapas)

function roll(mu: number, seed: string): number {
  if (mu === 0) return 0;
  const m = Math.abs(mu);
  const whole = Math.floor(m);
  const extra = unit(seed) < m - whole ? 1 : 0;
  return Math.sign(mu) * (whole + extra);
}

/**
 * Um split de evolução. `x.pa` é o teto: o CA nunca termina acima dele (ganhos
 * são desfeitos, do menos para o mais importante, até caber). Declínio vale
 * mesmo no teto; no teto, ganhos só repõem o que o declínio tirou.
 */
export function evolveAttrs(x: PlayerAttrs, ctx: EvolveContext): EvolveResult {
  const ovrBefore = ovrFromLegacy(legacyFromA(x.a));
  const prof = x.h.professionalism;
  const profGrowth = 0.6 + (prof / 20) * 0.8;   // 0.64..1.4
  const profDecline = 1.3 - (prof / 20) * 0.6;  // 1.27..0.7
  const effAge = ctx.age - longevityShift(ctx.playerId);
  const maps = ctx.mapsPlayed ?? REF_MAPS * 0.75;
  const play = Math.min(1, Math.max(0, maps / REF_MAPS));
  const caBefore = caFromOvr(ovrBefore);
  const headroom = x.pa - caBefore;
  const roomF = headroom <= 0 ? 0 : Math.max(0.15, Math.min(1, headroom / 12));

  const a = { ...x.a };
  const deltas: Partial<Record<AttrKey, number>> = {};
  for (const k of ALL_ATTRS) {
    const cls = ATTR_CLASS[k];
    let g = classGrowth(cls, ctx.age) * profGrowth * (ctx.growthMul ?? 1);
    // rodagem: jogar dá leitura de jogo; mecânica depende menos disso
    g *= cls === 'mental' || cls === 'leadership' ? 0.6 + 0.6 * play : 0.85 + 0.3 * play;
    if (ctx.focusPlayer) g *= 1.35;
    if (ctx.focusGroup) g *= LEGACY_GROUP_OF[k] === ctx.focusGroup ? 1.8 : 0.9;
    // teto: sem espaço, o crescimento só entra para repor declínio (via trim)
    g *= headroom > 0 ? roomF : 0.5;
    let d = classDecline(cls, effAge) * profDecline;
    if (ctx.focusPlayer) d *= 0.6; // veterano em foco treina pra perder menos
    const step = roll(g, `evo:${ctx.playerId}:${ctx.split}:${k}:g`) - roll(d, `evo:${ctx.playerId}:${ctx.split}:${k}:d`);
    if (!step) continue;
    const nv = Math.max(1, Math.min(20, a[k] + step));
    if (nv !== a[k]) { deltas[k] = nv - a[k]; a[k] = nv; }
  }

  // teto no PA: desfaz ganhos (do menor peso no OVR para o maior) até o CA caber
  const ovrOf = () => ovrFromLegacy(legacyFromA(a));
  if (caFromOvr(ovrOf()) > x.pa) {
    const gains = (Object.keys(deltas) as AttrKey[])
      .filter((k) => (deltas[k] ?? 0) > 0 && LEGACY_GROUP_OF[k])
      .sort((p, q) => unit(`trim:${ctx.playerId}:${ctx.split}:${p}`) - unit(`trim:${ctx.playerId}:${ctx.split}:${q}`));
    for (const k of gains) {
      if (caFromOvr(ovrOf()) <= x.pa) break;
      while ((deltas[k] ?? 0) > 0 && caFromOvr(ovrOf()) > x.pa) {
        a[k] -= 1;
        deltas[k] = (deltas[k] ?? 0) - 1;
      }
      if (!deltas[k]) delete deltas[k];
    }
  }
  const ovrAfter = ovrOf();
  const ca = caFromOvr(ovrAfter);
  return {
    attrs: { v: 1, a, h: x.h, ca, pa: Math.max(x.pa, ca) },
    deltas,
    ovrBefore,
    ovrAfter,
    atCeiling: ca >= x.pa,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aposentadoria (regras do antigo engine/aging.ts, sem mudança)

const MIN_AGE_TO_RETIRE = 31;
const MAX_OVR_TO_RETIRE = 70;
const ELITE_OVR_KEEP_PLAYING = 86; // OVR ≥ 86 nunca se aposenta automaticamente

export function shouldRetire(age: number, ovr: number): boolean {
  if (age < MIN_AGE_TO_RETIRE) return false;
  if (ovr >= ELITE_OVR_KEEP_PLAYING) return false;
  if (ovr > MAX_OVR_TO_RETIRE) return age >= 35; // só super-veteranos
  // 31+ e OVR < 70 → bem provável
  return true;
}

export interface RetirementCandidate { id: string; nick: string; ovr: number; age: number }

/** Novos aposentados do snapshot (quem já está em `retired` é ignorado). Puro. */
export function retirementTick(
  players: RetirementCandidate[],
  retired: string[] = [],
): { id: string; nick: string; age: number }[] {
  const done = new Set(retired);
  return players
    .filter((p) => !done.has(p.id) && shouldRetire(p.age, p.ovr))
    .map((p) => ({ id: p.id, nick: p.nick, age: p.age }));
}

export function retirementChipLabel(age: number): string {
  if (age >= 35) return `Aposentado · ${age} anos`;
  return `Aposentado · ${age} anos (cedo)`;
}
