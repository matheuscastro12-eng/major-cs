/** Navegação interna do modo carreira com histórico estilo browser. As
 *  entradas entram na pilha do app (state/app-history): o Voltar do shell e o
 *  do navegador passam por elas sem sair do jogo. */

import { appGoForward, canAppGoBack, pushAppEntry, replaceAppEntry } from './app-history';
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
  // preserva o resto do estado (tela, posição na pilha do app, seção)
  replaceAppEntry({ ...histState(), screen: 'career', careerNavReady: true, careerDepth: 0 }, pathname);
}

export function navigateCareerHub(): void {
  pushAppEntry({ screen: 'career', careerNavReady: true, careerDepth: nextDepth() }, '/carreira');
}

export function navigateCareerPlayer(playerId: string): void {
  pushAppEntry({ screen: 'career', careerNavReady: true, careerDepth: nextDepth(), careerPlayer: playerId }, careerPlayerPath(playerId));
}

export function navigateCareerTeam(teamId: string): void {
  pushAppEntry({ screen: 'career', careerNavReady: true, careerDepth: nextDepth(), careerTeam: teamId }, careerTeamPath(teamId));
}

/** Fecha o perfil: volta uma entrada se houver tela anterior no jogo; se o
 *  perfil foi aberto por link direto, troca a entrada pelo hub da carreira
 *  (sem sair do app) e avisa as telas como num voltar. */
export function careerHistoryBack(): void {
  if (canAppGoBack()) { window.history.back(); return; }
  const rest = { ...histState() };
  delete rest.careerPlayer;
  delete rest.careerTeam;
  replaceAppEntry({ ...rest, screen: 'career', careerNavReady: true, careerDepth: 0 }, '/carreira');
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

export function careerHistoryForward(): void {
  appGoForward();
}

/** Há tela anterior dentro do jogo (seção, perfil, outro modo). */
export function canCareerGoBack(): boolean {
  return canAppGoBack();
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
