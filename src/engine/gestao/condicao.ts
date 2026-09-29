// [fase 2 · frente TREINO] CONDIÇÃO do jogador no motor de partida.
//
// A condição (`PlayerCondition` do save, gestao/model.ts) chega à partida pelo
// campo opcional `TPlayer.cond` e pesa no DUELO:
//   - sharpness (ritmo de jogo): 70 é o neutro; ritmo alto dá um pouco, time
//     parado perde mais do que o ritmo alto ganha;
//   - fitness (cansaço): acima de 70 não pesa; abaixo, o jogador erra mais e o
//     cansaço de mapa a mapa (stamina) pesa mais na série.
// A unidade é a do `fixedMod` do motor v2 (pontos de atributo 1–20; 1 ponto ≈
// 0,08 de logit no duelo). O v1 recebe o mesmo efeito como forma equivalente.
// Sem `cond` (IA, Road to Pro, Ultimate, calibração) o efeito é ZERO: a
// calibração do motor fica intacta.
//
// Também aqui: quem está lesionado não joga (entra reserva/jovem) e o
// vazamento de estratégia em scrim (o adversário que te viu em scrim te lê).

import type { Player, TPlayer, TTeam } from '../../types';
import type { PlayerCondition } from './model';
import { teamStrengthFromPlayers, toTPlayer } from '../ratings';
import { withFullRoster } from '../matchShared';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export const SHARP_NEUTRAL = 70;
export const FITNESS_FREE = 70;
export const SHARP_W = 0.3; // ±30 de ritmo = ±0,3 ponto de atributo em todo duelo
export const FIT_W = 0.7;   // fitness 0 = −0,7 ponto de atributo

/** Efeito da condição no duelo (pontos de atributo; −1,3 … +0,3). */
export function conditionDuelMod(cond: TPlayer['cond'] | null | undefined): number {
  if (!cond) return 0;
  const sharp = num(cond.sharpness, SHARP_NEUTRAL);
  const fit = num(cond.fitness, 100);
  const sharpMod = clamp(((sharp - SHARP_NEUTRAL) / 30) * SHARP_W, -2 * SHARP_W, SHARP_W);
  const fitMod = fit >= FITNESS_FREE ? 0 : -((FITNESS_FREE - fit) / FITNESS_FREE) * FIT_W;
  return sharpMod + fitMod;
}

/** Quanto o cansaço amplia o desgaste de mapa a mapa numa série (1 = normal). */
export function conditionStaminaMul(cond: TPlayer['cond'] | null | undefined): number {
  if (!cond) return 1;
  return 1 + clamp((100 - num(cond.fitness, 100)) / 100, 0, 1);
}

/** Forma equivalente para o motor v1 (a forma do v2 vale ×6 em pontos de atributo). */
export function conditionForm(p: Pick<TPlayer, 'form' | 'cond'>): number {
  return (p.form ?? 1) + conditionDuelMod(p.cond) / 6;
}

export function isInjured(c: PlayerCondition | null | undefined): boolean {
  return !!c?.injury && c.injury.weeksLeft > 0;
}

const oidOf = (runtimeId: string) => (runtimeId.startsWith('user__') ? runtimeId.slice('user__'.length) : runtimeId);

/**
 * Condição do SEU elenco na partida: estampa `cond` em cada titular e aplica a
 * carga reduzida (quem descansou perde um pouco de ritmo na série). Times da IA
 * passam direto.
 */
export function applyConditionToTeam(
  team: TTeam,
  condition: Record<string, PlayerCondition> | undefined,
  reducedLoad?: string[],
): TTeam {
  if (!team.isUser) return team;
  const resting = new Set(reducedLoad ?? []);
  return {
    ...team,
    players: team.players.map((p) => {
      const id = oidOf(p.id);
      const c = condition?.[id];
      const form = resting.has(id) ? Math.max(0.88, (p.form ?? 1) * (1 - 0.018)) : p.form;
      if (!c) return form === p.form ? p : { ...p, form };
      return { ...p, form, cond: { fitness: clamp(Math.round(c.fitness), 0, 100), sharpness: clamp(Math.round(c.sharpness), 0, 100) } };
    }),
  };
}

