import { computeDisplay, mergeLines } from './match';
import type { PlayerLine, Tournament } from '../types';

function playerLines(t: Tournament, playerId: string): PlayerLine[] {
  const lines: PlayerLine[] = [];
  for (const item of t.history) {
    for (const map of item.pairing.result?.maps ?? []) {
      const stats = map.stats[playerId];
      if (stats) lines.push(stats.both);
    }
  }
  return lines;
}

export function tournamentMvpNick(t: Tournament): string {
  const explicit = t.mvpId && t.teams.flatMap((team) => team.players).find((player) => player.id === t.mvpId);
  if (explicit) return explicit.nick;

  let best = { nick: '', rating: 0 };
  for (const player of t.teams.flatMap((team) => team.players)) {
    const lines = playerLines(t, player.id);
    if (!lines.length) continue;
    const rating = computeDisplay(mergeLines(lines)).rating;
    if (rating > best.rating) best = { nick: player.nick, rating };
  }
  return best.nick;
}

export function tournamentTeamRecords(t: Tournament, teamId = 'user') {
  const team = t.teams.find((candidate) => candidate.id === teamId);
  let bestRating = 0;
  let bestRatingPlayer = '';
  let biggestFrag = 0;
  let biggestFragPlayer = '';

  for (const player of team?.players ?? []) {
    const lines = playerLines(t, player.id);
    for (const line of lines) {
      if (line.kills > biggestFrag) {
        biggestFrag = line.kills;
        biggestFragPlayer = player.nick;
      }
    }
    if (!lines.length) continue;
    const rating = computeDisplay(mergeLines(lines)).rating;
    if (rating > bestRating) {
      bestRating = rating;
      bestRatingPlayer = player.nick;
    }
  }

  return {
    bestRating: Number(bestRating.toFixed(2)),
    bestRatingPlayer,
    biggestFrag,
    biggestFragPlayer,
  };
}
