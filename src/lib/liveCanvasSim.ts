// Engine 2D headless do canvas de replay (T2.5 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md).
//
// REPLAY fiel do log de baixas (`MapResult.killFeed`). O engine principal
// (`engine/match.ts`) já decidiu QUEM mata QUEM em cada round; este módulo
// só ENCENA o desfecho.
//
// V2 do piloto (após feedback):
//   - Agents agora têm `kills/deaths/assists` cumulativos no mapa
//     (PlayerCard lê direto — evita o bug do trim de events).
//   - Kill agora tem FASE SHOOTING: 0.7s antes do timer zerar, o killer
//     "aponta" pro victim (visualizado como linha amarela + muzzle flash).
//     Só depois o victim cai. KDA bate 100% com killFeed do simulador.
//   - Movimento agora respeita a walkable mask do PNG do radar (passada via
//     `getMask` opcional). Agents deslizam ao bater na parede em vez de
//     atravessar. Fallback: line walk quando mask ausente.

import {
  geometryFor,
  directionTo,
  distanceTo,
  zoneCenter,
  isInsideZone,
  type MapLayout,
  type Vec2,
} from '../data/mapGeometry';
import { stepWithMask, type WalkableMask } from './walkableMask';
import type { KillEvent, MapResult, TPlayer, TTeam } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos

export type Side = 0 | 1;
export type RoleSide = 't' | 'ct';
export type RoundPhase = 'freeze' | 'live' | 'postRound';

export interface AgentStats {
  kills: number;
  deaths: number;
  assists: number;
}

export interface Agent {
  id: string;
  nick: string;
  team: Side;
  side: RoleSide;
  pos: Vec2;
  target: Vec2;
  spawn: Vec2;
  speed: number;
  alive: boolean;
  ovr: number;
  facing: number;
  // Stats cumulativos no MAPA (não resetam por round). PlayerCard lê daqui.
  stats: AgentStats;
  // Kill agendado pra este round (do killFeed). null = sem kill no round.
  nextKillIn: number | null;
  nextKillVictim: string | null;
  // Fase shooting (encenação visual do kill). Set entre `aimStartIn` e o
  // momento real do kill. Enquanto !null, o renderer desenha linha de tiro.
  shootingAtId: string | null;
  shootingEndsIn: number | null;
}

export interface SpikeState {
  carrierId: string | null;
  pos: Vec2 | null;
  planted: boolean;
  plantedAt: Vec2 | null;
  timer: number;
  defused: boolean;
  exploded: boolean;
}

export interface LiveEvent {
  kind: 'kill' | 'plant' | 'defuse' | 'explode' | 'roundEnd' | 'roundStart' | 'shot';
  at: number;
  killerId?: string;
  victimId?: string;
  weapon?: string;
  headshot?: boolean;
  winningTeam?: Side;
}

export interface LiveState {
  map: MapLayout;
  agents: Agent[];
  spike: SpikeState;
  roundClock: number;
  roundIdx: number;
  totalRounds: number;
  score: [number, number];
  phase: RoundPhase;
  events: LiveEvent[];
}

export interface LiveSimOptions {
  mapResult: MapResult;
  teams: [TTeam, TTeam];
  userIdx: Side;
  // Walkable mask getter — chamada a cada tick. Null = line walk fallback.
  // Pattern de getter (não passagem direta) porque a mask carrega async no
  // consumer (LiveCanvasGame) depois do sim já estar criado.
  getMask?: () => WalkableMask | null;
}