// Reserva vindo da base (academia/time academy): mesmo formato de Player.
export type StandIn = Pick<Player, 'id' | 'nick' | 'name' | 'country' | 'role' | 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl'> & { age?: number };

export const STANDIN_TEAMWORK_COST = 0.8; // força perdida por reserva (entrosamento)

/**
 * Lesionado não joga: sai do cinco e entra o reserva — primeiro o jovem da base
 * da MESMA função, depois o melhor jovem disponível, e sem ninguém o reserva
 * genérico do motor (`withFullRoster`). A força do time acompanha a troca
 * (mesma régua da montagem do time) e cada reserva custa um pouco de
 * entrosamento. Devolve o time e quem entrou.
 */
export function substituteInjured(
  team: TTeam,
  injured: ReadonlySet<string>,
  standIns: StandIn[],
): { team: TTeam; subs: { out: string; in: string }[] } {
  if (!team.isUser || injured.size === 0) return { team, subs: [] };
  const out = team.players.filter((p) => injured.has(oidOf(p.id)));
  if (!out.length) return { team, subs: [] };
  const pool = standIns.filter((s) => !team.players.some((p) => oidOf(p.id) === s.id || p.sourcePlayerId === s.id));
  const used = new Set<string>();
  const subs: { out: string; in: string }[] = [];
  const skill = (s: StandIn) => s.aim * 0.6 + s.consistency * 0.25 + s.clutch * 0.15;
  const players: TPlayer[] = [];
  for (const p of team.players) {
    if (!injured.has(oidOf(p.id))) { players.push(p); continue; }
    const cands = pool.filter((s) => !used.has(s.id));
    const same = cands.filter((s) => s.role === p.role).sort((a, b) => skill(b) - skill(a))[0];
    const pick = same ?? cands.sort((a, b) => skill(b) - skill(a))[0];
    if (!pick) { subs.push({ out: p.nick, in: '' }); continue; }
    used.add(pick.id);
    const tp = toTPlayer({ ...pick, role: pick.role } as Player, { runtimeId: `stand__${pick.id}`, fromTeam: 'Academia' });
    players.push({ ...tp, form: 1 });
    subs.push({ out: p.nick, in: pick.nick });
  }
  // sem reserva da base: o motor completa com o reserva genérico
  const full = withFullRoster({ ...team, players, bench: [] });
  for (const s of subs) if (!s.in) s.in = 'reserva';
  const tw = num(team.teamwork, 70);
  const delta = teamStrengthFromPlayers(full.players, tw) - teamStrengthFromPlayers(team.players, tw) - STANDIN_TEAMWORK_COST * out.length;
  return { team: { ...team, players: full.players, strength: team.strength + delta }, subs };
}

// ─── Vazamento de estratégia em scrim ──────────────────────────────────────
// Quem te viu em scrim conhece seus defaults: contra ESSE adversário você perde
// a vantagem de preparação (até −1,5 de força com vazamento total; ~−1,3 p.p.
// por round no v1). A frente de tática lê o mesmo número pra cortar a
// prontidão do anti-strat (`scrimLeakReadiness`).
export const LEAK_STRENGTH = 1.5;

export function applyScrimLeak(team: TTeam, leak: number): TTeam {
  const l = clamp(num(leak, 0), 0, 1);
  if (!team.isUser || l <= 0) return team;
  return { ...team, strength: team.strength - LEAK_STRENGTH * l };
}

/** Prontidão de anti-strat depois do vazamento (a frente de tática aplica). */
export function scrimLeakReadiness(readiness: number, leak: number): number {
  return readiness * (1 - 0.5 * clamp(num(leak, 0), 0, 1));
}
