// Simulação determinística do clutch (tick fixo de 1/60 s). Sem three, sem DOM:
// mesma seed + mesmos inputs ⇒ mesmo resultado (base para replay/GIF depois).
//
// Ordem por tick: input → movimento/colisão do jogador → tiros (hitscan) →
// percepção dos bots (orçamento de raycasts) → botBrain → movimento dos bots →
// bomba/defuse → condições de fim.
import type { ClutchConfig, ClutchEndReason, ClutchResult } from '../types';
import { createBomb, stepBomb, DEFUSE_RANGE_M, DEFUSE_S, type BombState } from './bomb';
import { decide, isPeeking, type BotState, type Vec2 } from './botBrain';
import { botProfileFrom, type BotProfile } from './botProfile';
import { applyDamage, type HitGroup } from './damage';
import {
  buildLevel, lineClear, moveWithCollision, raycastGrid, toWorld, BOMB_MAP, PLAYER_SPAWN_MAP, type Level,
} from './level';
import { buildNavGraph, freeSpot, nodeByName, planPath, type NavGraph } from './navGraph';
import { recoilAt, recoverShotIndex } from './recoil';
import { gauss, makeRng, rand, type RngState } from './rng';
import { WEAPONS, fireInterval, type WeaponId } from './weapons';

export const TICK = 1 / 60;
export const EYE_H = 1.62;
export const BOT_EYE_H = 1.62;
export const FOV_DEG = 100;
export const PERCEPTION_EVERY = 3;
export const HEAR_STEP_M = 12;
export const HEAR_SHOT_M = 40;
export const HEAR_DEFUSE_M = 20;
// alturas das hitboxes (m)
export const H_LEGS = 0.85, H_STOMACH = 1.12, H_TORSO = 1.45, H_HEAD = 1.8;
export const BOT_R = 0.32, HEAD_R = 0.17;

export interface SimInput {
  fwd: boolean; back: boolean; left: boolean; right: boolean;
  walk: boolean; jump: boolean; fire: boolean; use: boolean; reload: boolean;
  yaw: number; pitch: number;          // absolutos (rad); yaw 0 olha para -z
  switchTo: WeaponId | null;
}

export const NO_INPUT: SimInput = {
  fwd: false, back: false, left: false, right: false, walk: false, jump: false, fire: false, use: false, reload: false,
  yaw: 0, pitch: 0, switchTo: null,
};

export interface PlayerSim {
  x: number; z: number; y: number; vy: number; yaw: number; pitch: number;
  hp: number; armor: number; alive: boolean;
  weapon: WeaponId; hasRifle: boolean; ammo: Record<WeaponId, number>;
  cooldown: number; drawT: number; reloadT: number;
  shotIndex: number; shotPeak: number; sinceShot: number; prevFire: boolean;
  moving: boolean; running: boolean; stepT: number;
  punchPitch: number; punchYaw: number; // recoil visual na câmera
}

export interface BotSim {
  id: string; name: string; profile: BotProfile;
  x: number; z: number; yaw: number;
  hp: number; armor: number; alive: boolean;
  state: BotState; stateTime: number;
  hold: Vec2; holdAim: Vec2; cover: Vec2;
  lastKnown: Vec2 | null;
  sees: boolean; reactT: number; aimErr: number; aimBase: number;
  shotIndex: number; cooldown: number; ammo: number; reloadT: number;
  path: Vec2[]; pathTarget: Vec2 | null; pathAge: number;
  moving: boolean; stepT: number;
  heard: { pos: Vec2; kind: 'step' | 'shot' | 'defuse' } | null;
  tradeCue: Vec2 | null;
}

export type SimEvent =
  | { t: 'shot'; by: string; x: number; y: number; z: number; ex: number; ey: number; ez: number; weapon: WeaponId }
  | { t: 'hit'; head: boolean; kill: boolean; victim: string }
  | { t: 'hurt'; dmg: number; head: boolean }
  | { t: 'step'; by: string; x: number; z: number }
  | { t: 'beep' } | { t: 'defuse_start' } | { t: 'defuse_cancel' } | { t: 'defused' } | { t: 'exploded' }
  | { t: 'reload'; by: string } | { t: 'empty' } | { t: 'switch' };

