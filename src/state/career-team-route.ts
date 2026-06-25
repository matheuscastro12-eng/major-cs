/** Rota de perfil de time no modo carreira: /carreira/time/:id */

export function parseCareerTeamId(pathname = window.location.pathname): string | null {
  const m = pathname.match(/^\/carreira\/time\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export function careerTeamPath(teamId: string): string {
  return `/carreira/time/${encodeURIComponent(teamId)}`;
}

export function navigateCareerTeam(teamId: string): void {
  window.history.pushState({ screen: 'career', careerTeam: teamId }, '', careerTeamPath(teamId));
}

export function closeCareerTeamRoute(): void {
  window.history.pushState({ screen: 'career' }, '', '/carreira');
}

export function isCareerTeamPath(pathname = window.location.pathname): boolean {
  return /^\/carreira\/time\//i.test(pathname);
}
