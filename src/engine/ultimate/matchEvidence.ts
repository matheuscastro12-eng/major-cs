// [U04] PÓS-JOGO COM EVIDÊNCIAS — relatório derivado SÓ do que o motor registrou.
//
// Duas listas separadas de propósito:
//   observed → o que ACONTECEU (roundLog, killFeed, stats por jogador do MapResult)
//   modeled  → o que foi APLICADO ao modelo (química, evolução, estilos, abordagem)
// e até 3 insights, cada um com a evidência numérica que o sustenta e uma ação
// (ajuste do squad, tática/abordagem, coleção). Nada de causa contrafactual:
// "perdeu 7 de 9 aberturas" é fato; "teria vencido com X" não aparece aqui.
//
// Auditoria da camada de transmissão (liveDrama/liveFrags/showtime): as falas
// do caster e o "momento de estrela" são derivados de roundLog + TRAITS das
// cartas (apresentação, não evento do motor). Por isso este módulo NÃO lê
// DramaScript/MatchStar — só MapResult. Puro e determinístico.
import type { KillEvent, MapResult, PlayerLine, SeriesResult, TTeam } from '../../types';
import type { Approach } from './squadAnalysis';
import { APPROACH_DEFS, APPROACH_TO_PLAYBOOK } from './squadAnalysis';

export type InsightAction = 'ajuste' | 'tatica' | 'colecao';
export interface Fact { label: string; value: string; tone?: 'good' | 'bad' | 'info' }
export interface Insight { icon: string; text: string; action: InsightAction; evidence: string; tone: 'good' | 'bad' | 'info' }
export interface MatchEvidence {
  observed: Fact[];
  modeled: Fact[];
  insights: Insight[];   // ≤ 3
  hasKillFeed: boolean;  // false ⇒ fallback honesto (sem duelos/trocas)
}