export interface Ctx { level: Level; nav: NavGraph }

export interface SimState {
  tick: number; t: number;
  rng: RngState;
  ctx: Ctx;
  player: PlayerSim;
  bots: BotSim[];
  bomb: BombState; bombPos: Vec2;
  eliminationWins: boolean;
  events: SimEvent[];         // eventos do ÚLTIMO tick (consumidos pelo runtime)
  kills: number; headshots: number; damageDealt: number;
  killFeed: { victimId: string; victim: string; headshot: boolean; tMs: number; byPlayer: boolean }[];
  result: ClutchResult | null;
  canDefuse: boolean;
}

let cachedCtx: Ctx | null = null;
export function getCtx(): Ctx {
  if (!cachedCtx) {
    const level = buildLevel();
    cachedCtx = { level, nav: buildNavGraph(level) };
  }
  return cachedCtx;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapAng = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** yaw que olha de (ax,az) para (bx,bz); yaw 0 = -z */
export const yawTo = (ax: number, az: number, bx: number, bz: number) => Math.atan2(-(bx - ax), -(bz - az));
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

export function createSim(cfg: ClutchConfig): SimState {
  const ctx = getCtx();
  const rng = makeRng(cfg.seed ?? 1);
  const spawn = toWorld(PLAYER_SPAWN_MAP.x, PLAYER_SPAWN_MAP.y);
  const bombPos = toWorld(BOMB_MAP.x, BOMB_MAP.y);
  const hasRifle = cfg.weapons.primary === 'rifle';
  const player: PlayerSim = {
    x: spawn.x, z: spawn.z, y: 0, vy: 0, yaw: yawTo(spawn.x, spawn.z, bombPos.x, bombPos.z), pitch: 0,
    hp: clamp(Math.round(cfg.hp), 1, 100), armor: cfg.armor > 0 ? 100 : 0, alive: true,
    weapon: hasRifle ? 'rifle' : 'pistol', hasRifle, ammo: { rifle: WEAPONS.rifle.mag, pistol: WEAPONS.pistol.mag },
    cooldown: 0, drawT: 0, reloadT: 0, shotIndex: 0, shotPeak: 0, sinceShot: 9, prevFire: false,
    moving: false, running: false, stepT: 0, punchPitch: 0, punchYaw: 0,
  };
  // holds sorteados por seed entre bCT, secret, dentro do B e bT. Nenhum hold
  // enxerga o spawn do jogador (senão o round acaba antes de começar); quem
  // cair num ponto com visão do spawn troca por uma cobertura do site.
  const nav = ctx.nav;
  const seesSpawn = (n: Vec2) => lineClear(ctx.level, n.x, n.z, spawn.x, spawn.z);
  const named = (['bCT', 'secret', 'B', 'bT'] as const).map((n) => nodeByName(nav, n));
  for (let i = named.length - 1; i > 0; i--) {
    const j = Math.floor(rand(rng) * (i + 1));
    [named[i], named[j]] = [named[j], named[i]];
  }
  const covers = nav.nodes.filter((n) => n.cover && dist(n, bombPos) < 12 && !seesSpawn(n));
  const pickCover = (): Vec2 => {
    const c = covers.splice(Math.floor(rand(rng) * covers.length), 1)[0];
    return c ?? bombPos;
  };
  const entry = nodeByName(nav, 'bCT');
  const opps = cfg.opponents.slice(0, 5);
  const bots: BotSim[] = opps.map((o, i) => {
    const profile = botProfileFrom(o.attrs, cfg.difficulty ?? 1);
    const base: Vec2 = i < 3 && !seesSpawn(named[i]) ? named[i] : pickCover();
    let hold: Vec2 = { x: base.x, z: base.z };
    // quem joga mais off-angle sai do ponto óbvio
    if (rand(rng) < profile.offAngleWeight * 0.7) {
      const ang = rand(rng) * Math.PI * 2;
      const cand = { x: hold.x + Math.cos(ang) * 1.4, z: hold.z + Math.sin(ang) * 1.4 };
      if (!seesSpawn(cand) && lineClear(ctx.level, hold.x, hold.z, cand.x, cand.z) && freeSpot(ctx.level, cand.x, cand.z)) hold = cand;
    }
    // ângulo: segura a entrada do CT (bCT); de lá não vendo, segura a bomba
    const holdAim: Vec2 = lineClear(ctx.level, hold.x, hold.z, entry.x, entry.z) && dist(hold, entry) > 2 ? { x: entry.x, z: entry.z } : { x: bombPos.x, z: bombPos.z };
    const cov = nav.nodes.filter((n) => n.cover && dist(n, hold) > 3 && dist(n, hold) < 10).sort((a, b) => dist(a, hold) - dist(b, hold))[0];
    return {
      id: o.id, name: o.name, profile,
      x: hold.x, z: hold.z, yaw: yawTo(hold.x, hold.z, holdAim.x, holdAim.z),
      hp: 100, armor: 100, alive: true,
      state: 'HOLD', stateTime: 0, hold, holdAim, cover: cov ? { x: cov.x, z: cov.z } : hold,
      lastKnown: null, sees: false, reactT: 0, aimErr: 0, aimBase: (profile.aimErrorDeg * Math.PI) / 180,
      shotIndex: 0, cooldown: 0, ammo: 30, reloadT: 0,
      path: [], pathTarget: null, pathAge: 0, moving: false, stepT: rand(rng) * 0.4,
      heard: null, tradeCue: null,
    };
  });
  return {
    tick: 0, t: 0, rng, ctx, player, bots,
    bomb: createBomb(cfg.bombTimeLeft ?? 40), bombPos,
    eliminationWins: cfg.eliminationWins ?? true,
    events: [], kills: 0, headshots: 0, damageDealt: 0, killFeed: [], result: null, canDefuse: false,
  };
}

/** direção 3D a partir de yaw/pitch */
export function dirOf(yaw: number, pitch: number) {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

/** hitscan do jogador contra paredes, chão e hitboxes dos bots (puro) */
export function traceShot(s: SimState, ox: number, oy: number, oz: number, yaw: number, pitch: number):
  { bot: BotSim | null; group: HitGroup | null; dist: number; ex: number; ey: number; ez: number } {
  const d = dirOf(yaw, pitch);
  const hl = Math.hypot(d.x, d.z) || 1e-9;
  const hx = d.x / hl, hz = d.z / hl;
  const slope = d.y / hl; // subida por metro no plano
  let maxS = raycastGrid(s.ctx.level, ox, oz, hx, hz, 80);
  if (slope < 0) maxS = Math.min(maxS, oy / -slope);
  let best: BotSim | null = null, bestS = maxS, bestGroup: HitGroup | null = null;
  for (const b of s.bots) {
    if (!b.alive) continue;
    const cx = b.x - ox, cz = b.z - oz;
    const s0 = cx * hx + cz * hz;
    if (s0 <= 0) continue;
    const perp2 = cx * cx + cz * cz - s0 * s0;
    if (perp2 > BOT_R * BOT_R) continue;
    const sh = s0 - Math.sqrt(BOT_R * BOT_R - perp2);
    if (sh >= bestS) continue;
    // altura na entrada e no centro do cilindro (cobre tiro de cima/baixo)
    const yIn = oy + slope * sh;
    const yMid = oy + slope * s0;
    const y = yIn >= 0 && yIn <= H_HEAD ? yIn : yMid;
    if (y < 0 || y > H_HEAD) continue;
    let group: HitGroup;
    if (y >= H_TORSO) {
      if (perp2 > HEAD_R * HEAD_R) continue; // passou ao lado da cabeça, por cima do ombro
      group = 'head';
    } else if (y >= H_STOMACH) group = 'torso';
    else if (y >= H_LEGS) group = 'stomach';
    else group = 'legs';
    best = b; bestS = sh; bestGroup = group;
  }
  const t3 = bestS / hl;
  return { bot: best, group: bestGroup, dist: t3, ex: ox + d.x * t3, ey: oy + d.y * t3, ez: oz + d.z * t3 };
}

function playerVisibleFrom(s: SimState, b: BotSim): boolean {
  const p = s.player;
  const dx = p.x - b.x, dz = p.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d > 60) return false;
  const ang = Math.abs(wrapAng(yawTo(b.x, b.z, p.x, p.z) - b.yaw));
  if (d > 2 && ang > (FOV_DEG / 2) * (Math.PI / 180)) return false;
  // orçamento: 2 raycasts (centro e borda do corpo)
  if (lineClear(s.ctx.level, b.x, b.z, p.x, p.z)) return true;
  const ox = (-dz / d) * 0.28, oz = (dx / d) * 0.28;
  return lineClear(s.ctx.level, b.x, b.z, p.x + ox, p.z + oz);
}

function endWith(s: SimState, reason: ClutchEndReason) {
  if (s.result) return;
  s.result = {
    won: reason === 'eliminated_all' || reason === 'defused',
    kills: s.kills, headshots: s.headshots, timeMs: Math.round(s.t * 1000), reason,
    damageDealt: s.damageDealt,
    killFeed: s.killFeed.filter((k) => k.byPlayer).map((k) => ({ victimId: k.victimId, headshot: k.headshot, tMs: k.tMs })),
  };
}

export function quit(s: SimState) { endWith(s, 'quit'); }

function hearAll(s: SimState, pos: Vec2, radius: number, kind: 'step' | 'shot' | 'defuse') {
  for (const b of s.bots) {
    if (!b.alive) continue;
    if (dist(b, pos) <= radius) b.heard = { pos: { x: pos.x, z: pos.z }, kind };
  }
}

function stepPlayer(s: SimState, inp: SimInput, dt: number) {
  const p = s.player;
  p.yaw = inp.yaw;
  p.pitch = clamp(inp.pitch, -1.45, 1.45);
  // troca de arma
  if (inp.switchTo && inp.switchTo !== p.weapon && (inp.switchTo !== 'rifle' || p.hasRifle)) {
    p.weapon = inp.switchTo; p.drawT = WEAPONS[p.weapon].drawS; p.reloadT = 0; p.shotIndex = 0;
    s.events.push({ t: 'switch' });
  }
  // movimento
  let mx = 0, mz = 0;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  if (inp.fwd) { mx += fx; mz += fz; }
  if (inp.back) { mx -= fx; mz -= fz; }
  if (inp.right) { mx += rx; mz += rz; }
  if (inp.left) { mx -= rx; mz -= rz; }
  const ml = Math.hypot(mx, mz);
  p.moving = ml > 0;
  p.running = p.moving && !inp.walk;
  if (ml > 0) {
    const speed = (p.weapon === 'rifle' ? 5.0 : 5.4) * (inp.walk ? 0.52 : 1);
    moveWithCollision(s.ctx.level, p, (mx / ml) * speed * dt, (mz / ml) * speed * dt);
    if (p.running && p.y === 0) {
      p.stepT -= dt;
      if (p.stepT <= 0) {
        p.stepT = 0.38;
        s.events.push({ t: 'step', by: 'player', x: p.x, z: p.z });
        hearAll(s, p, HEAR_STEP_M, 'step');
      }
    }
  }
  // pulo simples (cosmético + altura do olho)
  if (inp.jump && p.y === 0) p.vy = 4.2;
  if (p.y > 0 || p.vy > 0) {
    p.vy -= 13 * dt; p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; }
  }
}

