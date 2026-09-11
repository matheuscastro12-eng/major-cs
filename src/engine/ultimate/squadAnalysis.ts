// [U03] AVALIADOR DE ELENCO + PREPARAÇÃO DE TIME do Ultimate — adaptador único.
//
// Antes, três lugares montavam o TTeam do Ultimate e aplicavam multiplicadores
// cada um do seu jeito (playMatch, startPvpMatch, playDraftMatch), e o pré-jogo
// mostrava um "×força" que omitia a evolução. Aqui vive a composição inteira:
//
//   strength = buildUserTeam(...)            (atributos brutos → força, ratings.ts)
//            × química (0.90–1.10, chemistry.ts)
//            × evolução (1 + Σboost × EVO_PCT)         só onde a evolução vale
//            × estilos/traits (1.00–1.03, traits.ts)  só se duel.total > 0
//   + ABORDAGEM pré-jogo → TTeam.playbook (hook que o motor JÁ tem: playbookLean
//     em match.ts dá custo e benefício POR CONTEXTO de round — lado, pistol,
//     eco, 2º half, mapa próprio). Nenhum percentual novo foi inventado: a
//     abordagem só liga o esquema existente com um entrosamento fixo.
//
// Regras específicas do Ultimate ficam AQUI, fora do comportamento padrão do
// engine compartilhado. Sem RNG/relógio: mesma entrada ⇒ mesmo time.
import type { Coach, Player, Playbook, Role, TeamSeason, TTeam } from '../../types';
import { buildUserTeam } from '../ratings';
import { pick, type Rng } from '../rng';

// ── Entrada mínima (estrutural — o PoolPlayer da UI satisfaz) ────────────────
export interface PoolLike { id: string; ovr: number; player: Player; from: TeamSeason }

// ── Abordagem pré-jogo ──────────────────────────────────────────────────────
export type Approach = 'aggressive' | 'control' | 'adaptive';
export const APPROACH_IDS: Approach[] = ['aggressive', 'control', 'adaptive'];
export const APPROACH_TO_PLAYBOOK: Record<Approach, Playbook> = {
  aggressive: 'aggressive',   // pressão no T e no pistol; exposto no CT e atrás no placar
  control: 'controlled',      // forte no CT e em round longo; ataque lento, pistol arriscado
  adaptive: 'tactical',       // ajuste de 2º half e mapa próprio; pistol sem ritmo
};
// Entrosamento fixo do Ultimate: o squad não "treina" esquema como na Carreira,
// então o efeito do playbook entra parcial. Constante explícita, revisável.
export const APPROACH_FAM = 0.7;
export const APPROACH_DEFS: Record<Approach, { name: string; desc: string; strong: string; weak: string }> = {
  aggressive: { name: 'Agressividade', desc: 'Pressão no ataque e nos pistols.', strong: 'lado T · pistol · force', weak: 'lado CT · atrás no placar' },
  control: { name: 'Controle', desc: 'Defesa estruturada e rounds longos.', strong: 'lado CT · 2º half', weak: 'ataque lento · pistol' },
  adaptive: { name: 'Adaptação', desc: 'Lê o jogo e ajusta no segundo tempo.', strong: '2º half · mapa próprio · CT', weak: 'pistol sem ritmo' },
};
export function isApproach(v: unknown): v is Approach {
  return v === 'aggressive' || v === 'control' || v === 'adaptive';
}

// ── Multiplicadores (fonte única — a UI mostra o MESMO número que o motor usa) ─
export const EVO_PCT = 0.01;   // +1% de força por nível de evolução (igual ao playMatch antigo)
export interface Multipliers { chem: number; evoBoost: number; duelTotal: number; duelMult: number }
export function effectiveMultiplier(m: Multipliers): number {
  const evo = 1 + Math.max(0, m.evoBoost) * EVO_PCT;
  const duel = m.duelTotal > 0 ? m.duelMult : 1;
  return m.chem * evo * duel;
}

