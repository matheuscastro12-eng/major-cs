// Cérebro do bot: máquina de estados PURA. Recebe percepção + mundo e devolve
// a intenção (estado, para onde andar, onde mirar, se pode atirar). Sem three,
// sem DOM, sem aleatoriedade própria (o `roll` vem do sim, semeado).
import type { BotProfile } from './botProfile';

export type BotState = 'HOLD' | 'ALERT' | 'ENGAGE' | 'REPOSITION' | 'RETAKE_RUSH' | 'TRADE';

export interface Vec2 { x: number; z: number }

export interface BotSelf {
  state: BotState;
  hp: number;
  pos: Vec2;
  hold: Vec2;          // posição de hold atribuída
  holdAim: Vec2;       // ângulo que segura
  cover: Vec2;         // ponto de cobertura para REPOSITION
  lastKnown: Vec2 | null;
  stateTime: number;   // s no estado atual
  profile: BotProfile;
}

export interface Perception {
  sees: boolean;
  playerPos: Vec2 | null;            // só quando vê
  heard: { pos: Vec2; kind: 'step' | 'shot' | 'defuse' } | null;
  tradeCue: Vec2 | null;             // companheiro morreu perto: de onde veio o tiro
  roll: number;                      // 0..1 semeado
}

export interface World {
  defusing: boolean;
  bomb: Vec2;
  peekers: number;      // outros bots dando peek agora (ENGAGE/ALERT andando/TRADE/RUSH)
  isTradeWaiter: boolean; // o de maior teamwork espera para dar o trade
  teammatesAlive: number;
}

export interface Intent {
  state: BotState;
  moveTo: Vec2 | null;
  aimAt: Vec2 | null;
  fire: boolean;
}

export const MAX_PEEKERS = 2;

export function isPeeking(s: BotState, moving: boolean): boolean {
  return s === 'ENGAGE' || s === 'TRADE' || s === 'RETAKE_RUSH' || (s === 'ALERT' && moving);
}

export function decide(bot: BotSelf, p: Perception, w: World): Intent {
  const pr = bot.profile;
  // 1) alvo visível: atira; com HP baixo e sem defuse em curso, recua para a cobertura
  if (p.sees && p.playerPos) {
    if (bot.hp < pr.retreatHp && !w.defusing && w.teammatesAlive > 0 && bot.state !== 'REPOSITION' && p.roll > pr.aggression) {
      return { state: 'REPOSITION', moveTo: bot.cover, aimAt: p.playerPos, fire: true };
    }
    return { state: 'ENGAGE', moveTo: null, aimAt: p.playerPos, fire: true };
  }
  // 2) defuse começou: todo mundo empurra a bomba
  if (w.defusing) {
    return { state: 'RETAKE_RUSH', moveTo: w.bomb, aimAt: w.bomb, fire: false };
  }
  const canPeek = w.peekers < MAX_PEEKERS;
  // 3) companheiro morreu perto: peek no ângulo de onde veio o tiro
  if (p.tradeCue && canPeek) {
    return { state: 'TRADE', moveTo: p.tradeCue, aimAt: p.tradeCue, fire: false };
  }
  // continuação de estados com alvo de movimento
  if (bot.state === 'TRADE' && bot.lastKnown && canPeek && bot.stateTime < 4) {
    return { state: 'TRADE', moveTo: bot.lastKnown, aimAt: bot.lastKnown, fire: false };
  }
  if (bot.state === 'REPOSITION' && bot.stateTime < 3) {
    return { state: 'REPOSITION', moveTo: bot.cover, aimAt: bot.lastKnown ?? bot.holdAim, fire: false };
  }
  // 4) perdeu o alvo depois de trocar tiro: agressivo empurra o lastKnown, o resto reposiciona
  if (bot.state === 'ENGAGE' && bot.lastKnown) {
    if (p.roll < pr.aggression * 0.6 && canPeek && !w.isTradeWaiter) {
      return { state: 'ALERT', moveTo: bot.lastKnown, aimAt: bot.lastKnown, fire: false };
    }
    return { state: 'REPOSITION', moveTo: bot.cover, aimAt: bot.lastKnown, fire: false };
  }
  // 5) ouviu algo: pre-aim no som; quem tem clutch/adaptabilidade alto vai atrás
  if (p.heard || (bot.state === 'ALERT' && bot.lastKnown && bot.stateTime < 6)) {
    const target = p.heard?.pos ?? bot.lastKnown!;
    const push = canPeek && !w.isTradeWaiter && p.roll < pr.aggression * 0.5;
    return { state: 'ALERT', moveTo: push ? target : null, aimAt: target, fire: false };
  }
  // 6) segura o ângulo
  return { state: 'HOLD', moveTo: bot.hold, aimAt: bot.holdAim, fire: false };
}