function stepPlayerShooting(s: SimState, inp: SimInput, dt: number) {
  const p = s.player;
  const w = WEAPONS[p.weapon];
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.drawT = Math.max(0, p.drawT - dt);
  p.sinceShot += dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) { p.reloadT = 0; p.ammo[p.weapon] = w.mag; }
  }
  if (inp.reload && p.reloadT === 0 && p.ammo[p.weapon] < w.mag) {
    p.reloadT = w.reloadS; s.events.push({ t: 'reload', by: 'player' });
  }
  const trigger = inp.fire && (w.auto || !p.prevFire);
  p.prevFire = inp.fire;
  if (trigger && p.cooldown === 0 && p.drawT === 0 && p.reloadT === 0) {
    if (p.ammo[p.weapon] <= 0) {
      p.reloadT = w.reloadS; s.events.push({ t: 'empty' }); s.events.push({ t: 'reload', by: 'player' });
    } else {
      p.ammo[p.weapon]--;
      p.cooldown = fireInterval(w);
      const rc = recoilAt(p.shotIndex, p.weapon === 'rifle' ? 1 : 0.6);
      const spread = w.spread + (p.running ? w.moveSpread : p.moving ? w.moveSpread * 0.35 : 0) + (p.y > 0 ? 0.08 : 0);
      const sa = rand(s.rng) * Math.PI * 2, sr = Math.sqrt(rand(s.rng)) * spread;
      const yaw = p.yaw - rc.yaw + Math.cos(sa) * sr;
      const pitch = p.pitch + rc.pitch + Math.sin(sa) * sr;
      const oy = EYE_H + p.y;
      const tr = traceShot(s, p.x, oy, p.z, yaw, pitch);
      s.events.push({ t: 'shot', by: 'player', x: p.x, y: oy - 0.15, z: p.z, ex: tr.ex, ey: tr.ey, ez: tr.ez, weapon: p.weapon });
      hearAll(s, p, HEAR_SHOT_M, 'shot');
      p.shotIndex++; p.shotPeak = p.shotIndex; p.sinceShot = 0;
      p.punchPitch += p.weapon === 'rifle' ? 0.012 : 0.02;
      if (tr.bot && tr.group) {
        const b = tr.bot;
        s.damageDealt += applyDamage(b, p.weapon, tr.group, tr.dist);
        // levou tiro: vira para o atirador e sabe onde ele está
        b.lastKnown = { x: p.x, z: p.z };
        b.heard = { pos: { x: p.x, z: p.z }, kind: 'shot' };
        const kill = b.hp <= 0;
        s.events.push({ t: 'hit', head: tr.group === 'head', kill, victim: b.id });
        if (kill) killBot(s, b, tr.group === 'head');
      }
    }
  }
  p.shotIndex = recoverShotIndex(p.shotIndex, p.sinceShot, dt, p.shotPeak);
  // câmera volta do punch
  p.punchPitch *= Math.exp(-dt * 9);
  p.punchYaw *= Math.exp(-dt * 9);
}

