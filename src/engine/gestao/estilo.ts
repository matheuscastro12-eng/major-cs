// [estilo de jogo] O JEITO de o time jogar — por cima do plano por mapa (tatica.ts).
//
// Pedido dos jogadores: "ao invés de só escolher, o time joga padrão, agressivo,
// passivo…". Estilo por LADO (T e CT separados), com efeito REAL no motor v2 por
// duelos (engine/match2) — nada de bônus plano de força:
//   • ENGAJAMENTO: quem aparece em cada fase (abertura, meio, pós-plant/retake)
//     muda com o estilo → o atributo de quem duela passa a pesar mais.
//   • FASES: viés de duelo por fase (abertura × meio × pós-plant) que DEPENDE do
//     perfil do elenco (entry, hold, leitura, pós-plant, retake, clutch, troca,
//     utilitária, IGL — `styleProfile`). O mesmo estilo ajuda um elenco e
//     atrapalha outro.
//   • MECANISMOS: trocas, plant, tempo do round, cessão do site (retake) e o PESO
//     DA MIRA no duelo (`kMult`): estilo caótico (agressivo/rush) aproxima o
//     duelo de cara-ou-coroa (mais variância, bom pro azarão); controle faz a
//     mira decidir (menos variância, bom pro favorito).
//   • CONFRONTO de estilos (pedra-papel-tesoura leve, STYLE_RPS): CT agressivo
//     pune o T lento e sofre com o rush; ceder-e-retomar pune o rush; etc.
//   • FAMILIARIDADE por estilo (0–100): cresce jogando com ele, decai sem uso;
//     escala o efeito junto com a familiaridade do mapa (fase 2). Estilo novo
//     rende pouco.
//
// NEUTRALIDADE: Padrão = nenhum modificador (o motor de antes, bit a bit). Para
// um elenco de perfil médio nenhum estilo ganha do Padrão; o ganho aparece
// quando o estilo encaixa no elenco (medido em scripts/test-estilo.mts).
//
// Puro e determinístico: sem RNG, sem relógio, sem React.

import type { Coach, Playbook, Playstyle, Role, TPlayer } from '../../types';
import { derivePlaystyle } from '../../types';
import { duelProfile } from '../match2/profile';
import type { MapRole, StyleCT, StyleId, StyleT, TacticDuelMods, TacticsState, TeamStyle } from './model';

export const STYLES_T: StyleT[] = ['standard', 'aggressive', 'passive', 'control', 'rush'];
export const STYLES_CT: StyleCT[] = ['standard', 'aggressive', 'passive', 'control', 'retake'];
export const DEFAULT_STYLE: TeamStyle = { t: 'standard', ct: 'standard' };

export const STYLE_FAM_DEFAULT = 35;  // estilo nunca usado
export const STYLE_FAM_FLOOR = 25;
export const STYLE_FAM_GAIN = 4;      // por mapa jogado no estilo (por lado)
export const STYLE_FAM_DECAY = 1;     // por série, estilos fora de uso
export const STYLE_CHANGE_COST = 0;   // trocar não apaga o que o time sabe (a familiaridade é por estilo)
export const STYLE_RPS_LOGIT = 0.03;  // logit de duelo por unidade do confronto de estilos

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

// ─────────────────────────────────────────────────────────────────────────────
// Rótulos (PT; a tela traduz com ct())

