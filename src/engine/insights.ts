import type { PlayerLine, SeriesResult, TTeam } from '../types';
import { MAP_LABELS } from '../types';
import { computeDisplay, mergeLines } from './match';
import { draftSynergy } from './ratings';
import { ct } from '../state/career-i18n';

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
    bullets.push({ icon: '⚖️', text: `${opp.name} ${ct('entrou mais forte no papel')} (${opp.strength.toFixed(1)} vs ${me.strength.toFixed(1)}).`, tone: 'bad' });
  } else if (gap > 2.5) {
    bullets.push({ icon: '⚖️', text: `${ct('Seu time era favorito no papel')} (${me.strength.toFixed(1)} vs ${opp.strength.toFixed(1)}).`, tone: won ? 'good' : 'info' });
  }

  const syn = draftSynergy(me.players);
  for (const item of syn.items) {
    if (item.value <= -2.5) {
      bullets.push({ icon: '🧩', text: `${ct('Composição:')} ${item.label} (${item.value.toFixed(1)} ${ct('de força')}). ${ct('Isso pesou em todos os rounds fechados.')}`, tone: 'bad' });
    }
  }
  if (!syn.hasIgl) {
    bullets.push({ icon: '📢', text: ct('Sem IGL, seu time perde força extra no segundo half de cada mapa - o adversário se adapta e ninguém recalcula a estratégia.'), tone: 'bad' });
  }
  if (!syn.hasAwp) {
    bullets.push({ icon: '🔭', text: ct('Sem AWPer, o lado CT sofreu para segurar as entradas - penalidade ativa em todos os rounds de defesa.'), tone: 'bad' });
  }

  // 2) veto / mapas
  const mapEdge = series.maps.reduce((s, m) => s + ((me.mapPrefs[m.map] ?? 0) - (opp.mapPrefs[m.map] ?? 0)), 0) / series.maps.length;
  if (mapEdge < -0.8) {
    bullets.push({ icon: '🗺️', text: `${ct('O veto te deixou em maus lençóis:')} ${series.maps.map((m) => MAP_LABELS[m.map]).join(', ')} ${ct('favoreciam o adversário.')}`, tone: 'bad' });
  } else if (mapEdge > 0.8) {
    bullets.push({ icon: '🗺️', text: ct('Os mapas jogados favoreciam o seu time - bom trabalho no veto.'), tone: 'good' });
  }

  // 3) coach
  const coachGap = me.coach.rating - opp.coach.rating;
  if (coachGap <= -8) {
    bullets.push({ icon: '🎓', text: `${ct('No banco,')} ${opp.coach.nick} (${opp.coach.rating}) ${ct('deu aula sobre')} ${me.coach.nick} (${me.coach.rating}).`, tone: 'bad' });
  } else if (coachGap >= 8) {
    bullets.push({ icon: '🎓', text: `${me.coach.nick} ${ct('venceu a batalha dos bancos')} (${me.coach.rating} vs ${opp.coach.rating}).`, tone: 'good' });
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
    bullets.push({ icon: '📉', text: `${worst.p.nick} ${ct('rendeu')} ${worst.d.rating.toFixed(2)} ${ct('de rating - muito abaixo do esperado para um jogador de OVR')} ${worst.p.ovr} (~${expectedRating(worst.p.ovr).toFixed(2)}).`, tone: 'bad' });
  }
  if (best && best.delta > 0.15) {
    bullets.push({ icon: '🔥', text: `${best.p.nick} ${ct('superou o esperado:')} ${best.d.rating.toFixed(2)} ${ct('de rating com OVR')} ${best.p.ovr}.`, tone: 'good' });
  }

  // 4.5) forma dos jogadores
  // "má fase" só faz sentido quando o jogador REALMENTE rendeu mal nesta série:
  // não acusa numa vitória, nem quem rendeu igual/acima do esperado pro seu OVR
  // (a forma é uma média lenta e ficava contradizendo um bom jogo / título).
  const cold = won ? [] : me.players.filter((p) => {
    if ((p.form ?? 1) > 0.96) return false;
    const line = playerSeriesLine(series, p.id);
    const rating = line ? computeDisplay(line).rating : 1;
    return rating < expectedRating(p.ovr);
  });
  const hot = me.players.filter((p) => (p.form ?? 1) >= 1.05);
  if (cold.length > 0) {
    bullets.push({ icon: '🥶', text: `${cold.map((p) => p.nick).join(', ')} ${ct('chegou em má fase à série - a forma do torneio pesa na pontaria.')}`, tone: 'bad' });
  }
  if (hot.length > 0 && won) {
    bullets.push({ icon: '🔥', text: `${hot.map((p) => p.nick).join(', ')} ${ct('está em chamas no campeonato e carregou o time.')}`, tone: 'good' });
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
    bullets.push({ icon: '💔', text: `${ct('Os rounds decisivos escaparam:')} ${oppClutch} ${ct('clutches do adversário contra')} ${myClutch} ${ct('seus.')}`, tone: 'bad' });
  } else if (myClutch - oppClutch >= 3) {
    bullets.push({ icon: '🧊', text: `${ct('Seu time venceu os momentos de pressão:')} ${myClutch} ${ct('clutches contra')} ${oppClutch}.`, tone: 'good' });
  }
  const myOpen = sum(me, 'openKills');
  const oppOpen = sum(opp, 'openKills');
  if (oppOpen - myOpen >= 6) {
    bullets.push({ icon: '⚡', text: `${ct('O adversário venceu os duelos de abertura')} (${oppOpen} a ${myOpen}) - ${ct('seu time começou a maioria dos rounds em desvantagem numérica.')}`, tone: 'bad' });
  } else if (myOpen - oppOpen >= 6) {
    bullets.push({ icon: '⚡', text: `${ct('Seu time dominou as aberturas de round')} (${myOpen} a ${oppOpen}).`, tone: 'good' });
  }

  // 5.5) história do mapa: viradas e apagões (lê o placar round a round).
  // Roda o placar cumulativo do mapa: a maior desvantagem que o time reverteu
  // (e fechou o mapa) vira "jogou de baixo"; a maior vantagem que escorreu pelos
  // dedos vira "apagão". Puro leitura do roundLog, nada de simulação.
  let bestComeback = 0;
  let worstChoke = 0;
  for (const m of series.maps) {
    let povR = 0, oppR = 0, maxDeficit = 0, maxLead = 0;
    for (const w of m.roundLog) {
      if (w === povIdx) povR++; else oppR++;
      if (oppR - povR > maxDeficit) maxDeficit = oppR - povR;
      if (povR - oppR > maxLead) maxLead = povR - oppR;
    }
    if (m.winner === povIdx) bestComeback = Math.max(bestComeback, maxDeficit);
    else worstChoke = Math.max(worstChoke, maxLead);
  }
  if (bestComeback >= 5) {
    bullets.push({ icon: '🔄', text: `${ct('Seu time jogou de baixo e virou:')} ${ct('chegou a estar')} ${bestComeback} ${ct('rounds atrás e ainda assim fechou o mapa. Cabeça fria na hora do save e no anti-eco.')}`, tone: 'good' });
  }
  if (worstChoke >= 5) {
    bullets.push({ icon: '🕳️', text: `${ct('Apagão caro:')} ${ct('seu time abriu')} ${worstChoke} ${ct('rounds de vantagem e deixou o mapa escapar. O adversário achou os retakes e o placar desandou.')}`, tone: 'bad' });
  }

  // 5.6) disciplina de trade / refrag: morte trocada mantém o round no 5v5;
  // morrer seco entrega vantagem numérica de graça. Compara a taxa de refrag dos
  // dois lados (mortes trocadas sobre o total de mortes) — só leitura das linhas.
  const teamTrades = (team: TTeam) =>
    team.players.reduce((acc, p) => {
      const line = playerSeriesLine(series, p.id);
      return { td: acc.td + (line?.tradedDeaths ?? 0), d: acc.d + (line?.deaths ?? 0) };
    }, { td: 0, d: 0 });
  const myTrades = teamTrades(me);
  const oppTrades = teamTrades(opp);
  const myRefrag = myTrades.d > 0 ? myTrades.td / myTrades.d : 0;
  const oppRefrag = oppTrades.d > 0 ? oppTrades.td / oppTrades.d : 0;
  if (oppRefrag - myRefrag > 0.12) {
    bullets.push({ icon: '🔗', text: ct('Disciplina de trade: o adversário refragou quase toda baixa, enquanto seu time caiu seco. Sem a troca, cada entry virou desvantagem numérica no round.'), tone: 'bad' });
  } else if (myRefrag - oppRefrag > 0.12) {
    bullets.push({ icon: '🔗', text: ct('Seu time trocou tudo: quase nenhuma morte ficou sem refrag e os rounds se mantiveram no 5v5. Disciplina de trade impecável.'), tone: 'good' });
  }

  // 6) overtime / placares apertados
  const otMaps = series.maps.filter((m) => m.ot).length;
  if (otMaps > 0 && !won) {
    bullets.push({ icon: '⏱️', text: `${otMaps} ${ct('mapa(s) foram para overtime - faltou pouco. Detalhes de composição decidem exatamente esses rounds.')}`, tone: 'info' });
  }

  if (bullets.length === 0) {
    bullets.push({ icon: 'ℹ️', text: won ? ct('Vitória sólida, sem ressalvas: o time funcionou em todas as frentes.') : ct('Derrota sem um vilão claro: o adversário simplesmente executou melhor.'), tone: 'info' });
  }

  const verdict = won
    ? `${ct('Vitória de')} ${me.name} ${ct('por')} ${series.mapScore[povIdx]}-${series.mapScore[povIdx === 0 ? 1 : 0]} ${ct('sobre')} ${opp.name}.`
    : `${opp.name} ${ct('venceu por')} ${series.mapScore[povIdx === 0 ? 1 : 0]}-${series.mapScore[povIdx]}. ${ct('Entenda o porquê:')}`;

  return { verdict, bullets };
}
