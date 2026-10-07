// [equilíbrio] Régua única de força da Carreira, entrosamento por convivência e
// vantagem da IA por modo. Puro (sem React, sem base de jogadores): o
// CareerScreen e os testes (scripts/test-equilibrio.mts) usam as mesmas contas.
//
// Diagnóstico que motivou (espelho: o MESMO elenco como seu time × como time da
// IA, MD3; neutro = 50%): a Carreira dava 62,7% ao usuário. Somavam-se
//   - sinergia·0,7 − DREAM_TEAM_MALUS na força só do usuário (+6,3 pontos);
//   - entrosamento 90 no dia 1 para quem monta elenco (a IA tem mediana 59);
//   - e, do outro lado, AI_EDGE 4 + boost de circuito 1,5 + rampa por split.
// Agora: força = jogadores(entrosamento) + técnico dos dois lados; o
// entrosamento cresce com o tempo junto; a IA ganha UMA vantagem, a do modo.
import type { Coach, CoachStyle, Difficulty, TTeam } from '../../types';
import type { StaffAttrKey, StaffMember } from '../gestao/model';
import { careerStrength, coachBaseBonus } from '../ratings';

/** Id do reparo em `save.fixes`: o valor é o split a partir do qual vale a régua nova. */
export const BALANCE_FIX_ID = 'equilibrio-v1';

/** Vantagem ÚNICA da IA na força, por modo (substitui AI_EDGE 4 + 1,5 + rampa). */
export const MODE_AI_EDGE: Record<Difficulty, number> = { normal: -0.8, hard: 1.2, legend: 2.7 };

export const careerMode = (d: Difficulty | string | null | undefined): Difficulty => (d === 'hard' || d === 'legend' ? d : 'normal');

// ─── Entrosamento por convivência ────────────────────────────────────────────
export const NEW_ORG_TW_BASE = 62;     // org nova, elenco recém-montado
export const NEW_ORG_TW_CAP = 74;      // teto do dia 1 (a sinergia ajuda até aqui)
export const SYNERGY_TW_K = 1.2;       // ponto de sinergia → pontos de entrosamento
export const TOGETHER_PER_SPLIT = 2;   // +2 por split jogando juntos…
export const TOGETHER_MAX = 12;        // …até +12
export const NEW_STARTER_PENALTY = 3;  // takeover: cada titular novo tira 3…
export const NEW_STARTER_RECOVERY = 2; // …que voltam em +2 por split dele no clube

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Splits que os titulares jogaram JUNTOS: média, sobre os pares, do menor tempo
 * de casa dos dois (quem chegou depois define o tempo do par).
 */
export function togetherSplits(tenures: number[]): number {
  if (tenures.length < 2) return 0;
  let s = 0, n = 0;
  for (let i = 0; i < tenures.length; i++) {
    for (let j = i + 1; j < tenures.length; j++) { s += Math.max(0, Math.min(tenures[i], tenures[j])); n++; }
  }
  return n ? s / n : 0;
}

/** Org nova: 62 + sinergia×1,2 (teto 74) + 2 por split juntos (até +12). */
export function newOrgTeamwork(synergy: number, together: number): number {
  const day1 = Math.min(NEW_ORG_TW_CAP, NEW_ORG_TW_BASE + clamp(synergy * SYNERGY_TW_K, -14, 12));
  return day1 + Math.min(TOGETHER_MAX, TOGETHER_PER_SPLIT * Math.max(0, together));
}

/**
 * Takeover: o entrosamento REAL da org (elenco intacto = exatamente o da IA),
 * ajustado pela mudança de composição, menos 3 por titular novo — que volta em
 * +2 por split dele no clube.
 */
export function takeoverTeamwork(orgTeamwork: number, synergyDelta: number, newStarterTenures: number[]): number {
  const comp = clamp(synergyDelta * SYNERGY_TW_K, -14, 12);
  const fresh = newStarterTenures.reduce((s, t) => s + Math.max(0, NEW_STARTER_PENALTY - NEW_STARTER_RECOVERY * Math.max(0, t)), 0);
  return orgTeamwork + comp - fresh;
}

/**
 * Tempo de casa estimado para saves de antes do equilíbrio: a passagem ativa
 * (stints) manda; sem ela, a química média do jogador com os outros titulares
 * (pairChem parte de 30 e sobe ~15 por split jogando junto).
 */
export function estimateTenure(fromStint: number | null, avgPairChem: number | null): number {
  if (fromStint != null) return Math.max(0, fromStint);
  if (avgPairChem == null) return 0;
  return clamp(Math.floor((avgPairChem - 30) / 15), 0, 6);
}

