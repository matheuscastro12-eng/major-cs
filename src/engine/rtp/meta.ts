// RTP v9 — META COMPETITIVO: a camada tática de pré-jogo.
//
// Três decisões que geram vantagem HONESTA (tudo entra no roll real, nada de
// número escondido):
//   1. VETO DE MAPA  — você bane/escolhe mapas (reusa engine/veto.ts). Seu conforto
//      de mapa (heroMapComfort) vira mapPrefs do seu time no sim, então vetar pros
//      seus mapas fortes é uma vantagem emergente e real.
//   2. SCOUTING       — relatório do adversário (astro, mapa forte/fraco, tendência)
//      que informa seu veto e seu plano.
//   3. PLANO DE JOGO  — agressivo/padrão/anti-eco/força: enviesa o atributo efetivo
//      por ESTILO de opção nos momentos (entra no effFor do Round Room).
//
// Puro e determinístico. Sem import de matchSim (evita ciclo).

import { hashStr } from '../../state/hash';
import { MAP_POOL, type MapId, type Role, type TPlayer } from '../../types';
import type { MomentStyle } from './moments';
import type { RtpIconName } from './icons';
import type { RoadToProSave } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Plano de jogo

export type GamePlan = 'aggressive' | 'default' | 'antieco' | 'force';

export interface GamePlanDef {
  id: GamePlan;
  label: string;
  desc: string;
  icon: RtpIconName;
}

export const GAME_PLANS: GamePlanDef[] = [
  { id: 'aggressive', label: 'Agressivo', desc: 'Puxe os duelos. Premia jogadas de risco, pune o passivo.', icon: 'fire' },
  { id: 'default', label: 'Padrão', desc: 'Controle de mapa. Equilibrado, favorece leitura e disciplina.', icon: 'balance' },
  { id: 'antieco', label: 'Anti-eco', desc: 'Jogo limpo e disciplinado. Reduz o risco, segura a vantagem.', icon: 'brain' },
  { id: 'force', label: 'Força', desc: 'Vai pra cima com tudo. Teto altíssimo, variância brutal.', icon: 'bomb' },
];

export function gamePlanDef(plan: GamePlan): GamePlanDef {
  return GAME_PLANS.find((p) => p.id === plan) ?? GAME_PLANS[1];
}

// Viés de atributo efetivo (+/-) por (plano, estilo da opção). Entra no roll real
// via effFor no Round Room — logo já aparece no % base (não é fator cosmético).
const PLAN_BIAS: Record<GamePlan, Record<MomentStyle, number>> = {
  aggressive: { aggro: 2, smart: 0, safe: -1 },
  default: { aggro: 0, smart: 1, safe: 1 },
  antieco: { aggro: -1, smart: 1, safe: 2 },
  force: { aggro: 3, smart: -1, safe: -2 },
};

export function planStyleBias(plan: GamePlan, style: MomentStyle): number {
  return PLAN_BIAS[plan][style];
}

// ─────────────────────────────────────────────────────────────────────────────
// Conforto de mapa do herói — determinístico por id do jogador (−3..+3).
// Vira o mapPrefs do SEU time no sim (buildUserTeam), então o veto pros seus mapas
// fortes rende de verdade. Estável ao longo da carreira (a assinatura do jogador).

export function heroMapComfort(save: RoadToProSave): Record<MapId, number> {
  const out = {} as Record<MapId, number>;
  const base = save.player.id;
  for (const m of MAP_POOL) out[m] = (hashStr(`comfort:${base}:${m}`) % 7) - 3;   // −3..+3
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scouting do adversário

export interface ScoutReport {
  star: { nick: string; role: Role; ovr: number; country: string };
  strongMap: MapId;
  weakMap: MapId;
  tendency: string;
  note: string;
  edge: number;      // diferença de força (opp - herói): >0 = você é azarão
}

export function scoutReport(
  opp: { players: TPlayer[]; mapPrefs?: Record<string, number>; strength: number; name: string },
  heroOvr: number,
): ScoutReport {
  const star = [...opp.players].sort((a, b) => b.ovr - a.ovr)[0];
  const prefs = (Object.entries(opp.mapPrefs ?? {}) as [MapId, number][]).sort((a, b) => b[1] - a[1]);
  const strongMap = prefs[0]?.[0] ?? 'mirage';
  const weakMap = prefs[prefs.length - 1]?.[0] ?? 'nuke';

  const styles = opp.players.map((p) => p.playstyle);
  const agg = styles.filter((s) => s === 'aggressive').length;
  const pas = styles.filter((s) => s === 'passive').length;
  const tendency = agg > pas
    ? 'Time agressivo — puxa os duelos e joga rápido.'
    : pas > agg
      ? 'Time passivo — reativo, joga no utilitário e no tempo.'
      : 'Time equilibrado — adapta o ritmo ao mapa.';

  const edge = Math.round(opp.strength - heroOvr);
  const note = edge >= 6
    ? 'Favoritos claros. Um bom veto e o plano certo valem ouro.'
    : edge <= -6
      ? 'Você é o favorito — imponha seu jogo.'
      : 'Confronto parelho — os detalhes decidem.';

  return {
    star: { nick: star?.nick ?? '—', role: star?.role ?? 'Rifler', ovr: star?.ovr ?? opp.strength, country: star?.country ?? 'br' },
    strongMap, weakMap, tendency, note, edge,
  };
}