export const STYLE_LABEL: Record<StyleId, string> = {
  standard: 'Padrão', aggressive: 'Agressivo', passive: 'Passivo (lurk)', control: 'Controle (lento)', rush: 'Rush (execução rápida)', retake: 'Stack/retake',
};
export const STYLE_SHORT: Record<StyleId, string> = {
  standard: 'Padrão', aggressive: 'Agressivo', passive: 'Passivo', control: 'Controle', rush: 'Rush', retake: 'Retake',
};
export const STYLE_DESC: Record<'t' | 'ct', Partial<Record<StyleId, string>>> = {
  t: {
    standard: 'O jogo de sempre: nada muda no motor.',
    aggressive: 'Busca o primeiro abate e empurra cedo. Mais aberturas e trocas, utilitária gasta cedo, pós-plant mais fraco, mais variância.',
    passive: 'Espalha, segura lurk e decide no fim. Menos abertura, mais leitura, pós-plant e clutch pesam; o tempo aperta.',
    control: 'Default com informação e round longo. A leitura do IGL e a utilitária decidem; menos variância.',
    rush: 'Os cinco juntos, rápido. Planta muito e troca muito; depende de entry, troca e utilitária; mais variância.',
  },
  ct: {
    standard: 'O jogo de sempre: nada muda no motor.',
    aggressive: 'Sai pra pegar informação e abate cedo. Mais aberturas, retake mais fraco, mais variância.',
    passive: 'Segura ângulo e espera. Menos abertura; posicionamento, retake e clutch pesam.',
    control: 'Crossfire e rotação lida pelo IGL. Leitura e utilitária decidem; menos variância.',
    retake: 'Cede o site e retoma junto, com stack. O T planta mais; retake, troca e utilitária decidem.',
  },
};
/** O que o estilo valoriza no elenco (atributos que fazem render). */
export const STYLE_FAVORS: Record<'t' | 'ct', Partial<Record<StyleId, string>>> = {
  t: {
    aggressive: 'Entry (movimentação, reação, pre-aim), troca, jogadores agressivos',
    passive: 'Leitura de jogo, posicionamento, pós-plant, clutch, lurkers',
    control: 'IGL (liderança, leitura), utilitária, leitura de jogo',
    rush: 'Entry, troca (trabalho em equipe, comunicação), utilitária',
  },
  ct: {
    aggressive: 'Entry (movimentação, reação), troca, jogadores agressivos',
    passive: 'Segurar ângulo (mira, posicionamento, antecipação), retake, clutch',
    control: 'IGL (liderança, leitura), leitura de jogo, utilitária',
    retake: 'Retake (decisão, reação, frieza), troca, utilitária',
  },
};

export const styleKey = (side: 't' | 'ct', s: StyleId) => `${side}:${s}`;

export function styleOf(state: TacticsState | null | undefined): TeamStyle {
  const s = state?.style;
  return {
    t: s && STYLES_T.includes(s.t) ? s.t : 'standard',
    ct: s && STYLES_CT.includes(s.ct) ? s.ct : 'standard',
  };
}