export interface EvidenceModifiers {
  chem?: number;            // multiplicador de química aplicado (ex.: 1.04)
  chemTotal?: number;       // pontos de química (0..15) — só exibição
  evoBoost?: number;        // Σ níveis de evolução
  duelTotal?: number;       // pontos de estilos/traits
  duelMult?: number;
  approach?: Approach | null;
  oppApproach?: Approach | null;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const emptyLine: PlayerLine = { kills: 0, deaths: 0, assists: 0, dmg: 0, kastRounds: 0, rounds: 0, openKills: 0, clutchWins: 0, hsKills: 0, mkRounds: 0, tradedDeaths: 0 };

type TeamLines = { id: string; nick: string; line: PlayerLine }[];

function teamLines(map: MapResult, team: TTeam): TeamLines {
  return team.players.map((p) => ({ id: p.id, nick: p.nick, line: map.stats[p.id]?.both ?? emptyLine }));
}

// aberturas e trocas por time a partir do killFeed REAL
function duelFacts(feed: readonly KillEvent[], my: 0 | 1) {
  const opens = feed.filter((k) => k.opening);
  const myOpens = opens.filter((k) => k.killerTeam === my).length;
  const myDeathsTraded = feed.filter((k) => k.victimTeam === my && k.trade).length;
  const myDeaths = feed.filter((k) => k.victimTeam === my).length;
  const hs = feed.filter((k) => k.killerTeam === my && k.headshot).length;
  const myKills = feed.filter((k) => k.killerTeam === my).length;
  return { opens: opens.length, myOpens, myDeaths, myDeathsTraded, hs, myKills };
}

function halfSplit(map: MapResult, my: 0 | 1): { h1: [number, number]; h2: [number, number]; ot: [number, number] } {
  const log = map.roundLog;
  const count = (from: number, to: number): [number, number] => {
    let a = 0, b = 0;
    for (let i = from; i < Math.min(to, log.length); i++) { if (log[i] === my) a++; else b++; }
    return [a, b];
  };
  return { h1: count(0, 12), h2: count(12, 24), ot: count(24, log.length) };
}

export function buildMatchEvidence(series: SeriesResult, teams: [TTeam, TTeam], myIdx: 0 | 1, mods: EvidenceModifiers = {}): MatchEvidence {
  const map = series.maps[0];
  const observed: Fact[] = [];
  const modeled: Fact[] = [];
  const insights: Insight[] = [];
  if (!map) return { observed, modeled, insights, hasKillFeed: false };
  const opp: 0 | 1 = myIdx === 0 ? 1 : 0;
  const me = teams[myIdx]; const rival = teams[opp];
  const won = map.winner === myIdx;
  const my = map.score[myIdx]; const their = map.score[opp];

  // ── OBSERVADO ──
  observed.push({ label: 'Placar', value: `${my}–${their}${map.ot ? ' (OT)' : ''}`, tone: won ? 'good' : 'bad' });
  const halves = halfSplit(map, myIdx);
  observed.push({ label: '1º half', value: `${halves.h1[0]}–${halves.h1[1]}`, tone: halves.h1[0] > halves.h1[1] ? 'good' : halves.h1[0] < halves.h1[1] ? 'bad' : 'info' });
  if (map.roundLog.length > 12) observed.push({ label: '2º half', value: `${halves.h2[0]}–${halves.h2[1]}`, tone: halves.h2[0] > halves.h2[1] ? 'good' : halves.h2[0] < halves.h2[1] ? 'bad' : 'info' });
  const pistols = [map.roundLog[0], map.roundLog[12]].filter((w): w is 0 | 1 => w === 0 || w === 1);
  const pistolWins = pistols.filter((w) => w === myIdx).length;
  if (pistols.length) observed.push({ label: 'Pistols', value: `${pistolWins} de ${pistols.length}`, tone: pistolWins === pistols.length ? 'good' : pistolWins === 0 ? 'bad' : 'info' });
  const hasKillFeed = map.killFeed.length > 0;
  const d = duelFacts(map.killFeed, myIdx);
  if (hasKillFeed) {
    observed.push({ label: 'Aberturas', value: `${d.myOpens} de ${d.opens}`, tone: d.myOpens * 2 > d.opens ? 'good' : d.myOpens * 2 < d.opens ? 'bad' : 'info' });
    observed.push({ label: 'Mortes trocadas', value: `${d.myDeathsTraded} de ${d.myDeaths} (${pct(d.myDeathsTraded, d.myDeaths)}%)`, tone: 'info' });
    observed.push({ label: 'Headshots', value: `${d.hs} de ${d.myKills} (${pct(d.hs, d.myKills)}%)`, tone: 'info' });
  }
  const mine = teamLines(map, me).sort((a, b) => (b.line.kills - b.line.deaths) - (a.line.kills - a.line.deaths));
  const theirs = teamLines(map, rival).sort((a, b) => (b.line.kills - b.line.deaths) - (a.line.kills - a.line.deaths));
  if (mine.length) {
    const best = mine[0]; const worst = mine[mine.length - 1];
    observed.push({ label: 'Seu melhor', value: `${best.nick} ${best.line.kills}K-${best.line.deaths}D`, tone: 'good' });
    if (worst.id !== best.id) observed.push({ label: 'Seu pior', value: `${worst.nick} ${worst.line.kills}K-${worst.line.deaths}D`, tone: 'bad' });
    const clutches = mine.reduce((a, p) => a + p.line.clutchWins, 0);
    if (clutches > 0) observed.push({ label: 'Clutches seus', value: String(clutches), tone: 'good' });
  }
  if (theirs.length) observed.push({ label: 'Melhor deles', value: `${theirs[0].nick} ${theirs[0].line.kills}K-${theirs[0].line.deaths}D`, tone: 'info' });

  // ── MODELADO (o que foi aplicado — sem afirmar quanto pesou no resultado) ──
  if (mods.chem != null) modeled.push({ label: 'Química', value: `×${mods.chem.toFixed(2)}${mods.chemTotal != null ? ` (${mods.chemTotal}/15)` : ''}` });
  if (mods.evoBoost != null && mods.evoBoost > 0) modeled.push({ label: 'Evolução', value: `×${(1 + mods.evoBoost * 0.01).toFixed(2)} (+${mods.evoBoost} níveis)` });
  if (mods.duelTotal != null && mods.duelTotal > 0 && mods.duelMult != null) modeled.push({ label: 'Estilos/traits', value: `×${mods.duelMult.toFixed(3)}` });
  if (mods.approach) modeled.push({ label: 'Sua abordagem', value: `${APPROACH_DEFS[mods.approach].name} (${APPROACH_TO_PLAYBOOK[mods.approach]})` });
  if (mods.oppApproach) modeled.push({ label: 'Abordagem rival', value: APPROACH_DEFS[mods.oppApproach].name });
  if (!modeled.length) modeled.push({ label: 'Modificadores', value: 'nenhum aplicado' });

  // ── INSIGHTS (≤3), cada um preso à evidência ──
  const push = (i: Insight) => { if (insights.length < 3) insights.push(i); };
  if (hasKillFeed && d.opens >= 6 && d.myOpens * 3 <= d.opens) {
    push({ icon: '🚪', tone: 'bad', action: 'ajuste', text: 'Perdeu a maioria das aberturas. Quem abre o round precisa de mira/reflexo maiores — ou de um Entry no slot.', evidence: `${d.myOpens} de ${d.opens} aberturas` });
  }
  if (pistols.length === 2 && pistolWins === 0) {
    push({ icon: '🔫', tone: 'bad', action: 'tatica', text: 'Perdeu os dois pistols. A abordagem Agressividade favorece o pistol; Controle e Adaptação pagam para jogá-lo.', evidence: 'pistols 0 de 2' });
  }
  if (halves.h1[0] >= 8 && map.roundLog.length > 12 && halves.h2[0] + halves.ot[0] < halves.h2[1] + halves.ot[1] - 2) {
    push({ icon: '📉', tone: 'bad', action: 'tatica', text: 'Dominou o 1º half e caiu no 2º. Adaptação dá ajuste de 2º half; Controle segura round longo.', evidence: `1º ${halves.h1[0]}–${halves.h1[1]} · 2º ${halves.h2[0] + halves.ot[0]}–${halves.h2[1] + halves.ot[1]}` });
  }
  if (mods.chemTotal != null && mods.chemTotal <= 6) {
    push({ icon: '🔗', tone: 'info', action: 'ajuste', text: 'Química baixa: cartas do mesmo país, região ou org e função certa no slot sobem o multiplicador.', evidence: `química ${mods.chemTotal}/15 (×${(mods.chem ?? 1).toFixed(2)})` });
  }
  if (mine.length >= 2) {
    const worst = mine[mine.length - 1]; const avgKd = mine.reduce((a, p) => a + (p.line.kills - p.line.deaths), 0) / mine.length;
    if (worst.line.kills - worst.line.deaths <= avgKd - 6 && worst.line.rounds >= 12) {
      push({ icon: '🎯', tone: 'info', action: 'colecao', text: `${worst.nick} ficou muito abaixo do resto do squad nesta partida. Um alvo no mercado para esse slot é o próximo passo natural.`, evidence: `${worst.nick} ${worst.line.kills}K-${worst.line.deaths}D vs média ${avgKd >= 0 ? '+' : ''}${avgKd.toFixed(1)} K-D` });
    }
  }
  if (hasKillFeed && d.myDeaths >= 10 && pct(d.myDeathsTraded, d.myDeaths) < 25) {
    push({ icon: '🔁', tone: 'info', action: 'ajuste', text: 'Poucas mortes trocadas: o time não estava junto na hora do duelo. Suporte/Lurker com leitura alta ajuda a trocar.', evidence: `${d.myDeathsTraded} de ${d.myDeaths} mortes trocadas` });
  }
  if (won && !insights.length) {
    const best = mine[0];
    push({ icon: '✅', tone: 'good', action: 'ajuste', text: best ? `${best.nick} carregou a partida. Mantenha o núcleo e melhore o slot mais fraco.` : 'Vitória sólida.', evidence: best ? `${best.nick} ${best.line.kills}K-${best.line.deaths}D` : `${my}–${their}` });
  }
  if (!insights.length) {
    push({ icon: 'ℹ️', tone: 'info', action: 'ajuste', text: 'Sem padrão claro nesta partida: nenhum eixo (aberturas, pistols, halves, trocas) saiu da faixa normal.', evidence: `${my}–${their}` });
  }
  return { observed, modeled, insights, hasKillFeed };
}