// Mesmo coach/ids do buildOnlineTeam (components/online/onlineData.ts) — replicado
// aqui pra o engine não importar componente. Se mudar lá, mudar aqui.
const DEFAULT_COACH: Coach = { nick: 'coach', name: 'Técnico', country: 'br', rating: 70, style: 'tactical' };
export function buildBaseTeam(name: string, picks: PoolLike[], idPrefix: string): TTeam {
  const team = buildUserTeam(name, picks.map((p) => ({ player: p.player, from: p.from })), DEFAULT_COACH);
  return { ...team, id: idPrefix, name, players: team.players.map((p) => ({ ...p, id: `${idPrefix}__${p.sourcePlayerId}` })) };
}

export interface PrepareInput {
  name: string;
  picks: PoolLike[];
  idPrefix: string;
  mult?: Partial<Multipliers>;   // ausente = sem multiplicador (ex.: IA hoje)
  approach?: Approach | null;    // ausente = sem playbook (comportamento antigo)
}
export function prepareUltimateTeam(input: PrepareInput): TTeam {
  const team = buildBaseTeam(input.name, input.picks, input.idPrefix);
  if (input.mult) {
    team.strength *= effectiveMultiplier({ chem: input.mult.chem ?? 1, evoBoost: input.mult.evoBoost ?? 0, duelTotal: input.mult.duelTotal ?? 0, duelMult: input.mult.duelMult ?? 1 });
  }
  if (input.approach) {
    team.playbook = APPROACH_TO_PLAYBOOK[input.approach];
    team.playbookFam = APPROACH_FAM;
  }
  return team;
}

// ── Perfil de elenco (só dos dados que EXISTEM no Player) ───────────────────
export type Axis = 'abertura' | 'suporte' | 'controle' | 'fechamento';
export interface AxisScore { axis: Axis; score: number; basis: string }   // basis = de onde veio o número
export interface SquadProfile { axes: AxisScore[]; strengths: AxisScore[]; weakness: AxisScore | null }
export const AXIS_LABEL: Record<Axis, string> = { abertura: 'Abertura', suporte: 'Suporte / troca', controle: 'Controle', fechamento: 'Fechamento' };

const r0 = (v: number) => Math.round(Math.max(1, Math.min(99, v)));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const top = (xs: number[], n: number) => [...xs].sort((a, b) => b - a).slice(0, n);
const styleOf = (p: Player) => p.playstyle ?? (p.role === 'Entry' ? 'aggressive' : p.role === 'Support' || p.role === 'Lurker' ? 'passive' : 'balanced');

export function squadProfile(players: Player[]): SquadProfile {
  const has = (r: Role) => players.some((p) => p.role === r || p.role2 === r);
  // ABERTURA: quem abre o round — Entry / agressivo; mira pesa, clutch ajuda no 1º duelo
  const openers = players.filter((p) => p.role === 'Entry' || p.role2 === 'Entry' || styleOf(p) === 'aggressive');
  const openScore = (p: Player) => p.aim * 0.7 + p.clutch * 0.3;
  const abertura: AxisScore = openers.length
    ? { axis: 'abertura', score: r0(mean(top(openers.map(openScore), 2))), basis: `${openers.map((p) => p.nick).slice(0, 2).join(' e ')}: mira e clutch de quem abre` }
    : { axis: 'abertura', score: r0(Math.max(...players.map(openScore)) - 6), basis: 'sem Entry nem agressivo no elenco (−6)' };
  // SUPORTE / TROCA: Support e Lurker — leitura (igl) + constância
  const sup = players.filter((p) => p.role === 'Support' || p.role === 'Lurker' || p.role2 === 'Support');
  const supScore = (p: Player) => p.igl * 0.5 + p.consistency * 0.5;
  const suporte: AxisScore = sup.length
    ? { axis: 'suporte', score: r0(mean(sup.map(supScore))), basis: `${sup.map((p) => p.nick).slice(0, 2).join(' e ')}: leitura e constância do suporte` }
    : { axis: 'suporte', score: r0(mean(players.map((p) => p.consistency)) - 6), basis: 'sem Support/Lurker (−6): constância média do elenco' };
  // CONTROLE: o IGL — sem IGL o motor já penaliza (match.ts), aqui só mostramos
  const igl = players.reduce((b, p) => (p.igl > b.igl ? p : b), players[0]);
  const controle: AxisScore = has('IGL')
    ? { axis: 'controle', score: r0(igl.igl), basis: `${igl.nick}: IGL ${igl.igl}` }
    : { axis: 'controle', score: r0(igl.igl - 10), basis: `sem IGL de função (−10): melhor leitura é ${igl.nick} ${igl.igl}` };
  // FECHAMENTO: os dois melhores clutches
  const cl = top(players.map((p) => p.clutch), 2);
  const clNames = [...players].sort((a, b) => b.clutch - a.clutch).slice(0, 2).map((p) => p.nick);
  const fechamento: AxisScore = { axis: 'fechamento', score: r0(mean(cl)), basis: `${clNames.join(' e ')}: clutch ${cl.map(Math.round).join('/')}` };

  const axes = [abertura, suporte, controle, fechamento];
  const sorted = [...axes].sort((a, b) => b.score - a.score);
  const strengths = sorted.filter((a) => a.score >= 80).slice(0, 2);
  const worst = sorted[sorted.length - 1];
  const weakness = worst.score < 72 || sorted[0].score - worst.score >= 8 ? worst : null;
  return { axes, strengths, weakness };
}