function killBot(s: SimState, b: BotSim, head: boolean) {
  b.alive = false; b.hp = 0; b.moving = false;
  s.kills++;
  if (head) s.headshots++;
  s.killFeed.push({ victimId: b.id, victim: b.name, headshot: head, tMs: Math.round(s.t * 1000), byPlayer: true });
  // trade: companheiros perto sabem de onde veio o tiro
  for (const o of s.bots) {
    if (!o.alive) continue;
    if (dist(o, b) < 15) { o.tradeCue = { x: s.player.x, z: s.player.z }; o.lastKnown = { x: s.player.x, z: s.player.z }; }
  }
}

function stepBots(s: SimState, dt: number) {
  const p = s.player;
  const lvl = s.ctx.level;
  const alive = s.bots.filter((b) => b.alive);
  // quem espera o trade: o de maior teamwork, enquanto houver 2+ vivos
  let waiter: BotSim | null = null;
  if (alive.length >= 2) for (const b of alive) if (!waiter || b.profile.teamwork > waiter.profile.teamwork) waiter = b;
  const defusing = s.bomb.defusing;
  if (defusing) hearAll(s, s.bombPos, HEAR_DEFUSE_M, 'defuse');

  s.bots.forEach((b, idx) => {
    if (!b.alive) return;
    // percepção com orçamento: cada bot olha a cada 3 ticks (escalonado)
    if ((s.tick + idx) % PERCEPTION_EVERY === 0) {
      const was = b.sees;
      b.sees = p.alive && playerVisibleFrom(s, b);
      if (b.sees && !was) {
        const pr = b.profile;
        const pressure = (alive.length === 1 || defusing) ? pr.pressureDegrade : 0;
        const r = rand(s.rng);
        b.reactT = (pr.reactionMs / 1000) * (1 + 0.15 * (2 * r - 1));
        b.aimErr = b.aimBase * (1 + pressure) * Math.max(0.4, 1 + pr.variance * gauss(s.rng));
        // pre-aim: o jogador apareceu onde ele esperava
        if (b.lastKnown && dist(b.lastKnown, p) < 3 && rand(s.rng) < pr.preAimChance) { b.aimErr *= 0.5; b.reactT *= 0.7; }
        b.shotIndex = 0;
      }
      if (b.sees) b.lastKnown = { x: p.x, z: p.z };
    }
    const peekers = s.bots.filter((o) => o !== b && o.alive && isPeeking(o.state, o.moving)).length;
    const intent = decide(
      { state: b.state, hp: b.hp, pos: b, hold: b.hold, holdAim: b.holdAim, cover: b.cover, lastKnown: b.lastKnown, stateTime: b.stateTime, profile: b.profile },
      { sees: b.sees, playerPos: b.sees ? { x: p.x, z: p.z } : null, heard: b.heard, tradeCue: b.tradeCue, roll: rand(s.rng) },
      { defusing, bomb: s.bombPos, peekers, isTradeWaiter: b === waiter && !b.tradeCue, teammatesAlive: alive.length - 1 },
    );
    b.heard = null;
    b.tradeCue = null;
    if (intent.state !== b.state) { b.state = intent.state; b.stateTime = 0; if (intent.state === 'TRADE' && intent.moveTo) b.lastKnown = intent.moveTo; if (intent.state === 'ALERT' && intent.aimAt) b.lastKnown = { x: intent.aimAt.x, z: intent.aimAt.z }; }
    else b.stateTime += dt;

    // mira (yaw) com mola até o alvo
    if (intent.aimAt) {
      const target = yawTo(b.x, b.z, intent.aimAt.x, intent.aimAt.z);
      const diff = wrapAng(target - b.yaw);
      const rate = (b.state === 'ENGAGE' ? 10 : 5) * dt;
      b.yaw = wrapAng(b.yaw + clamp(diff, -rate, rate));
    }
    // movimento no grafo
    b.moving = false;
    if (intent.moveTo && dist(b, intent.moveTo) > 0.35) {
      b.pathAge += dt;
      if (!b.pathTarget || dist(b.pathTarget, intent.moveTo) > 1.5 || b.pathAge > 1 || b.path.length === 0) {
        b.path = planPath(s.ctx.nav, lvl, b.x, b.z, intent.moveTo.x, intent.moveTo.z);
        b.pathTarget = { x: intent.moveTo.x, z: intent.moveTo.z };
        b.pathAge = 0;
      }
      const next = b.path[0];
      if (next) {
        const dx = next.x - b.x, dz = next.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.35) b.path.shift();
        else {
          const sp = (b.state === 'ALERT' ? 2.6 : b.state === 'HOLD' ? 3.4 : 4.4) * dt;
          const before = { x: b.x, z: b.z };
          moveWithCollision(lvl, b, (dx / d) * Math.min(sp, d), (dz / d) * Math.min(sp, d));
          b.moving = Math.hypot(b.x - before.x, b.z - before.z) > 1e-4;
          if (!b.moving) b.path = []; // preso: replaneja no próximo tick
          if (!intent.aimAt) b.yaw = yawTo(0, 0, dx, dz);
          if (b.moving && b.state !== 'ALERT') {
            b.stepT -= dt;
            if (b.stepT <= 0) { b.stepT = 0.4; s.events.push({ t: 'step', by: b.id, x: b.x, z: b.z }); }
          }
        }
      }
    }
    // tiro do bot
    b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) { b.reloadT = 0; b.ammo = 30; } }
    if (b.sees) {
      b.reactT -= dt;
      b.aimErr = Math.max(b.aimBase * 0.6, b.aimErr * Math.exp(-2.5 * dt));
    }
    const facing = Math.abs(wrapAng(yawTo(b.x, b.z, p.x, p.z) - b.yaw)) < 0.26;
    if (intent.fire && b.sees && p.alive && b.reactT <= 0 && facing && b.cooldown === 0 && b.reloadT === 0 && lineClear(lvl, b.x, b.z, p.x, p.z)) {
      botShoot(s, b);
    }
  });
}

