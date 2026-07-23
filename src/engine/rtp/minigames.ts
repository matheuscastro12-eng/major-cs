// RTP v6 — MINIGAMES: as ações de treino deixam de ser "1 clique = ganho
// instantâneo". Você abre um minijogo curto; quanto melhor joga (perf 0..1),
// mais perto do ganho TOTAL daquele treino você extrai. Puro, sem React.
//
// O perf entra no SLOT DE SCALE do applyTraining (perf=0.5 ≈ metade do orçamento
// de XP da sessão) e modula os deltas de vida de gym/demos. Nada mais muda: o
// teto de potencial é o mesmo, então jogar bem só ENCHE o XP mais rápido.

import { makeRng, type Rng } from '../rng';
import type { ActionKind } from './weekly';
import type { RtpIconName } from './icons';

export type MiniGameId = 'flick' | 'reaction' | 'spray' | 'memory' | 'tempo'
  | 'prefire' | 'nade' | 'holdangle';

export interface MiniGameDef {
  id: MiniGameId;
  title: string;
  icon: RtpIconName;
  blurb: string;            // instrução curta
  durationMs: number;       // teto duro de tempo (o jogo se auto-resolve nele)
  scoreToPerf: (raw: number) => number;   // curva com FLOOR (ação nunca é inútil) + teto 1.0
}

// Cada ação treinável → um POOL de minijogos que ROTACIONA por semana (variant
// = tick do rng): repetir o mesmo puzzle toda semana matava a graça. rest/
// social/stream ficam INSTANTÂNEOS (jogar um puzzle pra "descansar" é anti-fun).
export const ACTION_GAMES: Partial<Record<ActionKind, MiniGameId[]>> = {
  'train:mechanical': ['flick', 'prefire'],
  'train:physical': ['reaction'],
  'train:mental': ['tempo'],
  gym: ['spray'],
  demos: ['memory', 'holdangle'],
};

// perf de quem PULA o minijogo (botão "pular") ou de paths automáticos: pequeno
// custo de oportunidade por não jogar, e mantém o auto-sim determinístico.
export const AUTO_PERF = 0.85;

// floor garante que uma ação consumida nunca vale zero; teto 1.0.
const curve = (floor: number) => (raw: number) => {
  const r = Math.max(0, Math.min(1, raw));
  return Math.max(0, Math.min(1, floor + (1 - floor) * r));
};

export const MINIGAMES: Record<MiniGameId, MiniGameDef> = {
  flick:     { id: 'flick',     title: 'Treino de mira',     icon: 'crosshair', blurb: 'Acerte os alvos o mais rápido e preciso que conseguir.',       durationMs: 11000, scoreToPerf: curve(0.45) },
  reaction:  { id: 'reaction',  title: 'Tempo de reação',    icon: 'physical',  blurb: 'Clique no instante em que ficar verde — sem adiantar.',        durationMs: 9000,  scoreToPerf: curve(0.50) },
  spray:     { id: 'spray',     title: 'Controle de spray',  icon: 'spark',     blurb: 'Siga a linha do recuo o mais colado possível.',               durationMs: 6500,  scoreToPerf: curve(0.40) },
  memory:    { id: 'memory',    title: 'Memória de calls',   icon: 'brain',     blurb: 'Repita a sequência que piscar na grade.',                      durationMs: 13000, scoreToPerf: curve(0.45) },
  tempo:     { id: 'tempo',     title: 'Timing',             icon: 'focus',     blurb: 'Pare a barra na zona — quanto mais no centro, melhor.',        durationMs: 9000,  scoreToPerf: curve(0.45) },
  prefire:   { id: 'prefire',   title: 'Prefire nos ângulos', icon: 'mech',     blurb: 'Dispare quando a mira cruzar cada cabeça — sem atrasar.',      durationMs: 11000, scoreToPerf: curve(0.45) },
  nade:      { id: 'nade',      title: 'Utilitária perfeita', icon: 'bomb',     blurb: 'Puxe, mire o arco e solte — a granada tem que cair no alvo.',  durationMs: 13000, scoreToPerf: curve(0.40) },
  holdangle: { id: 'holdangle', title: 'Segure o ângulo',     icon: 'skull',    blurb: 'Atire em quem peekar — mas NUNCA no seu aliado.',              durationMs: 10000, scoreToPerf: curve(0.45) },
};

// variant tipicamente = save.rng.tick (semana): o pool rotaciona sozinho e o
// auto-sim segue determinístico. Sem variant, cai no primeiro do pool.
export function gameForAction(kind: ActionKind, variant = 0): MiniGameDef | null {
  const pool = ACTION_GAMES[kind];
  if (!pool || pool.length === 0) return null;
  return MINIGAMES[pool[Math.abs(variant) % pool.length]];
}

// Seed determinístico do layout (igual ao actionRng do weekly): o layout é
// reproduzível, mas o SCORE é input ao vivo — jogo manual deixa de ser 100%
// seed-reproduzível de propósito (auto-sim usa AUTO_PERF → determinístico).
export function miniSeed(save: { rng: { seed: number; tick: number } }): number {
  return (save.rng.seed ^ (save.rng.tick * 0x9e3779b1)) >>> 0;
}
export function miniRng(seed: number): Rng { return makeRng(seed); }

// ── Contrato dos componentes de minijogo (cada um implementa isto) ───────────
// O componente desenha a arena (~320px), roda seu mecanismo, se auto-resolve no
// teto de tempo e chama onFinish(raw 0..1). O MiniGameModal cuida do 3-2-1, da
// conversão raw→perf (scoreToPerf) e da banda de resultado.
export interface MiniGameProps {
  seed: number;
  durationMs: number;
  reducedMotion: boolean;
  onFinish: (raw: number) => void;   // raw 0..1 (cru); o modal aplica scoreToPerf
}