// ── Adversário da IA: composição válida e perfis variados ───────────────────
// Antes: "os 5 OVR mais próximos do alvo" — determinístico pelo elo e, muitas
// vezes, sem IGL/AWP (o motor punia a IA sem querer). Agora: janela em torno do
// alvo, 1 IGL + 1 AWP + 1 Entry + 1 Support/Lurker + 1 livre, sorteados pelo rng
// da partida (mesmo seed ⇒ mesmo adversário). Dificuldade continua sendo o
// `target` explícito — nada de ajuste secreto por histórico.
export interface AiOpponent { five: PoolLike[]; approach: Approach; avgOvr: number }
const ROLE_PLAN: (Role | 'any')[] = ['IGL', 'AWP', 'Entry', 'Support', 'any'];
export function buildAiOpponent<T extends PoolLike>(candidates: T[], excludeIds: Set<string>, target: number, rng: Rng): AiOpponent & { five: T[] } {
  const pool = candidates.filter((p) => !excludeIds.has(p.id));
  const chosen: T[] = [];
  const taken = new Set<string>();
  let window = 4;
  let near = pool.filter((p) => Math.abs(p.ovr - target) <= window);
  while (near.length < 12 && window < 40) { window += 2; near = pool.filter((p) => Math.abs(p.ovr - target) <= window); }
  const fits = (p: T, want: Role | 'any') => want === 'any' ? true
    : want === 'Support' ? (p.player.role === 'Support' || p.player.role === 'Lurker' || p.player.role2 === 'Support')
      : (p.player.role === want || p.player.role2 === want);
  for (const want of ROLE_PLAN) {
    const cands = near.filter((p) => !taken.has(p.id) && fits(p, want))
      .sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target)).slice(0, 4);
    const fallback = near.filter((p) => !taken.has(p.id)).sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target)).slice(0, 4);
    const from = cands.length ? cands : fallback;
    if (!from.length) break;
    const p = pick(rng, from);
    chosen.push(p); taken.add(p.id);
  }
  // completa se o pool era curto (dataset pequeno)
  for (const p of pool.sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target))) {
    if (chosen.length >= 5) break;
    if (!taken.has(p.id)) { chosen.push(p); taken.add(p.id); }
  }
  chosen.sort((a, b) => b.ovr - a.ovr);
  const approach = pick(rng, APPROACH_IDS);
  const avgOvr = chosen.length ? Math.round(mean(chosen.map((p) => p.ovr))) : Math.round(target);
  return { five: chosen, approach, avgOvr };
}

// ── PvP: contrato versionado ────────────────────────────────────────────────
// v2 acrescenta `approach`. Só se os DOIS snapshots forem v≥2 os dois lados
// aplicam a abordagem — um cliente antigo ignora o campo e simula sem ele, então
// o cliente novo TAMBÉM tem que ignorar, senão os placares divergem.
export const PVP_SNAPSHOT_VERSION = 2;
export interface PvpTacticalSnapshot { v?: number; approach?: Approach | null }
export function pvpApproachesApply(a: PvpTacticalSnapshot, b: PvpTacticalSnapshot): boolean {
  return (a.v ?? 1) >= 2 && (b.v ?? 1) >= 2;
}
