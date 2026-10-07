// [evolução · out/2026] POTENCIAL HONESTO — o helper ÚNICO do teto da Carreira.
//
// O evolveSquad usa como PA e TODAS as telas (elenco, visão geral, perfil, peek,
// mercado) mostram o mesmo número. Antes cada tela chamava
// playerPotentialOvr(jogador ATUAL, idade ATUAL) — outra régua que a do
// evolveSquad (OVR da base, idade de estreia) — e o "potencial" mostrado podia
// ficar abaixo do OVR ou mudar a cada aniversário.
//
// O teto sai SEMPRE do jogador de PARTIDA (base): a régua da IA
// (aiPotentialOvr: espaço da idade de estreia comprimido no topo da escala), o
// teto da vaga para o jovem da base (regen), o PA do relatório para o jovem
// gerado (newgen), o potencial do prospecto da academia — + o potencial furado
// por desempenho (#17, dynamicPotBonus). O mostrado nunca fica abaixo do OVR.
import type { Player, TeamSeason } from '../../types';
import { CS2_REAL_2026 } from '../../data/bo3';
import { playerOvr } from '../ratings';
import { ovrFromCa } from '../attrs/model';
import { playerOrgId } from '../../state/career-player-route';
import { aiPotentialOvr, regenPotOvr, regenYouth } from './aiWorld';
import { baseAge, type YouthDebut } from './playerAge';
import { parseRegenPlayerId } from './signings';
import { isNewgenId, newgenPlayer, parseNewgenId, type MundoYouth } from '../mundo/juventude';

/** O que o helper lê do save da Carreira. */
export interface PotentialSave {
  youth?: Record<string, Player>;
  customPlayers?: Record<string, Player>;
  academy?: (Player & { potential: number })[];
  academyTeam?: (Player & { potential: number })[];
  mundo?: unknown;
  youthAge?: Record<string, number>;
  youthDebut?: Record<string, YouthDebut>;
  dynamicPotBonus?: Record<string, number>;
}

let baseTeams: TeamSeason[] = CS2_REAL_2026;
let baseById = new Map<string, Player>(CS2_REAL_2026.flatMap((t) => t.players.map((p) => [p.id, p] as [string, Player])));
/** A base vigente da Carreira (oficial + admin + customizada). */
export function registerCareerBase(teams: TeamSeason[]): void {
  if (teams === baseTeams) return;
  baseTeams = teams;
  baseById = new Map(teams.flatMap((t) => t.players.map((p) => [p.id, p] as [string, Player])));
}

/**
 * Idade de ESTREIA (a régua do teto): regen/newgen (no id) > base promovida
 * (youthDebut) > dataset. A idade corrente encolheria o teto a cada aniversário.
 */
export function potBaseAge(player: Pick<Player, 'id' | 'nick' | 'age'>, youthAge?: Record<string, number>, youthDebut?: Record<string, YouthDebut>): number {
  const r = parseRegenPlayerId(player.id) ?? parseNewgenId(player.id);
  if (r) return r.ageAtDebut;
  const yd = youthDebut?.[player.id];
  if (yd) return yd.age;
  return baseAge(player, youthAge);
}

/** O jogador de PARTIDA (base) de um id da Carreira — a mesma ordem do findSigning. */
export function careerBasePlayerOf(save: PotentialSave, id: string): Player | null {
  const y = save.youth?.[id];
  if (y) return y;
  const c = save.customPlayers?.[id];
  if (c) return c;
  const ac = save.academy?.find((a) => a.id === id) ?? save.academyTeam?.find((a) => a.id === id);
  if (ac) return ac;
  if (isNewgenId(id)) return newgenPlayer(save.mundo as MundoYouth | null | undefined, id);
  const b = baseById.get(id);
  if (b) return b;
  const rg = parseRegenPlayerId(id);
  if (rg) {
    const team = baseTeams.find((t) => t.id === rg.teamId);
    const orig = team?.players[rg.slot];
    if (team && orig) return regenYouth(team, rg.slot, rg.generation, rg.debut, rg.ageAtDebut, orig);
  }
  return null;
}

/** Teto (OVR) do jogador de partida, sem o piso do OVR atual. */
function capOf(save: PotentialSave, base: Player, withBonus: boolean): number {
  const id = playerOrgId(base.id);
  const bonus = withBonus ? save.dynamicPotBonus?.[id] ?? 0 : 0;
  const ovr = playerOvr(base);
  const academyPot = (base as Player & { potential?: unknown }).potential;
  let cap: number;
  if (isNewgenId(id) && base.attrs) cap = Math.max(ovr, ovrFromCa(base.attrs.pa));
  else if (typeof academyPot === 'number') cap = Math.max(ovr, academyPot);
  else {
    const rg = parseRegenPlayerId(id);
    const orig = rg ? baseTeams.find((t) => t.id === rg.teamId)?.players[rg.slot] : undefined;
    cap = rg && orig ? regenPotOvr(id, playerOvr(orig)) : aiPotentialOvr(id, ovr, potBaseAge({ ...base, id }, save.youthAge, save.youthDebut));
  }
  return Math.min(99, cap + bonus);
}

/**
 * POTENCIAL da Carreira (OVR): o teto que a evolução usa — nunca abaixo do OVR
 * atual. `p` pode ser o jogador atual (evoluído) ou o da base.
 */
export function careerPotentialOvr(save: PotentialSave, p: Player): number {
  const id = playerOrgId(p.id);
  const base = careerBasePlayerOf(save, id) ?? { ...p, id };
  return Math.max(playerOvr(p), capOf(save, base, true));
}
/** Mesmo teto, sem o bônus de desempenho (o "scouted" do breakthrough). */
export function careerPotentialBaseOvr(save: PotentialSave, p: Player): number {
  const id = playerOrgId(p.id);
  const base = careerBasePlayerOf(save, id) ?? { ...p, id };
  return capOf(save, base, false);
}
