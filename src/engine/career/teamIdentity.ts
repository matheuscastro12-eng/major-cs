// CARREIRA — IDENTIDADE TÁTICA EMERGENTE (o metagame da Chamada).
//
// A Chamada (battleCalls.ts) põe a decisão do round na mão do jogador. Este
// módulo faz o jogo LEMBRAR dessas decisões: cada chamada feita entra num
// histograma por time (chamada × postura × lado × economia) que decai a cada
// partida. Do histograma sai um RÓTULO emergente ("Time de rush", "Economia de
// ferro", "Retake ou nada", "Camaleão"), com força 0..1 e a estatística que o
// justifica ("62% dos rounds de T abriram em rush").
//
// A identidade não é só cosmética — ela cria o metagame:
//   • VANTAGEM: fazer a chamada "de casa" (a que define a identidade) dá um
//     bônus pequeno — o time treinou aquilo (HOME_PP).
//   • VULNERABILIDADE: o adversário, com `scouting` proporcional à força e ao
//     coach dele, LÊ a tendência e contra — quando a chamada de casa sai, o
//     round pesa contra (COUNTER_PP × força da identidade × scouting).
//   • Camaleão (equilibrado) não ganha bônus nem pode ser lido.
// O mesmo mecanismo vale nos dois sentidos: times da IA têm identidade derivada
// do elenco/coach/playbook (derivedIdentity), o jogador lê e contra também.
//
// FONTE DA VERDADE: este módulo NÃO decide round. Ele devolve um desvio de
// probabilidade (identityRoundDelta) que o engine/match.ts aplica no MESMO
// roundEffect usado por step() e peekWinProb() — a % da tela é a % rolada.
// Puro e determinístico: sem RNG, sem relógio, sem React.

import type { Playstyle, TTeam } from '../../types';
import type { BuyTier, RoundCall, Stance } from '../match';

// ─────────────────────────────────────────────────────────────────────────────
// Registro de chamadas (o histograma)

/** Faixa econômica do round ANTES da chamada: pistola, sem caixa (< full buy) ou full. */
export type IdentityEcon = 'pistol' | 'low' | 'full';
/** Tipo de chamada registrada; 'default' = "jogar o padrão" (sem one-shot). */
export type IdentityCallKind = RoundCall | 'default';

export interface IdentityCall {
  side: 'ct' | 't';
  call: IdentityCallKind;
  stance: Stance;
  econ: IdentityEcon;
}

/** Histograma decaído das chamadas de um time. Campo OPCIONAL do save (`identity?`). */
export interface TeamIdentity {
  hist: Record<string, number>; // chave "lado|chamada|postura|econ" → peso (decai por partida)
  total: number;                // soma dos pesos (mesma decadência)
  matches: number;              // partidas contabilizadas (inteiro; 0 = identidade sintética)
}

/** Fator de decaimento por partida: a identidade é do que você chama HOJE. Com
 *  ~6 chamadas por mapa, o regime estável fica em ~6/(1−0.85) ≈ 40 de peso. */
export const IDENTITY_DECAY = 0.85;
/** Amostra mínima (peso) pra rotular — abaixo disso o time "ainda não tem cara". */
export const IDENTITY_MIN_CALLS = 12;
/** Amostra mínima do RECORTE de um traço (ex.: rounds de T) pra ele contar. */
export const TRAIT_MIN_SAMPLE = 5;

export function emptyIdentity(): TeamIdentity {
  return { hist: {}, total: 0, matches: 0 };
}

export const econOf = (buy: BuyTier): IdentityEcon =>
  buy === 'pistol' ? 'pistol' : buy === 'full' ? 'full' : 'low';

/** Monta o registro de UMA chamada a partir do que o MapSim/MatchScreen já tem
 *  em mãos: lado, compra natural do round e (stance, call) entregues ao step. */
export function identityCallOf(side: 'ct' | 't', buy: BuyTier, stance?: Stance, call?: RoundCall | null): IdentityCall {
  return { side, call: call ?? 'default', stance: stance ?? 'default', econ: econOf(buy) };
}

export const callKey = (c: IdentityCall): string => `${c.side}|${c.call}|${c.stance}|${c.econ}`;