export function styleFamOf(state: TacticsState | null | undefined, side: 't' | 'ct', s: StyleId): number {
  if (s === 'standard') return 100;
  const v = state?.styleFam?.[styleKey(side, s)];
  return clamp(typeof v === 'number' && Number.isFinite(v) ? v : STYLE_FAM_DEFAULT, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Perfil do elenco para o estilo — a FORMA do elenco, não o nível.
//
// Cada índice é o composto de fase do time (profile.ts) em relação à mira do
// próprio time (rifle), em desvios-padrão da base (bo3-2026: média entre todos
// os times e o tier S; agregação igual à de baixo — top 2 para quem decide a
// fase, média para o coletivo). 0 = elenco de perfil médio; +1 = um desvio
// acima do normal naquela fase PARA O NÍVEL DE MIRA DELE. IGL é absoluto.

const REF = {
  entry: [-0.2, 0.47], hold: [0.1, 0.2], sense: [-2.25, 0.5], post: [0.1, 0.24],
  retake: [-1.0, 0.5], clutch: [-0.36, 0.3], trade: [-2.2, 0.4], util: [-2.1, 0.45],
} as const;
const IGL_REF = 14, IGL_SD = 3;

export interface StyleProfile {
  entry: number; hold: number; sense: number; post: number; retake: number; clutch: number; trade: number; util: number;
  igl: number;      // qualidade de quem chama ((igl − 14)/3)
  agg: number;      // fração de jogadores de estilo agressivo (0–1)
  pas: number;      // fração de jogadores de estilo passivo (0–1)
}

export const NEUTRAL_PROFILE: StyleProfile = { entry: 0, hold: 0, sense: 0, post: 0, retake: 0, clutch: 0, trade: 0, util: 0, igl: 0, agg: 0.3, pas: 0.3 };

export type StylePlayer = Pick<TPlayer, 'id' | 'role'> & Partial<TPlayer> & { role2?: Role; playstyle?: Playstyle };

const top2 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => b - a);
  return s.length >= 2 ? (s[0] + s[1]) / 2 : s[0] ?? 0;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function styleProfile(players: StylePlayer[], iglSlot = -1): StyleProfile {
  if (!players.length) return { ...NEUTRAL_PROFILE };
  const pr = players.map((p) => duelProfile(p as TPlayer));
  const rifle = mean(pr.map((x) => x.rifle));
  const z = (v: number, k: keyof typeof REF) => clamp((v - rifle - REF[k][0]) / REF[k][1], -2.5, 2.5);
  const caller = iglSlot >= 0 && pr[iglSlot] ? pr[iglSlot]
    : pr.find((x) => x.role === 'IGL') ?? pr.find((x) => x.role2 === 'IGL') ?? pr.reduce((b, x) => (x.igl > b.igl ? x : b), pr[0]);
  const styles = players.map((p) => p.playstyle ?? derivePlaystyle(p.role));
  // FORMA pura: tira a média dos 8 índices (elenco bom em tudo = 0 em tudo)
  const raw = {
    entry: z(top2(pr.map((x) => x.entry)), 'entry'),
    hold: z(mean(pr.map((x) => x.hold)), 'hold'),
    sense: z(mean(pr.map((x) => x.sense)), 'sense'),
    post: z(mean(pr.map((x) => x.post)), 'post'),
    retake: z(top2(pr.map((x) => x.retake)), 'retake'),
    clutch: z(top2(pr.map((x) => x.clutch)), 'clutch'),
    trade: z(mean(pr.map((x) => x.trade)), 'trade'),
    util: z(mean(pr.map((x) => x.util)), 'util'),
  };
  const c = mean(Object.values(raw));
  const shape = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, clamp(v - c, -2.5, 2.5)])) as typeof raw;
  return {
    ...shape,
    igl: clamp((caller.igl - IGL_REF) / IGL_SD, -2, 2),
    agg: styles.filter((s) => s === 'aggressive').length / players.length,
    pas: styles.filter((s) => s === 'passive').length / players.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Efeito de cada estilo (por lado). Unidades: logit de DUELO a favor do time.
// `fixed` = custo/característica do estilo; `fit` = o quanto o perfil paga.

export interface StyleShape {
  open: number; mid: number; post: number;   // viés por fase (já com o perfil)
  trade: number; plant: number; time: number; k: number; oppPlant: number;
  // multiplicadores de engajamento por papel/estilo do jogador
  engOpen?: (role: MapRole, style: Playstyle) => number;
  engMid?: (role: MapRole, style: Playstyle) => number;
  engPost?: (role: MapRole, style: Playstyle) => number;
}

const NONE: StyleShape = { open: 0, mid: 0, post: 0, trade: 1, plant: 1, time: 1, k: 1, oppPlant: 1 };

/** Forma do estilo para um perfil (sem familiaridade). */
// quanto o perfil pesa (calibrado: ideal × pior ≈ 4–8 pp numa MD3 para elencos
// de perfis bem diferentes — scripts/measure-estilo.mts, test-estilo.mts)
export const STYLE_FIT = 0.6;

export function styleShape(side: 't' | 'ct', s: StyleId, P0: StyleProfile): StyleShape {
  if (s === 'standard') return NONE;
  const P: StyleProfile = { ...P0 };
  for (const k of ['entry', 'hold', 'sense', 'post', 'retake', 'clutch', 'trade', 'util', 'igl'] as const) P[k] = P0[k] * STYLE_FIT;
  const aggFit = (P.agg - P.pas) * 0.5; // −0.5..+0.5
  if (side === 't') {
    switch (s) {
      case 'aggressive': return {
        open: 0.01 + 0.05 * P.entry + 0.04 * aggFit, mid: -0.062 + 0.025 * P.trade, post: -0.03,
        trade: 1.03, plant: 1.04, time: 0.75, k: 0.93, oppPlant: 1,
        engOpen: (r, st) => (st === 'aggressive' ? 1.3 : r === 'entry' || r === 'second' ? 1.15 : 1),
      };
      case 'passive': return {
        open: -0.02, mid: 0.027 + 0.045 * P.sense, post: 0.01 + 0.045 * P.post + 0.04 * P.clutch - 0.03 * aggFit,
        trade: 0.95, plant: 0.94, time: 1.3, k: 1, oppPlant: 1,
        engOpen: (r, st) => (st === 'passive' || r === 'lurker' ? 0.8 : 1),
        engPost: (r, st) => (r === 'lurker' || st === 'passive' ? 1.3 : 1),
      };
      case 'control': return {
        open: -0.01, mid: -0.036 + 0.045 * P.igl + 0.03 * P.util + 0.02 * P.sense, post: 0,
        trade: 1, plant: 0.97, time: 1.35, k: 1.07, oppPlant: 1,
        engMid: (r) => (r === 'igl' || r === 'support' ? 1.15 : 1),
      };
      case 'rush': return {
        open: -0.05 + 0.035 * P.entry, mid: -0.0825 + 0.035 * P.util + 0.03 * P.trade, post: -0.03,
        trade: 1.06, plant: 1.12, time: 0.4, k: 0.95, oppPlant: 1,
        engOpen: (r) => (r === 'entry' || r === 'second' ? 1.25 : r === 'lurker' ? 0.85 : 1),
      };
      default: return NONE;
    }
  }
  switch (s) {
    case 'aggressive': return {
      open: 0.02 + 0.05 * P.entry + 0.04 * aggFit, mid: -0.069 + 0.025 * P.trade, post: -0.03,
      trade: 1.02, plant: 1, time: 1, k: 0.93, oppPlant: 1,
      engOpen: (r, st) => (st === 'aggressive' ? 1.3 : r === 'entry' || r === 'rotator' ? 1.15 : 1),
    };
    case 'passive': return {
      open: -0.02 + 0.03 * P.hold, mid: -0.03 + 0.035 * P.sense, post: 0.0 + 0.035 * P.retake + 0.035 * P.clutch - 0.03 * aggFit,
      trade: 0.97, plant: 1, time: 1, k: 1, oppPlant: 1,
      engOpen: (r, st) => (r === 'anchor' || r === 'awp' || st === 'passive' ? 1.2 : st === 'aggressive' ? 0.85 : 1),
    };
    case 'control': return {
      open: 0, mid: -0.072 + 0.045 * P.igl + 0.03 * P.sense + 0.02 * P.util, post: 0,
      trade: 1.02, plant: 1, time: 1, k: 1.07, oppPlant: 1,
      engMid: (r) => (r === 'igl' || r === 'rotator' ? 1.15 : 1),
    };
    case 'retake': return {
      open: -0.04, mid: -0.032, post: 0.0 + 0.05 * P.retake + 0.025 * P.util + 0.02 * P.trade,
      trade: 1.05, plant: 1, time: 1, k: 1, oppPlant: 1.2,
      engPost: (r) => (r === 'rotator' || r === 'entry' ? 1.25 : 1),
    };
    default: return NONE;
  }
}

// Confronto de estilos (unidades; + = favorece o T). Linhas = CT, colunas = T.
// Padrão é neutro contra tudo.
export const STYLE_RPS: Record<StyleCT, Record<StyleT, number>> = {
  standard: { standard: 0, aggressive: 0, passive: 0, control: 0, rush: 0 },
  aggressive: { standard: 0, aggressive: 0.5, passive: -1, control: -1, rush: 1.5 },
  passive: { standard: 0, aggressive: -1, passive: 0.5, control: 1, rush: 0 },
  control: { standard: 0, aggressive: 0.5, passive: 0.5, control: 0, rush: -1 },
  retake: { standard: 0, aggressive: 0.5, passive: 0, control: 1, rush: -1.5 },
};

/** Qualidade de execução do estilo: familiaridade do estilo × familiaridade do mapa (fase 2). */
export const styleQuality = (styleFam: number, mapFam = 50) => (0.3 + 0.7 * clamp(styleFam, 0, 100) / 100) * (0.75 + 0.5 * clamp(mapFam, 0, 100) / 100);

export interface StyleModsCtx {
  side: 't' | 'ct';
  style: StyleId;
  q: number;                 // styleQuality
  profile: StyleProfile;
  ids: string[];
  roles: MapRole[];
  styles: Playstyle[];
  oppStyle?: StyleId | null; // estilo do adversário no lado oposto (null = adversário sem tática)
  oppQ?: number;
  live?: boolean;            // chamada/postura ao vivo: ritmo do estilo (plant/tempo) sai
}

/** Modificadores do estilo para um lado, no formato do contrato do motor (somados à tática por mapa). */
export function styleDuelMods(c: StyleModsCtx): Partial<TacticDuelMods> & { teamLogit: number } {
  const sh = styleShape(c.side, c.style, c.profile);
  const q = c.q;
  let teamLogit = 0;
  if (c.side === 't' && c.oppStyle) {
    const v = STYLE_RPS[c.oppStyle as StyleCT]?.[c.style as StyleT] ?? 0;
    teamLogit += STYLE_RPS_LOGIT * v * (v > 0 ? q : c.oppQ ?? 1);
  }
  if (sh === NONE) return { teamLogit };
  const out: Partial<TacticDuelMods> & { teamLogit: number } = { teamLogit };
  out.phaseLogit = { open: sh.open * q, mid: sh.mid * q, post: sh.post * q };
  const lerp = (m: number) => 1 + (m - 1) * q;
  if (sh.trade !== 1) out.tradeMult = lerp(sh.trade);
  if (sh.k !== 1) out.kMult = lerp(sh.k);
  if (!c.live) {
    if (sh.plant !== 1) out.plantMult = lerp(sh.plant);
    if (sh.time !== 1) out.timeMult = lerp(sh.time);
  }
  if (sh.oppPlant !== 1) out.oppPlantMult = lerp(sh.oppPlant);
  const eng = (f?: (r: MapRole, s: Playstyle) => number) => {
    if (!f) return undefined;
    const o: Record<string, number> = {};
    c.ids.forEach((id, i) => { const m = f(c.roles[i], c.styles[i]); if (m !== 1) o[id] = lerp(m); });
    return Object.keys(o).length ? o : undefined;
  };
  const eo = eng(sh.engOpen), em = eng(sh.engMid), ep = eng(sh.engPost);
  if (eo) out.engageWeight = eo;
  if (em) out.engageMid = em;
  if (ep) out.engagePost = ep;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura para a interface: ENCAIXE do estilo com o elenco (as MESMAS formas).
//
// Estimativa do efeito em pontos percentuais dos rounds DAQUELE LADO contra um
// adversário Padrão. Pesos por unidade medidos no motor (regressão sobre
// scripts/measure-estilo.mts, 5 perfis × 8 estilos × 3000 mapas; R² ≈ 0,7;
// `base` = intercepto da regressão) —
// test-estilo.mts confere que o encaixe ordena os estilos como a simulação.

const W_PP = { base: 0.35, open: 8.5, mid: 14.5, post: 12.5, trade: 7, plant: 12, oppPlant: -2 };

export function styleFitPp(side: 't' | 'ct', s: StyleId, P: StyleProfile, q = 1): number {
  const sh = styleShape(side, s, P);
  if (sh === NONE) return 0;
  return q * (W_PP.base + W_PP.open * sh.open + W_PP.mid * sh.mid + W_PP.post * sh.post
    + W_PP.trade * (sh.trade - 1) + W_PP.plant * (sh.plant - 1) + W_PP.oppPlant * (sh.oppPlant - 1));
}

/** Encaixe 0–100 (50 = igual ao Padrão) e o efeito em pp de round no lado. */
export function styleFit(side: 't' | 'ct', s: StyleId, P: StyleProfile, styleFam = 100, mapFam = 50): { score: number; pp: number } {
  const pp = styleFitPp(side, s, P, styleQuality(styleFam, mapFam));
  return { score: Math.round(clamp(50 + pp * 30, 0, 100)), pp: Math.round(pp * 10) / 10 };
}

/** Variância do estilo (para a tela): < 1 = mais imprevisível, > 1 = mais controlado. */
export const styleVariance = (side: 't' | 'ct', s: StyleId) => styleShape(side, s, NEUTRAL_PROFILE).k;

// ─────────────────────────────────────────────────────────────────────────────
// Familiaridade

export function gainStyleFam(state: TacticsState, side: 't' | 'ct', s: StyleId, points: number): TacticsState {
  if (s === 'standard' || !Number.isFinite(points) || points === 0) return state;
  const f = styleFamOf(state, side, s);
  const next = clamp(points > 0 ? f + points * (1 - f / 130) : f + points, 0, 100);
  return { ...state, styleFam: { ...(state.styleFam ?? {}), [styleKey(side, s)]: r1(next) } };
}

/** Fim de série: os estilos usados ganham (por mapa jogado), os outros decaem até o piso. */
export function styleAfterSeries(state: TacticsState, mapsPlayed: number, famGainMult = 1): TacticsState {
  const cur = styleOf(state);
  const fam: Partial<Record<string, number>> = { ...(state.styleFam ?? {}) };
  for (const [side, list] of [['t', STYLES_T], ['ct', STYLES_CT]] as const) {
    for (const s of list) {
      if (s === 'standard' || s === cur[side]) continue;
      const k = styleKey(side, s);
      const f = fam[k];
      if (typeof f === 'number' && f > STYLE_FAM_FLOOR) fam[k] = r1(Math.max(STYLE_FAM_FLOOR, f - STYLE_FAM_DECAY));
    }
  }
  let out: TacticsState = { ...state, styleFam: fam };
  if (mapsPlayed > 0) {
    out = gainStyleFam(out, 't', cur.t, STYLE_FAM_GAIN * mapsPlayed * famGainMult);
    out = gainStyleFam(out, 'ct', cur.ct, STYLE_FAM_GAIN * mapsPlayed * famGainMult);
  }
  if (!Object.keys(out.styleFam ?? {}).length) delete out.styleFam;
  return out;
}

export function setStyle(state: TacticsState, patch: Partial<TeamStyle>): TacticsState {
  const style = { ...styleOf(state), ...patch };
  return { ...state, style };
}

// ─────────────────────────────────────────────────────────────────────────────
// IA: estilo coerente com o elenco, o técnico, o IGL e o playbook

export interface AiStyleTeam { players: StylePlayer[]; coach?: Pick<Coach, 'style' | 'rating'>; playbook?: Playbook }

/** Margem (logit) que um estilo precisa ter sobre o Padrão para a IA adotá-lo. */
export const AI_STYLE_MARGIN = 0.2; // pp de round no lado: só adota com encaixe claro

export function aiStyle(team: AiStyleTeam): { style: TeamStyle; fam: Partial<Record<string, number>> } {
  const P = styleProfile(team.players);
  const coach = team.coach?.style;
  const pb = team.playbook;
  const lean = (side: 't' | 'ct', s: StyleId): number => {
    let l = 0;
    if (s === 'aggressive' || s === 'rush') l += (coach === 'aggressive' ? 0.15 : 0) + (pb === 'aggressive' || pb === 'fast' ? 0.15 : 0);
    if (s === 'control') l += (coach === 'tactical' ? 0.15 : 0) + (pb === 'tactical' || pb === 'controlled' ? 0.15 : 0);
    if (s === 'passive' || s === 'retake') l += (coach === 'discipline' ? 0.15 : 0) + (pb === 'controlled' ? 0.1 : 0);
    if (side === 't' && s === 'rush' && pb !== 'fast') l -= 0.1;
    return l;
  };
  const pick = <S extends StyleId>(side: 't' | 'ct', list: S[]): S => {
    let best = 'standard' as S, bv = AI_STYLE_MARGIN + (side === 'ct' ? -0.15 : 0);
    for (const s of list) {
      if (s === 'standard') continue;
      const v = styleFitPp(side, s, P, 1) + lean(side, s);
      if (v > bv) { bv = v; best = s; }
    }
    return best;
  };
  const style: TeamStyle = { t: pick('t', STYLES_T), ct: pick('ct', STYLES_CT) };
  const f = Math.round(clamp(55 + ((team.coach?.rating ?? 75) - 75) * 0.5, 35, 80));
  const fam: Partial<Record<string, number>> = {};
  if (style.t !== 'standard') fam[styleKey('t', style.t)] = f;
  if (style.ct !== 'standard') fam[styleKey('ct', style.ct)] = f;
  return { style, fam };
}

// ─────────────────────────────────────────────────────────────────────────────
// Estatística de estilo (pós-jogo): sai da cadeia de duelos (engine.ts)

export interface StyleStats {
  rounds: number;
  tRounds: number; ctRounds: number;
  openWon: number;          // rounds com o primeiro abate do time
  trades: number;           // abates de troca
  plants: number;           // rounds de T com a bomba plantada
  postWon: number;          // rounds de T vencidos depois do plant
  retakes: number;          // rounds de CT vencidos depois do plant do adversário
  ctPlantsAgainst: number;  // rounds de CT com bomba plantada contra
  timeWins: number;         // rounds de CT vencidos pelo tempo
  clutchWon: number;        // 1vX vencidos
}

export const emptyStyleStats = (): StyleStats => ({ rounds: 0, tRounds: 0, ctRounds: 0, openWon: 0, trades: 0, plants: 0, postWon: 0, retakes: 0, ctPlantsAgainst: 0, timeWins: 0, clutchWon: 0 });

export function sumStyleStats(xs: (StyleStats | undefined)[]): StyleStats {
  const o = emptyStyleStats();
  for (const x of xs) if (x) for (const k of Object.keys(o) as (keyof StyleStats)[]) o[k] += x[k] ?? 0;
  return o;
}