function botShoot(s: SimState, b: BotSim) {
  const p = s.player, pr = b.profile;
  if (b.ammo <= 0) { b.reloadT = 2.5; s.events.push({ t: 'reload', by: b.id }); return; }
  b.ammo--;
  const d = Math.max(0.5, dist(b, p));
  const eff = b.aimErr * (b.moving ? pr.moveAimPenalty : 1)
    + b.shotIndex * 0.0045 * (1 - pr.sprayComp)
    + (p.running ? 0.012 : 0) + (p.y > 0 ? 0.01 : 0);
  const e = Math.abs(gauss(s.rng)) * eff;
  const bodyAng = Math.atan(0.3 / d) * 1.1;
  const headAng = Math.atan(0.12 / d);
  const wantHead = rand(s.rng) < pr.headshotChance;
  let group: HitGroup | null = null;
  if (wantHead && e < headAng) group = 'head';
  else if (e < bodyAng) {
    const r = rand(s.rng);
    group = wantHead ? 'torso' : r < 0.55 ? 'torso' : r < 0.8 ? 'stomach' : 'legs';
  }
  const oy = BOT_EYE_H - 0.15;
  // tracer: no corpo se acertou, senão passa de raspão
  const miss = group ? 0 : (rand(s.rng) - 0.5) * 2;
  const ty = group === 'head' ? EYE_H : group === 'legs' ? 0.5 : group ? 1.2 : 1.0 + miss * 0.7;
  const side = { x: -(p.z - b.z) / d, z: (p.x - b.x) / d };
  s.events.push({ t: 'shot', by: b.id, x: b.x, y: oy, z: b.z, ex: p.x + side.x * miss, ey: ty + p.y, ez: p.z + side.z * miss, weapon: 'rifle' });
  if (group) {
    const before = p.hp;
    applyDamage(p, 'rifle', group, d);
    s.events.push({ t: 'hurt', dmg: before - p.hp, head: group === 'head' });
    if (p.hp <= 0) {
      p.alive = false;
      s.killFeed.push({ victimId: 'player', victim: 'Você', headshot: group === 'head', tMs: Math.round(s.t * 1000), byPlayer: false });
    }
  }
  b.shotIndex++;
  b.cooldown = fireInterval(WEAPONS.rifle);
  if (pr.burst && b.shotIndex >= 3) { b.cooldown = 0.32; b.shotIndex = 0; }
  else if (b.shotIndex >= 10) { b.cooldown = 0.45; b.shotIndex = 0; }
}