export function parseCallKey(key: string): IdentityCall | null {
  const [side, call, stance, econ] = key.split('|');
  if ((side !== 'ct' && side !== 't') || !call || !stance || !econ) return null;
  return { side, call: call as IdentityCallKind, stance: stance as Stance, econ: econ as IdentityEcon };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Soma chamadas (peso 1 cada) — não decai; use closeMatchIdentity no fim da partida. */
export function recordCalls(identity: TeamIdentity | undefined, calls: IdentityCall[]): TeamIdentity {
  const base = identity ?? emptyIdentity();
  const hist = { ...base.hist };
  for (const c of calls) {
    const k = callKey(c);
    hist[k] = round3((hist[k] ?? 0) + 1);
  }
  return { hist, total: round3(base.total + calls.length), matches: base.matches };
}

/** Decaimento de UMA partida: pesos antigos valem menos; migalhas (< 0.01) somem. */
export function decayIdentity(identity: TeamIdentity | undefined, factor = IDENTITY_DECAY): TeamIdentity {
  const base = identity ?? emptyIdentity();
  const hist: Record<string, number> = {};
  let total = 0;
  for (const [k, w] of Object.entries(base.hist)) {
    const v = round3(w * factor);
    if (v < 0.01) continue;
    hist[k] = v;
    total += v;
  }
  return { hist, total: round3(total), matches: base.matches + 1 };
}

/** Fechamento de partida: decai o passado e grava as chamadas de hoje com peso cheio. */
export function closeMatchIdentity(identity: TeamIdentity | undefined, calls: IdentityCall[]): TeamIdentity {
  return recordCalls(decayIdentity(identity), calls);
}

/** Leitor tolerante do campo do save (save antigo → undefined, lixo → undefined). */
export function normalizeIdentity(value: unknown): TeamIdentity | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const hist: Record<string, number> = {};
  let total = 0;
  if (v.hist && typeof v.hist === 'object' && !Array.isArray(v.hist)) {
    for (const [k, raw] of Object.entries(v.hist as Record<string, unknown>)) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || !parseCallKey(k)) continue;
      hist[k] = round3(n);
      total += n;
    }
  }
  const matches = Number(v.matches);
  return { hist, total: round3(total), matches: Number.isFinite(matches) ? Math.max(0, Math.round(matches)) : 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rótulo emergente

export type IdentityKind =
  | 'rush' | 'retake' | 'iron' | 'force' | 'aggressive' | 'cautious' | 'system'
  | 'chameleon' | 'none';

export interface IdentityLabel {
  kind: IdentityKind;
  label: string;     // "Time de rush"
  strength: number;  // 0..1 (0 = sem identidade)
  share: number;     // 0..1 — a fração que justifica o rótulo
  sample: number;    // peso do recorte usado na estatística
  stat: string;      // "62% dos rounds de T abriram em rush"
  hint: string;      // o que a identidade dá e expõe (texto pro card)
}

interface Trait {
  kind: Exclude<IdentityKind, 'chameleon' | 'none'>;
  label: string;
  minShare: number;                     // a partir daqui o traço "fecha"
  pool: (c: IdentityCall) => boolean;   // recorte em que a estatística é medida
  hit: (c: IdentityCall) => boolean;    // a chamada que define o traço
  stat: (pct: number) => string;
  hint: string;
}

const TRAITS: Trait[] = [
  {
    kind: 'rush', label: 'Time de rush', minShare: 0.45,
    pool: (c) => c.side === 't', hit: (c) => c.call === 'rush',
    stat: (p) => `${p}% dos rounds de T abriram em rush`,
    hint: 'O rush sai treinado (bônus na chamada). Quem te estuda segura o CT e espera.',
  },
  {
    kind: 'retake', label: 'Retake ou nada', minShare: 0.45,
    pool: (c) => c.side === 'ct', hit: (c) => c.call === 'retake',
    stat: (p) => `${p}% dos rounds de CT cederam o site pra retomar`,
    hint: 'O retake é automático pro elenco (bônus). Quem te estuda bate rápido antes de você juntar.',
  },
  {
    kind: 'iron', label: 'Economia de ferro', minShare: 0.5,
    pool: (c) => c.econ === 'low', hit: (c) => c.call === 'save',
    stat: (p) => `${p}% dos rounds sem caixa foram save`,
    hint: 'O save rende (bônus): o time sabe poupar. Quem te estuda vai pra cima nos seus ecos.',
  },
  {
    kind: 'force', label: 'Aposta tudo', minShare: 0.5,
    pool: (c) => c.econ === 'low', hit: (c) => c.call === 'force',
    stat: (p) => `${p}% dos rounds sem caixa foram force`,
    hint: 'O force pega o adversário compondo (bônus). Quem te estuda segura e deixa o force quebrar.',
  },
  {
    kind: 'aggressive', label: 'Sempre pra cima', minShare: 0.5,
    pool: () => true, hit: (c) => c.stance === 'aggressive',
    stat: (p) => `${p}% das chamadas foram agressivas`,
    hint: 'A agressão vem natural (bônus). Quem te estuda joga cauteloso e te deixa correr na utilidade.',
  },
  {
    kind: 'cautious', label: 'Muralha', minShare: 0.5,
    pool: () => true, hit: (c) => c.stance === 'cautious',
    stat: (p) => `${p}% das chamadas foram cautelosas`,
    hint: 'Segurar é o forte (bônus). Quem te estuda pressiona cedo — você não gosta de duelo.',
  },
  {
    kind: 'system', label: 'Time de sistema', minShare: 0.55,
    pool: () => true, hit: (c) => c.call === 'default',
    stat: (p) => `${p}% das chamadas foram o padrão treinado`,
    hint: 'O padrão roda redondo (bônus). Quem te estuda varia — o sistema não se adapta.',
  },
];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (f: number) => Math.round(f * 100);

export const IDENTITY_LABEL: Record<IdentityKind, string> = {
  rush: 'Time de rush', retake: 'Retake ou nada', iron: 'Economia de ferro', force: 'Aposta tudo',
  aggressive: 'Sempre pra cima', cautious: 'Muralha', system: 'Time de sistema',
  chameleon: 'Camaleão', none: 'Sem identidade ainda',
};

/** O substantivo da tendência, pro texto de contra ("estudou o seu rush"). */
export const IDENTITY_NOUN: Record<IdentityKind, string> = {
  rush: 'rush', retake: 'retake', iron: 'save', force: 'force', aggressive: 'jogo agressivo',
  cautious: 'jogo cauteloso', system: 'padrão', chameleon: '', none: '',
};

/** O que fazer CONTRA um time com essa identidade (o jogador lê o adversário). */
export const COUNTER_HINT: Record<IdentityKind, string> = {
  rush: 'Segura o CT e retoma — não dá duelo na abertura.',
  retake: 'Bate rápido no T, antes do time deles se juntar.',
  iron: 'Quando eles estão sem caixa, vai pra cima: o save deles é previsível.',
  force: 'Segura a posição e espera o force quebrar.',
  aggressive: 'Joga cauteloso e deixa eles correrem pra dentro da utilidade.',
  cautious: 'Pressiona cedo: o time deles não gosta de duelo.',
  system: 'Varia a chamada — o padrão deles não se adapta.',
  chameleon: 'Não dá pra ler — joga o seu jogo.',
  none: '',
};

const NONE: IdentityLabel = {
  kind: 'none', label: IDENTITY_LABEL.none, strength: 0, share: 0, sample: 0,
  stat: `Faça pelo menos ${IDENTITY_MIN_CALLS} chamadas pra o time ganhar cara.`,
  hint: 'Sem identidade ninguém te lê — mas nenhuma chamada sai treinada.',
};

function shareIn(identity: TeamIdentity, trait: Trait): { share: number; sample: number } {
  let pool = 0, hit = 0;
  for (const [k, w] of Object.entries(identity.hist)) {
    const c = parseCallKey(k);
    if (!c || !trait.pool(c)) continue;
    pool += w;
    if (trait.hit(c)) hit += w;
  }
  return { share: pool > 0 ? hit / pool : 0, sample: pool };
}

/** Rótulo emergente do histograma. Só rotula com amostra ≥ IDENTITY_MIN_CALLS;
 *  entre os traços que fecham, vence o mais forte (empate: o mais específico). */
export function identityLabel(identity: TeamIdentity | undefined): IdentityLabel {
  if (!identity || identity.total < IDENTITY_MIN_CALLS) return NONE;
  // confiança da amostra: em MIN vale metade, em 2×MIN vale tudo
  const confidence = clamp01(identity.total / (2 * IDENTITY_MIN_CALLS));
  let best: IdentityLabel | null = null;
  let bestRatio = 0; // share/minShare do traço mais perto de fechar (pro Camaleão)
  for (const t of TRAITS) {
    const { share, sample } = shareIn(identity, t);
    if (sample < TRAIT_MIN_SAMPLE) continue;
    bestRatio = Math.max(bestRatio, share / t.minShare);
    if (share < t.minShare) continue;
    const strength = clamp01((share - t.minShare) / (0.9 - t.minShare)) * confidence;
    if (!best || strength > best.strength) {
      best = { kind: t.kind, label: t.label, strength, share, sample, stat: t.stat(pct(share)), hint: t.hint };
    }
  }
  if (best) return best;
  const strength = clamp01(1 - bestRatio) * confidence;
  return {
    kind: 'chameleon', label: IDENTITY_LABEL.chameleon, strength, share: bestRatio, sample: identity.total,
    stat: 'Nenhuma chamada domina — o adversário não tem o que estudar.',
    hint: 'Ninguém te lê, mas nenhuma chamada sai treinada. Equilíbrio é uma escolha.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Casa × contra (a mecânica do metagame)

/** A chamada é "de casa" dessa identidade? (o time treinou aquilo) */
export function isHomeCall(label: IdentityLabel, c: IdentityCall): boolean {
  switch (label.kind) {
    case 'rush': return c.side === 't' && c.call === 'rush';
    case 'retake': return c.side === 'ct' && c.call === 'retake';
    case 'iron': return c.call === 'save';
    case 'force': return c.call === 'force';
    case 'aggressive': return c.stance === 'aggressive';
    case 'cautious': return c.stance === 'cautious';
    case 'system': return c.call === 'default';
    default: return false;
  }
}

/** A chamada CONTRA a identidade do adversário (`label` é a DELES). */
export function isCounterCall(label: IdentityLabel, c: IdentityCall): boolean {
  const aggro = c.stance === 'aggressive' || c.call === 'rush' || c.call === 'force';
  const careful = c.stance === 'cautious' || c.call === 'retake';
  switch (label.kind) {
    case 'rush': return c.side === 'ct' && careful;
    case 'retake': return c.side === 't' && aggro;
    case 'iron': return aggro;
    case 'force': return careful;
    case 'aggressive': return careful;
    case 'cautious': return aggro;
    case 'system': return c.call !== 'default' && c.stance !== 'default';
    default: return false;
  }
}

/** Time da IA (sem chamada explícita) "joga a identidade" em todo round onde ela cabe. */
export function autoPlaysHome(label: IdentityLabel, side: 'ct' | 't', econ: IdentityEcon): boolean {
  switch (label.kind) {
    case 'rush': return side === 't';
    case 'retake': return side === 'ct';
    case 'iron': case 'force': return econ === 'low';
    case 'aggressive': case 'cautious': case 'system': return true;
    default: return false;
  }
}

/** Bônus da chamada de casa (identidade cheia): +3 pontos percentuais no round. */
export const HOME_PP = 0.03;
/** Contra do adversário (identidade cheia × scouting cheio): −6 pontos percentuais. */
export const COUNTER_PP = 0.06;

/** Quanto um time ESTUDA o adversário (0..1): força + coach. Tier-3 lê pouco (~0.25);
 *  elite com coach de ponta lê quase tudo (~0.9). `prep` soma preparação extra. */
export function scoutingOf(team: Pick<TTeam, 'strength' | 'coach'>, prep = 0): number {
  const coach = team.coach?.rating ?? 70;
  return clamp01(0.2 + (team.strength - 60) / 50 + (coach - 75) / 80 + prep);
}

/** Identidade de um time dentro de UMA partida (opt-in no createMapSim). */
export interface IdentityMod {
  team: 0 | 1;           // dono da identidade
  label: IdentityLabel;  // rótulo emergente (identityLabel)
  readBy: number;        // 0..1 — quanto o ADVERSÁRIO estuda este time (scoutingOf)
  auto: boolean;         // true = IA: sem chamada explícita, joga a identidade onde ela cabe
}

export interface IdentityAction { call: IdentityCallKind; stance: Stance }

export interface IdentityRoundCtx {
  ownerSide: 'ct' | 't';
  ownerEcon: IdentityEcon;
  ownerAction?: IdentityAction; // ausente = sem chamada explícita (IA: auto; usuário: padrão)
  oppAction?: IdentityAction;   // ausente = adversário sem chamada explícita
  oppAuto: boolean;             // adversário é IA (contra automaticamente, pesado por readBy)
}

export interface IdentityRoundDelta {
  pp: number;          // desvio na prob. de vitória do DONO (+casa −contra)
  home: boolean;       // fez a chamada de casa neste round
  countered: boolean;  // o adversário leu e controu
  notes: string[];     // explicação legível ("chamada de casa: +2%", "estudaram o seu rush: −4%")
}

const fmtPp = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;

/** O desvio deste round pra um dono de identidade. Determinístico, sem RNG —
 *  é a MESMA função que o motor aplica e que a UI usa pra explicar. */
export function identityRoundDelta(mod: IdentityMod, ctx: IdentityRoundCtx): IdentityRoundDelta {
  const none: IdentityRoundDelta = { pp: 0, home: false, countered: false, notes: [] };
  const { label } = mod;
  if (label.strength <= 0 || label.kind === 'none' || label.kind === 'chameleon') return none;
  const ownerCall: IdentityCall = {
    side: ctx.ownerSide, econ: ctx.ownerEcon,
    call: ctx.ownerAction?.call ?? 'default', stance: ctx.ownerAction?.stance ?? 'default',
  };
  const home = mod.auto && !ctx.ownerAction ? autoPlaysHome(label, ctx.ownerSide, ctx.ownerEcon) : isHomeCall(label, ownerCall);
  if (!home) return none;
  const bonus = HOME_PP * label.strength;
  const oppSide = ctx.ownerSide === 'ct' ? 't' : 'ct';
  const oppCounters = ctx.oppAuto && !ctx.oppAction
    ? mod.readBy > 0
    : isCounterCall(label, { side: oppSide, econ: ctx.ownerEcon, call: ctx.oppAction?.call ?? 'default', stance: ctx.oppAction?.stance ?? 'default' });
  const penalty = oppCounters ? COUNTER_PP * label.strength * mod.readBy : 0;
  const notes = [`chamada de casa (${label.label.toLowerCase()}): +${fmtPp(bonus)}`];
  if (penalty > 0) notes.push(`o adversário estudou o seu ${IDENTITY_NOUN[label.kind]}: −${fmtPp(penalty)}`);
  return { pp: bonus - penalty, home: true, countered: penalty > 0, notes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Identidade dos adversários (IA) — derivada, determinística

const playstyleOf = (p: { playstyle?: Playstyle; role: string }): Playstyle =>
  p.playstyle ?? (p.role === 'Entry' ? 'aggressive' : p.role === 'Support' || p.role === 'Lurker' ? 'passive' : 'balanced');

/** Histograma SINTÉTICO de um time da IA a partir do que já existe: estilo dos
 *  jogadores, coach e playbook. Sem RNG — o mesmo elenco dá a mesma identidade,
 *  então o jogador pode estudar e contrar (o mesmo mecanismo nos dois sentidos). */
export function derivedIdentity(team: Pick<TTeam, 'players' | 'coach' | 'playbook'>): TeamIdentity {
  const nAgg = team.players.filter((p) => playstyleOf(p) === 'aggressive').length;
  const nPas = team.players.filter((p) => playstyleOf(p) === 'passive').length;
  const coach = team.coach?.style;
  const pb = team.playbook;
  const hist: Record<string, number> = {};
  const add = (side: 'ct' | 't', call: IdentityCallKind, econ: IdentityEcon, w: number) => {
    if (w <= 0) return;
    const stance: Stance = call === 'rush' || call === 'force' ? 'aggressive' : call === 'retake' || call === 'save' ? 'cautious' : 'default';
    const k = callKey({ side, call, stance, econ });
    hist[k] = round3((hist[k] ?? 0) + w);
  };
  // T: rush × padrão × pós-plant
  add('t', 'rush', 'full', 2 + nAgg * 1.2 + (pb === 'fast' || pb === 'aggressive' ? 2.5 : 0) + (coach === 'aggressive' ? 1 : 0));
  add('t', 'default', 'full', 3 + (pb === 'tactical' ? 2 : 0) + (pb === 'controlled' ? 1 : 0));
  add('t', 'retake', 'full', 1 + nPas * 0.6);
  // CT: retake × agressivo pra fora × padrão
  add('ct', 'retake', 'full', 2 + nPas * 1.2 + (pb === 'controlled' ? 2.5 : 0) + (coach === 'discipline' ? 1 : 0));
  add('ct', 'rush', 'full', 1 + nAgg * 0.6 + (pb === 'aggressive' ? 1.5 : 0));
  add('ct', 'default', 'full', 3 + (pb === 'tactical' ? 2 : 0));
  // sem caixa: save × force × padrão (metade em cada lado)
  const save = 2 + (coach === 'discipline' ? 2.5 : 0) + (pb === 'controlled' ? 1 : 0) + nPas * 0.5;
  const force = 2 + (coach === 'aggressive' ? 2.5 : 0) + (pb === 'aggressive' ? 1.5 : 0) + nAgg * 0.5;
  add('t', 'save', 'low', save / 2); add('ct', 'save', 'low', save / 2);
  add('t', 'force', 'low', force / 2); add('ct', 'force', 'low', force / 2);
  add('t', 'default', 'low', 1); add('ct', 'default', 'low', 1);
  const total = round3(Object.values(hist).reduce((s, w) => s + w, 0));
  return { hist, total, matches: 0 };
}