// ─── Força dos dois lados ────────────────────────────────────────────────────
/** Seu time na régua única: força = jogadores(entrosamento) + técnico. */
export function careerUserTeam(team: TTeam, teamwork: number, coach: Coach = team.coach): TTeam {
  return { ...team, coach, teamwork, strength: careerStrength(team.players, teamwork, coach) };
}

/**
 * Time da IA para uma partida SUA na Carreira: a mesma régua (recalculada dos
 * jogadores, sem confiar na força guardada no snapshot da liga), a comissão da
 * IA (|δ| ≤ 0,5) e a vantagem do modo. `noEdge` desliga o AI_EDGE do motor.
 */
export function careerAiTeam(team: TTeam, mode: Difficulty, staffEdge = 0): TTeam {
  const base = careerStrength(team.players, team.teamwork, team.coach);
  return { ...team, strength: base + staffEdge + MODE_AI_EDGE[careerMode(mode)], noEdge: true };
}

// ─── Plano de jogo (decisão pré-partida) ─────────────────────────────────────
// [integração] O plano virou ATALHO DE ESTILO (engine/gestao/estilo.ts) e perdeu
// todo bônus plano de força: Agressivo = estilo Agressivo/Agressivo, Disciplinado
// = Controle/Controle (o custo e a variância vêm do estilo no motor), Anti-strat
// só foca a preparação contra o adversário (matchTacticsFor) e Foco no mapa forte
// segue puxando o veto e o mapa forte.
/** Reparo em save.fixes: plano antigo migrado para o estilo equivalente (uma vez por save). */
export const PLAN_STYLE_FIX = 'plano-estilo-v1';
export type CareerGamePlan = 'disciplined' | 'antistrat' | 'mapfocus' | 'aggressive';
/** Estilo que cada plano escreve em tactics.style (null = o plano não mexe no estilo). */
export const PLAN_STYLE: Record<CareerGamePlan, { t: 'aggressive' | 'control'; ct: 'aggressive' | 'control' } | null> = {
  aggressive: { t: 'aggressive', ct: 'aggressive' },
  disciplined: { t: 'control', ct: 'control' },
  antistrat: null,
  mapfocus: null,
};
export function applyGamePlan(t: TTeam, plan: CareerGamePlan): TTeam {
  if (plan === 'mapfocus') {
    const prefs: Record<string, number> = { ...t.mapPrefs };
    const best = Object.entries(prefs).sort((a, b) => b[1] - a[1])[0];
    if (best) prefs[best[0]] = Math.min(5, best[1] + 2); // reforça o melhor mapa (veto + força no mapa)
    return { ...t, mapPrefs: prefs };
  }
  return t;
}

// ─── Técnico: estilo escolhido, potência pelo atributo certo ─────────────────
/** O atributo da comissão que dá potência a cada estilo (função) do técnico. */
export const STYLE_ATTR: Record<CoachStyle, StaffAttrKey> = { tactical: 'tactics', aggressive: 'motivating', discipline: 'discipline' };
/**
 * Potência do estilo no motor pelo atributo da função: 13 = 0 (o técnico
 * mediano já tem a inclinação do próprio estilo), 18 = 1, teto 1,6. Um técnico
 * da base portado para a comissão fica perto da régua da IA ((rating−75)/12).
 */
export function stylePower(attr: number | undefined): number {
  const a = typeof attr === 'number' && Number.isFinite(attr) ? attr : 10;
  return clamp((a - 13) / 5, 0, 1.6);
}
/** Técnico que o motor lê na SUA partida: estilo escolhido na comissão e potência pelo atributo dele. */
export function coachForMatch(coach: Coach, hc?: Pick<StaffMember, 'style' | 'attrs'> | null): Coach {
  if (!hc?.attrs) return coach;
  const style = hc.style ?? coach.style;
  return { ...coach, style, pow: stylePower(hc.attrs[STYLE_ATTR[style]]) };
}
/** Pontos percentuais de vitória numa MD3 por ponto de força (medido no espelho). */
export const PP_PER_POINT = 5;
/** Quanto o técnico rende na partida: bônus-base + o efeito médio do estilo. */
export function coachMatchImpact(coach: Pick<Coach, 'rating' | 'pow'>): { points: number; pp: number } {
  const pow = coach.pow ?? Math.max(0, (coach.rating - 75) / 12);
  const points = Math.round((coachBaseBonus(coach) + 0.35 * pow) * 10) / 10;
  return { points, pp: Math.round(points * PP_PER_POINT) };
}
/** Analista na leitura automática de anti-strat: soma à leitura do time (0 sem analista). */
export function analystScoutingPrep(antiStratRead: number): number {
  return clamp((antiStratRead - 0.1) * 0.3, 0, 0.3);
}