export interface LiveCanvasSim {
  getState: () => LiveState;
  step: (dt: number) => void;
  skipToNextRound: () => void;
  isFinished: () => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes

// Duração lógica do round antes de timeOut por default. CS real é 1:55 (115s),
// mas a encenação fica chata se esperar tudo — 60s já dá tempo de mover do
// spawn até o site + 1 troca de tiro. Quando todos os kills agendados já
// rolaram e ninguém plantou, IDLE_FAST_FORWARD acelera ainda mais (ver tick).
const ROUND_DURATION = 60;
const FREEZE_DURATION = 1.5;
const POST_ROUND_DURATION = 2;
const PLANT_TIMER = 40;
// AGENT_BASE_SPEED ajustado pra coords de radar (1024²). 130 unidades/s =
// atravessa o mapa em ~8s — sensação de tempo CS. Antes era 95 (lento demais
// com a mask travando movimento).
const AGENT_BASE_SPEED = 130;
// Encenação do kill: killer entra em fase aiming, atira, victim cai.
const SHOOTING_DURATION = 0.6;
// Quando todos os kills do round já rolaram e ninguém plantou, multiplica o
// tempo do round 6× pra encurtar a espera. Sem isso o canvas ficava parado
// no fim do round até o ROUND_DURATION expirar.
const IDLE_FAST_FORWARD = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Criação

export function createLiveCanvasSim(opts: LiveSimOptions): LiveCanvasSim {
  const { mapResult, teams, getMask } = opts;
  const layout = geometryFor(mapResult.map);
  const totalRounds = roundsFromKillFeed(mapResult);
  const roundsScript = buildRoundsScript(mapResult, totalRounds);

  let state: LiveState = {
    map: layout,
    agents: buildAgents(teams, layout),
    spike: createInitialSpike(),
    roundClock: 0,
    roundIdx: 0,
    totalRounds,
    score: [0, 0],
    phase: 'freeze',
    events: [],
  };

  function maskNow(): WalkableMask | null {
    return getMask?.() ?? null;
  }

  // Reseta agents pro spawn do round. NÃO reseta stats (cumulativos no mapa).
  function setupRound(): void {
    const isSecondHalf = state.roundIdx >= 15;
    const team0Side: RoleSide = isSecondHalf ? 'ct' : 't';
    const team1Side: RoleSide = isSecondHalf ? 't' : 'ct';

    for (const a of state.agents) {
      a.side = a.team === 0 ? team0Side : team1Side;
      a.alive = true;
      a.nextKillIn = null;
      a.nextKillVictim = null;
      a.shootingAtId = null;
      a.shootingEndsIn = null;
      const sp = pickSpawn(a, layout);
      a.pos = { ...sp };
      a.spawn = { ...sp };
      a.target = a.side === 't' ? { ...layout.midT } : { ...layout.midCT };
      a.facing = a.side === 't' ? 0 : Math.PI;
    }

    const tAgent = state.agents.find((x) => x.side === 't');
    state.spike = createInitialSpike();
    if (tAgent) state.spike.carrierId = tAgent.id;

    // Agendar kills do round atual
    const script = roundsScript[state.roundIdx] ?? [];
    for (const k of script) {
      const killer = state.agents.find((x) => x.id === k.killerId);
      if (killer && killer.alive && killer.nextKillIn == null) {
        killer.nextKillIn = k.at;
        killer.nextKillVictim = k.victimId;
      }
    }

    state.roundClock = 0;
    state.phase = 'freeze';
    pushEvent({ kind: 'roundStart', at: 0 });
  }

  function pushEvent(e: LiveEvent): void {
    state.events = [...state.events, e].slice(-30);
  }

  // Resolve o kill: incrementa stats, dropa spike se carrier morreu, evento.
  function executeKill(killer: Agent, victim: Agent): void {
    if (!victim.alive) return;
    victim.alive = false;
    killer.stats.kills += 1;
    victim.stats.deaths += 1;
    killer.facing = Math.atan2(victim.pos.y - killer.pos.y, victim.pos.x - killer.pos.x);
    pushEvent({ kind: 'kill', at: state.roundClock, killerId: killer.id, victimId: victim.id });
    if (state.spike.carrierId === victim.id) {
      state.spike.carrierId = null;
      state.spike.pos = { ...victim.pos };
    }
    killer.shootingAtId = null;
    killer.shootingEndsIn = null;
    killer.nextKillIn = null;
    killer.nextKillVictim = null;
  }

  function tick(dt: number): void {
    if (state.phase === 'freeze') {
      state.roundClock += dt;
      if (state.roundClock >= FREEZE_DURATION) {
        state.roundClock = 0;
        state.phase = 'live';
      }
      return;
    }
    if (state.phase === 'postRound') {
      state.roundClock += dt;
      if (state.roundClock >= POST_ROUND_DURATION) {
        if (state.roundIdx + 1 < state.totalRounds) {
          state.roundIdx += 1;
          setupRound();
        }
      }
      return;
    }
    // === phase === 'live' ===
    state.roundClock += dt;
    const mask = maskNow();

    // 1) Movimento (respeitando walkable mask quando presente)
    for (const a of state.agents) {
      if (!a.alive) continue;
      // Em fase shooting, agent fica parado (planta os pés pra atirar)
      if (a.shootingAtId != null) continue;
      const d = distanceTo(a.pos, a.target);
      if (d > 4) {
        const dir = directionTo(a.pos, a.target);
        const step = a.speed * dt;
        a.pos = stepWithMask(a.pos, dir, step, mask);
        a.facing = Math.atan2(dir.y, dir.x);
      } else {
        a.target = advanceTarget(a, state);
      }
      if (state.spike.carrierId === a.id && !state.spike.planted) {
        state.spike.pos = { ...a.pos };
      }
    }

    handlePlant(dt);
    handleDefuse(dt);

    if (state.spike.planted && !state.spike.defused) {
      state.spike.timer -= dt;
      if (state.spike.timer <= 0) {
        state.spike.exploded = true;
        endRound(roundWinnerFromKillFeed(state.roundIdx, mapResult), 'explode');
        return;
      }
    }

    // 2) Kills agendados — agora com fase shooting antes do kill efetivo
    for (const a of state.agents) {
      if (!a.alive) continue;

      // Já está em fase shooting? Conta down e dispara o kill
      if (a.shootingAtId && a.shootingEndsIn != null) {
        a.shootingEndsIn -= dt;
        const victim = state.agents.find((x) => x.id === a.shootingAtId);
        if (!victim || !victim.alive) {
          // alvo já morreu (foi traded): aborta shooting
          a.shootingAtId = null;
          a.shootingEndsIn = null;
          a.nextKillIn = null;
          a.nextKillVictim = null;
          continue;
        }
        // facing aponta pro victim durante toda a animação
        a.facing = Math.atan2(victim.pos.y - a.pos.y, victim.pos.x - a.pos.x);
        if (a.shootingEndsIn <= 0) {
          executeKill(a, victim);
        }
        continue;
      }

      // Não está mirando ainda — ver se chegou a hora de mirar
      if (a.nextKillIn == null || !a.nextKillVictim) continue;
      a.nextKillIn -= dt;
      const victim = state.agents.find((x) => x.id === a.nextKillVictim);
      if (!victim || !victim.alive) {
        a.nextKillIn = null;
        a.nextKillVictim = null;
        continue;
      }
      // Quando timer chega no ponto de mirar (-SHOOTING_DURATION antes do kill),
      // entra na fase shooting (planta os pés, aponta).
      if (a.nextKillIn <= 0) {
        a.shootingAtId = victim.id;
        a.shootingEndsIn = SHOOTING_DURATION;
        a.facing = Math.atan2(victim.pos.y - a.pos.y, victim.pos.x - a.pos.x);
        pushEvent({ kind: 'shot', at: state.roundClock, killerId: a.id, victimId: victim.id });
      }
    }

    // 3) Round end
    const tAlive = state.agents.filter((x) => x.side === 't' && x.alive).length;
    const ctAlive = state.agents.filter((x) => x.side === 'ct' && x.alive).length;
    if (tAlive === 0 || ctAlive === 0) {
      const winner = roundWinnerFromKillFeed(state.roundIdx, mapResult);
      endRound(winner, 'wipe');
      return;
    }
    if (state.spike.defused) {
      endRound(roundWinnerFromKillFeed(state.roundIdx, mapResult), 'defuse');
      return;
    }
    if (state.roundClock >= ROUND_DURATION) {
      endRound(roundWinnerFromKillFeed(state.roundIdx, mapResult), 'timeOut');
      return;
    }

    // 4) Fast-forward quando todos os kills agendados já rolaram E ninguém
    // está atirando E ninguém plantou. Sem isso o round arrasta até 60s mesmo
    // com nada acontecendo (agents andando pra site vazio).
    const hasPendingKill = state.agents.some(
      (a) => a.alive && (a.nextKillIn != null || a.shootingAtId != null),
    );
    if (!hasPendingKill && !state.spike.planted) {
      // adiciona tempo extra (a fração do dt já contou uma vez no início do tick)
      state.roundClock += dt * (IDLE_FAST_FORWARD - 1);
    }
  }

  function endRound(winner: Side, reason: 'wipe' | 'defuse' | 'explode' | 'timeOut'): void {
    if (state.phase === 'postRound') return;
    state.phase = 'postRound';
    state.score[winner] += 1;
    state.roundClock = 0;
    pushEvent({ kind: 'roundEnd', at: 0, winningTeam: winner });
    void reason;
  }

  function handlePlant(dt: number): void {
    if (state.spike.planted) return;
    const carrier = state.spike.carrierId
      ? state.agents.find((x) => x.id === state.spike.carrierId)
      : null;
    if (!carrier || !carrier.alive) return;
    const inA = isInsideZone(carrier.pos, layout.siteA);
    const inB = isInsideZone(carrier.pos, layout.siteB);
    if (!inA && !inB) return;
    state.spike.planted = true;
    state.spike.plantedAt = { ...carrier.pos };
    state.spike.pos = { ...carrier.pos };
    state.spike.timer = PLANT_TIMER;
    pushEvent({ kind: 'plant', at: state.roundClock });
    for (const a of state.agents) {
      if (a.alive && a.side === 'ct') {
        a.target = { ...state.spike.plantedAt };
      }
    }
    void dt;
  }

  function handleDefuse(dt: number): void {
    if (!state.spike.planted || state.spike.defused) return;
    const ctNear = state.agents.find(
      (a) => a.alive && a.side === 'ct' && state.spike.pos && distanceTo(a.pos, state.spike.pos) < 30,
    );
    if (!ctNear) return;
    state.spike.defused = true;
    pushEvent({ kind: 'defuse', at: state.roundClock });
    void dt;
  }

  setupRound();

  return {
    getState: () => state,
    step: (dt: number) => {
      let remaining = dt;
      while (remaining > 0) {
        const sub = Math.min(remaining, 0.05);
        tick(sub);
        remaining -= sub;
      }
    },
    skipToNextRound: () => {
      if (state.phase !== 'postRound') {
        const w = roundWinnerFromKillFeed(state.roundIdx, mapResult);
        for (const a of state.agents) {
          if ((w === 0 && a.team === 1) || (w === 1 && a.team === 0)) a.alive = false;
        }
        endRound(w, 'wipe');
      }
    },
    isFinished: () =>
      state.roundIdx >= state.totalRounds - 1 && state.phase === 'postRound',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de construção

function roundsFromKillFeed(mr: MapResult): number {
  const sumScore = (mr.score?.[0] ?? 0) + (mr.score?.[1] ?? 0);
  const maxRound = mr.killFeed?.reduce((m, k) => Math.max(m, k.round), 0) ?? 0;
  return Math.max(sumScore, maxRound, 1);
}

interface ScriptKill {
  killerId: string;
  victimId: string;
  at: number;
}

function buildRoundsScript(mr: MapResult, totalRounds: number): ScriptKill[][] {
  const out: ScriptKill[][] = Array.from({ length: totalRounds }, () => []);
  const byRound = new Map<number, KillEvent[]>();
  for (const k of mr.killFeed ?? []) {
    const list = byRound.get(k.round - 1) ?? [];
    list.push(k);
    byRound.set(k.round - 1, list);
  }
  byRound.forEach((kills, roundIdx) => {
    if (!kills.length) return;
    const span = 60;
    const startAt = 10;
    const step = kills.length === 1 ? 0 : span / (kills.length - 1);
    kills.forEach((k, i) => {
      out[roundIdx]?.push({
        killerId: k.killerId,
        victimId: k.victimId,
        at: startAt + step * i,
      });
    });
  });
  return out;
}

function roundWinnerFromKillFeed(roundIdx: number, mr: MapResult): Side {
  return (mr.roundLog?.[roundIdx] ?? 0) as Side;
}

function buildAgents(teams: [TTeam, TTeam], layout: MapLayout): Agent[] {
  const list: Agent[] = [];
  const slotsPerTeam = 5;
  for (let t = 0; t < 2; t++) {
    const team = teams[t];
    const players: TPlayer[] = team.players.slice(0, slotsPerTeam);
    players.forEach((p, i) => {
      const isFirstHalfT = t === 0;
      const sp = isFirstHalfT ? layout.spawnsT[i] : layout.spawnsCT[i];
      list.push({
        id: p.id,
        nick: p.nick,
        team: t as Side,
        side: isFirstHalfT ? 't' : 'ct',
        pos: { ...sp },
        target: isFirstHalfT ? { ...layout.midT } : { ...layout.midCT },
        spawn: { ...sp },
        speed: AGENT_BASE_SPEED * (0.9 + (p.ovr ?? 75) / 200),
        alive: true,
        ovr: p.ovr ?? 75,
        facing: isFirstHalfT ? 0 : Math.PI,
        stats: { kills: 0, deaths: 0, assists: 0 },
        nextKillIn: null,
        nextKillVictim: null,
        shootingAtId: null,
        shootingEndsIn: null,
      });
    });
  }
  return list;
}

function pickSpawn(agent: Agent, layout: MapLayout): Vec2 {
  const list = agent.side === 't' ? layout.spawnsT : layout.spawnsCT;
  let h = 0;
  for (let i = 0; i < agent.nick.length; i++) h = (h * 31 + agent.nick.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
}

function advanceTarget(agent: Agent, st: LiveState): Vec2 {
  const layout = st.map;
  if (agent.side === 't') {
    let h = 0;
    for (let i = 0; i < agent.nick.length; i++) h = (h * 17 + agent.nick.charCodeAt(i)) | 0;
    const goesA = (h + st.roundIdx) % 2 === 0;
    return zoneCenter(goesA ? layout.siteA : layout.siteB);
  }
  let h = 0;
  for (let i = 0; i < agent.nick.length; i++) h = (h * 23 + agent.nick.charCodeAt(i)) | 0;
  const defendsA = (h + st.roundIdx) % 2 === 0;
  return zoneCenter(defendsA ? layout.siteA : layout.siteB);
}

function createInitialSpike(): SpikeState {
  return {
    carrierId: null,
    pos: null,
    planted: false,
    plantedAt: null,
    timer: PLANT_TIMER,
    defused: false,
    exploded: false,
  };
}
