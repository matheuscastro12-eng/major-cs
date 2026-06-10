import type { PlayerLine, SeriesResult, TTeam } from '../types';
import { MAP_LABELS } from '../types';
import { computeDisplay, mergeLines } from './match';
import { draftSynergy } from './ratings';

export interface SeriesInsight {
  verdict: string;
  bullets: { icon: string; text: string; tone: 'good' | 'bad' | 'info' }[];
}

function playerSeriesLine(series: SeriesResult, pid: string): PlayerLine | null {
  const lines = series.maps.map((m) => m.stats[pid]).filter(Boolean).map((s) => s.both);
  if (lines.length === 0) return null;
  return mergeLines(lines);
}

// rating esperado em função do OVR (calibrado: OVR 95 ≈ 1.18, OVR 80 ≈ 0.95)
function expectedRating(ovr: number): number {
  return 0.95 + (ovr - 80) * 0.0155;
}

export function analyzeSeries(series: SeriesResult, teams: [TTeam, TTeam], povIdx: 0 | 1): SeriesInsight {
  const me = teams[povIdx];
  const opp = teams[povIdx === 0 ? 1 : 0];
  const won = series.winner === povIdx;
  const bullets: SeriesInsight['bullets'] = [];

  // 1) força base e composição
  const gap = me.strength - opp.strength;
  if (gap < -2.5) {
    bullets.push({ icon: '⚖️', text: `${opp.name} entrou mais forte no papel (${opp.strength.toFixed(1)} vs ${me.strength.toFixed(1)}).`, tone: 'bad' });
  } else if (gap > 2.5) {
    bullets.push({ icon: '⚖️', text: `Seu time era favorito no papel (${me.strength.toFixed(1)} vs ${opp.strength.toFixed(1)}).`, tone: won ? 'good' : 'info' });
  }

  const syn = draftSynergy(me.players);
  for (const item of syn.items) {
    if (item.value <= -2.5) {
      bullets.push({ icon: '🧩', text: `Composição: ${item.label} (${item.value.toFixed(1)} de força). Isso pesou em todos os rounds fechados.`, tone: 'bad' });
    }
  }
  if (!syn.hasIgl) {
    bullets.push({ icon: '📢', text: 'Sem IGL, seu time perde força extra no segundo half de cada mapa - o adversário se adapta e ninguém recalcula a estratégia.', tone: 'bad' });
  }
  if (!syn.hasAwp) {
    bullets.push({ icon: '🔭', text: 'Sem AWPer, o lado CT sofreu para segurar as entradas - penalidade ativa em todos os rounds de defesa.', tone: 'bad' });
  }

  // 2) veto / mapas
  const mapEdge = series.maps.reduce((s, m) => s + ((me.mapPrefs[m.map] ?? 0) - (opp.mapPrefs[m.map] ?? 0)), 0) / series.maps.length;
  if (mapEdge < -0.8) {
    bullets.push({ icon: '🗺️', text: `O veto te deixou em maus lençóis: ${series.maps.map((m) => MAP_LABELS[m.map]).join(', ')} favoreciam o adversário.`, tone: 'bad' });
  } else if (mapEdge > 0.8) {
    bullets.push({ icon: '🗺️', text: 'Os mapas jogados favoreciam o seu time - bom trabalho no veto.', tone: 'good' });
  }

  // 3) coach
  const coachGap = me.coach.rating - opp.coach.rating;
  if (coachGap <= -8) {
    bullets.push({ icon: '🎓', text: `No banco, ${opp.coach.nick} (${opp.coach.rating}) deu aula sobre ${me.coach.nick} (${me.coach.rating}).`, tone: 'bad' });
  } else if (coachGap >= 8) {
    bullets.push({ icon: '🎓', text: `${me.coach.nick} venceu a batalha dos bancos (${me.coach.rating} vs ${opp.coach.rating}).`, tone: 'good' });
  }

  // 4) desempenho individual vs OVR
  const perf = me.players
    .map((p) => {
      const line = playerSeriesLine(series, p.id);
      if (!line) return null;
      const d = computeDisplay(line);
      return { p, d, delta: d.rating - expectedRating(p.ovr) };
    })
    .filter(Boolean) as { p: (typeof me.players)[number]; d: ReturnType<typeof computeDisplay>; delta: number }[];

  perf.sort((a, b) => a.delta - b.delta);
  const worst = perf[0];
  const best = perf[perf.length - 1];
  if (worst && worst.delta < -0.18) {
    bullets.push({ icon: '📉', text: `${worst.p.nick} rendeu ${worst.d.rating.toFixed(2)} de rating - muito abaixo do esperado para um jogador de OVR ${worst.p.ovr} (~${expectedRating(worst.p.ovr).toFixed(2)}).`, tone: 'bad' });
  }
  if (best && best.delta > 0.15) {
    bullets.push({ icon: '🔥', text: `${best.p.nick} superou o esperado: ${best.d.rating.toFixed(2)} de rating com OVR ${best.p.ovr}.`, tone: 'good' });
  }

  // 4.5) forma dos jogadores
  const cold = me.players.filter((p) => (p.form ?? 1) <= 0.96);
  const hot = me.players.filter((p) => (p.form ?? 1) >= 1.05);
  if (cold.length > 0) {
    bullets.push({ icon: '🥶', text: `${cold.map((p) => p.nick).join(', ')} chegou em má fase à série - a forma do torneio pesa na pontaria.`, tone: 'bad' });
  }
  if (hot.length > 0 && won) {
    bullets.push({ icon: '🔥', text: `${hot.map((p) => p.nick).join(', ')} está em chamas no campeonato e carregou o time.`, tone: 'good' });
  }

  // 5) rounds decisivos: clutches e aberturas
  const sum = (team: TTeam, key: 'clutchWins' | 'openKills') =>
    team.players.reduce((s, p) => {
      const line = playerSeriesLine(series, p.id);
      return s + (line ? line[key] : 0);
    }, 0);
  const myClutch = sum(me, 'clutchWins');
  const oppClutch = sum(opp, 'clutchWins');
  if (oppClutch - myClutch >= 3) {
    bullets.push({ icon: '💔', text: `Os rounds decisivos escaparam: ${oppClutch} clutches do adversário contra ${myClutch} seus.`, tone: 'bad' });
  } else if (myClutch - oppClutch >= 3) {
    bullets.push({ icon: '🧊', text: `Seu time venceu os momentos de pressão: ${myClutch} clutches contra ${oppClutch}.`, tone: 'good' });
  }
  const myOpen = sum(me, 'openKills');
  const oppOpen = sum(opp, 'openKills');
  if (oppOpen - myOpen >= 6) {
    bullets.push({ icon: '⚡', text: `O adversário venceu os duelos de abertura (${oppOpen} a ${myOpen}) - seu time começou a maioria dos rounds em desvantagem numérica.`, tone: 'bad' });
  } else if (myOpen - oppOpen >= 6) {
    bullets.push({ icon: '⚡', text: `Seu time dominou as aberturas de round (${myOpen} a ${oppOpen}).`, tone: 'good' });
  }

  // 6) overtime / placares apertados
  const otMaps = series.maps.filter((m) => m.ot).length;
  if (otMaps > 0 && !won) {
    bullets.push({ icon: '⏱️', text: `${otMaps} mapa(s) foram para overtime - faltou pouco. Detalhes de composição decidem exatamente esses rounds.`, tone: 'info' });
  }

  if (bullets.length === 0) {
    bullets.push({ icon: 'ℹ️', text: won ? 'Vitória sólida, sem ressalvas: o time funcionou em todas as frentes.' : 'Derrota sem um vilão claro: o adversário simplesmente executou melhor.', tone: 'info' });
  }

  const verdict = won
    ? `Vitória de ${me.name} por ${series.mapScore[povIdx]}-${series.mapScore[povIdx === 0 ? 1 : 0]} sobre ${opp.name}.`
    : `${opp.name} venceu por ${series.mapScore[povIdx === 0 ? 1 : 0]}-${series.mapScore[povIdx]}. Entenda o porquê:`;

  return { verdict, bullets };
}
