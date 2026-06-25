/** Navegação interna do modo carreira com histórico estilo browser. */

import { careerPlayerPath, parseCareerPlayerId, isCareerPlayerPath } from './career-player-route';
import { careerTeamPath, parseCareerTeamId, isCareerTeamPath } from './career-team-route';

type CareerHistoryState = {
  screen?: 'career';
  careerNavReady?: boolean;
  careerDepth?: number;
  careerPlayer?: string;
  careerTeam?: string;
};

function histState(): CareerHistoryState {
  return (window.history.state as CareerHistoryState) ?? {};
}

function currentDepth(): number {
  return histState().careerDepth ?? 0;
}

function nextDepth(): number {
  return currentDepth() + 1;
}

export function initCareerNav(pathname = window.location.pathname): void {
  if (histState().careerNavReady) return;
  window.history.replaceState(
    { screen: 'career', careerNavReady: true, careerDepth: 0 },
    '',
    pathname,
  );
}

export function navigateCareerHub(): void {
  window.history.pushState(
    { screen: 'career', careerNavReady: true, careerDepth: nextDepth() },
    '',
    '/carreira',
  );
}

export function navigateCareerPlayer(playerId: string): void {
  window.history.pushState(
    { screen: 'career', careerNavReady: true, careerDepth: nextDepth(), careerPlayer: playerId },
    '',
    careerPlayerPath(playerId),
  );
}

export function navigateCareerTeam(teamId: string): void {
  window.history.pushState(
    { screen: 'career', careerNavReady: true, careerDepth: nextDepth(), careerTeam: teamId },
    '',
    careerTeamPath(teamId),
  );
}

export function careerHistoryBack(): void {
  window.history.back();
}

export function careerHistoryForward(): void {
  window.history.forward();
}

/** Há tela anterior dentro da sessão de carreira (time → jogador, etc.). */
export function canCareerGoBack(): boolean {
  return currentDepth() > 0 || isCareerPlayerPath() || isCareerTeamPath();
}

export function syncCareerRoutesFromUrl(): {
  playerId: string | null;
  teamId: string | null;
} {
  return {
    playerId: parseCareerPlayerId(),
    teamId: parseCareerTeamId(),
  };
}

export { parseCareerPlayerId, parseCareerTeamId, isCareerPlayerPath, isCareerTeamPath, careerPlayerPath, careerTeamPath };