function stepBombAndDefuse(s: SimState, inp: SimInput, dt: number) {
  const p = s.player;
  const d = dist(p, s.bombPos);
  const look = d < 0.8 || Math.abs(wrapAng(yawTo(p.x, p.z, s.bombPos.x, s.bombPos.z) - p.yaw)) < 0.7;
  const inRange = p.alive && p.y <= 0 && d <= DEFUSE_RANGE_M && look;
  s.canDefuse = inRange;
  const ev = stepBomb(s.bomb, dt, { holding: inp.use && p.alive, inRange, moving: p.moving });
  for (const e of ev) s.events.push({ t: e });
}

/** avança UM tick. Muta o estado e devolve-o (eventos do tick em s.events). */
export function step(s: SimState, inp: SimInput, dt = TICK): SimState {
  s.events = [];
  if (s.result) return s;
  s.tick++;
  s.t += dt;
  if (s.player.alive) {
    stepPlayer(s, inp, dt);
    stepPlayerShooting(s, inp, dt);
  }
  stepBots(s, dt);
  stepBombAndDefuse(s, inp, dt);
  // fim
  if (!s.player.alive) endWith(s, 'died');
  else if (s.bomb.defused) endWith(s, 'defused');
  else if (s.bomb.exploded) endWith(s, 'exploded');
  else if (s.bots.every((b) => !b.alive) && s.eliminationWins) endWith(s, 'eliminated_all');
  return s;
}

export const defuseFraction = (s: SimState) => clamp(s.bomb.defuse / DEFUSE_S, 0, 1);
